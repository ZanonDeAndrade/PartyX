"""Confere um arquivo de variáveis NÃO secretas do Cloud Run (infra/*/env.*.yaml) antes do build.

Uso: python3 -I infra/env-check.py <arquivo> <homologacao|producao> [obrigatória extra ...]
Saída (stdout): atribuições de shell (NOME='valor') das variáveis que o deploy.sh usa nas próprias conferências. Erros vão para o
stderr com código 1. Nenhum valor de segredo passa por aqui: nomes com cara de segredo são recusados.

Formato aceito (subconjunto do YAML que o gcloud lê igual): comentários, linhas em branco e `NOME: "valor"`, com o valor sempre entre
aspas duplas e sem aspas duplas dentro. Qualquer outra linha é recusada, para o que este conferidor vê ser o mesmo que o gcloud aplica.
"""

import re
import shlex
import sys

LINE = re.compile(r'^([A-Z][A-Z0-9_]*): "([^"]*)"\s*(#.*)?$')
# Segredos ficam no Secret Manager. As chaves públicas de verdade (TURNSTILE_SITE_KEY) são a exceção.
SECRET_LIKE = re.compile(r'(SECRET|TOKEN|PASSWORD|PASS|DATABASE_URL|SMTP_URL|QR_HMAC_KEYS|PRIVATE|CREDENTIAL|_KEY$|_KEYS$)')
PUBLIC_OK = {'TURNSTILE_SITE_KEY'}
REQUIRED = [
    'NODE_ENV', 'NODE_OPTIONS', 'APP_ENV', 'DB_POOL_MAX', 'TRUSTED_PROXY_HOPS', 'PUBLIC_BASE_URL', 'BANNER_BUCKET',
    'JOBS_AUDIENCE', 'JOBS_CALLER_EMAIL', 'TASKS_QUEUE', 'TASKS_INVOKER_EMAIL', 'TURNSTILE_ENABLED', 'PAYMENT_GATEWAY',
    'LEGAL_CONTENT_DIR', 'MAINTENANCE_MODE',
]
EXPORT = ['APP_ENV', 'PUBLIC_BASE_URL', 'PUBLIC_HOST_CHECK', 'PAYMENT_GATEWAY', 'GATEWAY_ENVIRONMENT', 'MP_COLLECTOR_ID',
          'HOMOLOGACAO_GATEWAY_FICTICIO', 'JOBS_AUDIENCE', 'NODE_OPTIONS', 'EMAIL_FROM', 'TURNSTILE_ENABLED', 'TURNSTILE_SITE_KEY']


def main() -> int:
    if len(sys.argv) < 3:
        print('uso: env-check.py <arquivo> <homologacao|producao> [obrigatória extra ...]', file=sys.stderr)
        return 2
    path, env, extra = sys.argv[1], sys.argv[2], sys.argv[3:]
    values: dict[str, str] = {}
    problems: list[str] = []
    with open(path, encoding='utf-8') as f:
        for n, raw in enumerate(f, 1):
            line = raw.rstrip('\n')
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            m = LINE.match(line)
            if not m:
                problems.append(f'linha {n}: formato não aceito (use NOME: "valor")')
                continue
            name, value = m.group(1), m.group(2)
            if name in values:
                problems.append(f'linha {n}: {name} repetida')
            if SECRET_LIKE.search(name) and name not in PUBLIC_OK:
                problems.append(f'linha {n}: {name} parece segredo; segredos ficam no Secret Manager')
            values[name] = value
    for name in REQUIRED + extra:
        if not values.get(name):
            problems.append(f'{name} obrigatória e vazia ou ausente')
    if values.get('APP_ENV') and values['APP_ENV'] != env:
        problems.append(f'APP_ENV é {values["APP_ENV"]}, esperado {env}')
    gateway = values.get('PAYMENT_GATEWAY', '')
    if gateway == 'mercadopago':
        if not re.fullmatch(r'\d{1,20}', values.get('MP_COLLECTOR_ID', '')):
            problems.append('PAYMENT_GATEWAY=mercadopago exige MP_COLLECTOR_ID (só dígitos)')
        wanted = 'sandbox' if env == 'homologacao' else 'producao'
        if values.get('GATEWAY_ENVIRONMENT') != wanted:
            problems.append(f'PAYMENT_GATEWAY=mercadopago em {env} exige GATEWAY_ENVIRONMENT={wanted}')
    elif gateway == 'mock':
        if env != 'homologacao' or values.get('HOMOLOGACAO_GATEWAY_FICTICIO') != 'true':
            problems.append('gateway fictício só em homologação, com HOMOLOGACAO_GATEWAY_FICTICIO=true')
    elif gateway != 'none':
        problems.append(f'PAYMENT_GATEWAY inválido: {gateway!r}')
    if env == 'producao':
        for name, bad in (('GATEWAY_ENVIRONMENT', 'sandbox'), ('ENABLE_PROTOTYPE', 'true'), ('PUBLIC_HOST_CHECK', 'false')):
            if values.get(name) == bad:
                problems.append(f'{name}={bad} é proibido em produção')
    if env == 'producao' and 'EMAIL_ALLOWLIST' in values:
        problems.append('EMAIL_ALLOWLIST é proibida em produção (lá todos os destinatários recebem)')
    if values.get('TURNSTILE_ENABLED') == 'true' and not values.get('TURNSTILE_SITE_KEY'):
        problems.append('TURNSTILE_ENABLED=true exige TURNSTILE_SITE_KEY')
    from_ = values.get('EMAIL_FROM', '')
    if from_ and re.search(r'@exemplo\.com\b', from_):
        problems.append('EMAIL_FROM com exemplo.com não é aceito')
    if problems:
        print(f'Recuso {path}:', file=sys.stderr)
        for p in problems:
            print(f'  - {p}', file=sys.stderr)
        return 1
    for name in EXPORT:
        print(f'ENVF_{name}={shlex.quote(values.get(name, ""))}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
