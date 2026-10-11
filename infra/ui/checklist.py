"""Gera docs/ui/checklist-telas.md e docs/ui/comparativo.md a partir dos manifestos de captura (antes e depois).

Uso: python3 infra/ui/checklist.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / 'docs' / 'ui'
before = json.loads((UI / 'antes' / 'manifest.json').read_text())
after = [row for f in sorted((UI / 'depois').glob('manifest*.json')) for row in json.loads(f.read_text())]

NAMES = {
    'P01': 'Página inicial', 'P02': 'Listagem e busca', 'P03': 'Página do evento', 'P04': 'Termos de Uso',
    'P05': 'Privacidade', 'P06': 'Cancelamento e meia-entrada', 'P07': 'Não encontrada',
    'A01': 'Login', 'A02': 'Cadastro', 'A03': 'Recuperar senha', 'A04': 'Confirmação da solicitação',
    'A05': 'Nova senha', 'A06': 'Senha alterada',
    'C01': 'Seleção de ingressos', 'C02': 'Revisão do pedido', 'C03': 'Forma de pagamento', 'C04': 'Pix',
    'C05': 'Cartão', 'C06': 'Em processamento', 'C07': 'Compra confirmada', 'C08': 'Reserva expirada',
    'C09': 'Pagamento recusado', 'C10': 'Pago sem estoque',
    'U01': 'Meus ingressos', 'U02': 'Minhas compras', 'U03': 'Detalhe da compra', 'U04': 'Ingresso',
    'U05': 'Tela cheia', 'U06': 'Minha conta', 'U07': 'Alterar senha',
    'ADM01': 'Visão geral', 'ADM02': 'Eventos', 'ADM03': 'Criar e editar evento', 'ADM04': 'Gestão do evento',
    'ADM05': 'Tipos de ingresso', 'ADM06': 'Criar tipo', 'ADM07': 'Promoters', 'ADM08': 'Criar promoter',
    'ADM09': 'Detalhe do promoter', 'ADM10': 'Pedidos', 'ADM11': 'Detalhe do pedido e exceções',
    'ADM12': 'Compradores', 'ADM13': 'Detalhe do comprador', 'ADM14': 'Ingressos', 'ADM15': 'Ingresso e cancelamento',
    'ADM16': 'Relatório de vendas', 'ADM17': 'Ranking de promoters', 'ADM18': 'Taxa mensal', 'ADM19': 'Entradas',
    'ADM20': 'Equipe', 'ADM21': 'Criar usuário', 'ADM22': 'Primeiro acesso', 'ADM23': 'Exportações e contingência',
    'ADM24': 'Conta do administrador',
    'V01': 'Selecionar evento', 'V02': 'Leitor por câmera', 'V03': 'Busca manual', 'V04': 'Resultado da busca',
    'V05': 'Válido', 'V06': 'Já utilizado', 'V07': 'Inválido ou cancelado', 'V08': 'Outro evento', 'V09': 'Falha',
    'G04': 'Acesso negado', 'G05': 'Sessão expirada', 'G07': 'Menus e gavetas', 'INTRO': 'Abertura em vídeo',
    'E01': 'E-mail de cadastro', 'E02': 'E-mail de recuperação', 'E03': 'E-mail de compra', 'E04': 'PDF do ingresso',
    'E05': 'Compartilhamento',
}
ORDER = ['P', 'A', 'C', 'U', 'V', 'ADM', 'G', 'INTRO', 'E']


def key(row):
    sid = row['id']
    prefix = next(p for p in sorted(ORDER, key=len, reverse=True) if sid.startswith(p))
    num = sid[len(prefix):]
    return (ORDER.index(prefix), int(num) if num.isdigit() else 0, row['state'])


def group(rows):
    out: dict[tuple[str, str], dict] = {}
    for r in rows:
        k = (r['id'], r['state'])
        g = out.setdefault(k, {'id': r['id'], 'state': r['state'], 'route': r['route'], 'files': {}})
        if r.get('file'):
            g['files'][r['width']] = r['file']
    return out


B, A = group(before), group(after)
keys = sorted(set(B) | set(A), key=lambda k: key({'id': k[0], 'state': k[1]}))
after_widths = sorted({r['width'] for r in after if r.get('file') and r['width']})


def links(files, folder):
    return ' '.join(f"[{w or 'pdf'}]({folder}/{f})" for w, f in sorted(files.items())) or 'sem captura'


lines = [
    '# Checklist de telas e estados',
    '',
    'Gerado por `infra/ui/checklist.py` a partir de `antes/manifest.json` e `depois/manifest.json`. Uma linha por tela e estado.',
    'Status **concluído** = há captura depois do refinamento em todas as larguras pedidas (360, 390, 768 e 1440 px; e-mails e PDF',
    'em largura própria). Rotas com `:id` usam os dados fictícios de `infra/ui/seed-ui.mts` e `flows-ui.mts`.',
    '',
    '| ID | Tela | Rota | Estado | Antes | Depois | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
]
done = 0
for k in keys:
    b, a = B.get(k), A.get(k)
    g = a or b
    route = g['route'].replace('|', '\\|')
    if len(route) > 60:
        route = route[:57] + '...'
    ok = bool(a) and (k[0] == 'E04' or all(w in a['files'] for w in (after_widths or [1])) and len(a['files']) > 0)
    done += ok
    lines.append(
        f"| {k[0]} | {NAMES.get(k[0], '')} | `{route}` | {k[1]} | {links(b['files'], 'antes') if b else 'novo'} | "
        f"{links(a['files'], 'depois') if a else 'pendente'} | {'concluído' if ok else 'pendente'} |"
    )
lines += ['', f'**{done} de {len(keys)} estados concluídos.**', '']
lines += [
    '## Itens do inventário cobertos por outra captura',
    '',
    '| ID | Onde está |',
    '| --- | --- |',
    '| C05, C06 | Cartão vai para a página segura do gateway (C05); "pagamento confirmado, preparando ingressos" (C06) |',
    '| U03 | Detalhe da compra é a página do pedido (`/pedido/:id`): estados C03 a C10 e U03 |',
    '| ADM23 | Exportações: links de CSV/XLSX nas listas e relatórios e a aba Contingência (CSV e PDF) |',
    '| G01, G03 | Estados "carregando" e "erro" de P01, P02, P03, U01, ADM01 e checkout |',
    '| G02 | Vazios: P01 sem eventos, P02 nenhum resultado, U01 sem ingressos, U02 sem compras, V04 nenhum resultado |',
    '| G06 | Manutenção: não existe no site real; registrado em `sugestoes-futuras.md` (depende de regra de servidor) |',
    '| G08 | Exportação em andamento, concluída ou com erro: componente `ExportLink` nas telas do painel |',
    '',
]
(UI / 'checklist-telas.md').write_text('\n'.join(lines))

# Comparativo antes x depois: uma seção por ID, com a mesma largura lado a lado (390 e 1440).
comp = [
    '# Comparativo antes x depois',
    '',
    'Mesmos dados fictícios, mesmas rotas. Imagens completas em `antes/` e `depois/`. Gerado por `infra/ui/checklist.py`.',
    '',
]
current = None
for k in keys:
    b, a = B.get(k), A.get(k)
    if k[0] != current:
        current = k[0]
        comp += [f"## {k[0]} {NAMES.get(k[0], '')}", '']
    comp.append(f'**{k[1]}**')
    comp.append('')
    comp.append('| Largura | Antes | Depois |')
    comp.append('| --- | --- | --- |')
    for w in (390, 1440) if k[0] != 'E04' else (0,):
        bf = b['files'].get(w) if b else None
        af = a['files'].get(w) if a else None
        comp.append(
            f"| {w or 'PDF'} | {f'![](antes/{bf})' if bf else '(sem captura)'} | {f'![](depois/{af})' if af else '(pendente)'} |"
        )
    if k[0] == 'E04':
        for w in (0,):
            pass
    comp.append('')
(UI / 'comparativo.md').write_text('\n'.join(comp))
print('estados', len(keys), 'concluídos', done)
