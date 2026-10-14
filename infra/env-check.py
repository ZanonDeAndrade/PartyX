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
# Segredos ficam no Secret Manager. As exceções são nomes conhecidos que não guardam segredo: a chave pública do Turnstile e o prazo,
# em dias, de retenção dos códigos de recuperação de senha (o "PASSWORD" do nome é o assunto, não o valor).
SECRET_LIKE = re.compile(r'(SECRET|TOKEN|PASSWORD|PASS|DATABASE_URL|SMTP_URL|QR_HMAC_KEYS|PRIVATE|CREDENTIAL|_KEY$|_KEYS$)')
PUBLIC_OK = {'TURNSTILE_SITE_KEY', 'RETENTION_PASSWORD_RESETS_DAYS'}
REQUIRED = [
    'NODE_ENV', 'NODE_OPTIONS', 'APP_ENV', 'DB_POOL_MAX', 'TRUSTED_PROXY_HOPS', 'PUBLIC_BASE_URL', 'BANNER_BUCKET',
    'JOBS_AUDIENCE', 'JOBS_CALLER_EMAIL', 'TASKS_QUEUE', 'TASKS_INVOKER_EMAIL', 'TURNSTILE_ENABLED', 'PAYMENT_GATEWAY',
    'LEGAL_CONTENT_DIR', 'MAINTENANCE_MODE',
]
# Em produção, venda, cadastro e aprovação visual precisam estar ESCRITOS no arquivo (nunca valer por padrão do código).
REQUIRED_PRODUCAO = ['SALES_OPEN', 'SIGNUP_OPEN', 'VISUAL_APPROVED', 'QR_HMAC_CURRENT', 'GLOBAL_SIGNUPS_PER_HOUR',
                     'SIGNUPS_PER_IP_PER_HOUR', 'GLOBAL_RECOVERIES_PER_HOUR', 'RESERVATION_MINUTES']
# Sempre exportadas para o deploy.sh (vazias quando ausentes); as demais variáveis do arquivo também saem, com o mesmo prefixo.
EXPORT = ['APP_ENV', 'PUBLIC_BASE_URL', 'PUBLIC_HOST_CHECK', 'PAYMENT_GATEWAY', 'GATEWAY_ENVIRONMENT', 'MP_COLLECTOR_ID',
          'HOMOLOGACAO_GATEWAY_FICTICIO', 'JOBS_AUDIENCE', 'NODE_OPTIONS', 'EMAIL_FROM', 'TURNSTILE_ENABLED', 'TURNSTILE_SITE_KEY',
          'SALES_OPEN', 'SIGNUP_OPEN', 'VISUAL_APPROVED', 'MAINTENANCE_MODE', 'TERMS_VERSION', 'TERMS_DATE', 'PRIVACY_VERSION',
          'PRIVACY_DATE', 'CANCELLATION_VERSION', 'CANCELLATION_DATE', 'BANNER_BUCKET', 'TASKS_QUEUE', 'JOBS_CALLER_EMAIL',
          'TASKS_INVOKER_EMAIL']


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
    for name in REQUIRED + (REQUIRED_PRODUCAO if env == 'producao' else []) + extra:
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
        for name in ('SALES_OPEN', 'SIGNUP_OPEN', 'VISUAL_APPROVED', 'MAINTENANCE_MODE', 'TURNSTILE_ENABLED'):
            if values.get(name) not in (None, '', 'true', 'false'):
                problems.append(f'{name} precisa ser "true" ou "false"')
        if values.get('TURNSTILE_SITE_KEY', '').startswith(('1x', '2x', '3x')):
            problems.append('TURNSTILE_SITE_KEY é a chave de TESTE da Cloudflare: não vale em produção')
        if not values.get('PUBLIC_BASE_URL', '').startswith('https://'):
            problems.append('PUBLIC_BASE_URL de produção precisa ser https')
        if 'hml' in values.get('PUBLIC_BASE_URL', '') or 'hml' in values.get('BANNER_BUCKET', '') or 'hml' in values.get('TASKS_QUEUE', ''):
            problems.append('endereço, bucket ou fila de HOMOLOGAÇÃO no arquivo de produção')
    if env == 'homologacao' and 'producao' in (values.get('BANNER_BUCKET', '') + values.get('TASKS_QUEUE', '') + values.get('PUBLIC_BASE_URL', '')):
        problems.append('endereço, bucket ou fila de PRODUÇÃO no arquivo de homologação')
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
    for name in dict.fromkeys(EXPORT + list(values)):
        print(f'ENVF_{name}={shlex.quote(values.get(name, ""))}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
