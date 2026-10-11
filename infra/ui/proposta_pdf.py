"""Gera docs/entrega/proposta-visual-PartyX.pdf a partir das capturas de docs/ui/depois/ (dados fictícios).

Uso: python3 infra/ui/proposta_pdf.py
Recorta cada captura (celular: topo da página; computador: primeira tela), monta páginas A4 deitadas em HTML com as fontes do
site e imprime em PDF com o Chromium do Playwright. Texto para o cliente: sem jargão técnico e sem travessão.
"""
import shutil
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'docs' / 'ui' / 'depois'
OUT = ROOT / 'docs' / 'entrega' / 'proposta-visual-PartyX.pdf'
NM = ROOT / 'node_modules'
FONTS = {
    'BS': NM / '@fontsource-variable/big-shoulders-display/files/big-shoulders-display-latin-wght-normal.woff2',
    'BSS': NM / '@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-800-normal.woff2',
    'AR': NM / '@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2',
    'MONO': NM / '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
}

work = Path(tempfile.mkdtemp(prefix='px-proposta-'))


def crop(name: str, width: int, top: int = 0, height: int | None = None) -> str:
    """Recorte da captura `<name>__<width>.jpg`, salvo na pasta temporária. Devolve o nome do arquivo."""
    im = Image.open(SHOTS / f'{name}__{width}.jpg')
    h = height or (1100 if width < 768 else 900)
    box = (0, top, im.width, min(im.height, top + h))
    out = f'{name}-{width}-{top}.jpg'
    im.crop(box).convert('RGB').save(work / out, quality=82)
    return out


def phone(img: str, label: str = 'Celular') -> str:
    return f'<figure class="phone"><img src="{img}" alt=""><figcaption>{label}</figcaption></figure>'


def desktop(img: str, label: str = 'Computador') -> str:
    return f'<figure class="desk"><img src="{img}" alt=""><figcaption>{label}</figcaption></figure>'


def page(title: str, text: str, figures: str, number: int) -> str:
    return f"""<section class="page">
  <header><span class="num">{number:02d}</span><h2>{title}</h2><p>{text}</p></header>
  <div class="figs">{figures}</div>
</section>"""


SWATCHES = [
    ('#0B0B10', 'Preto da marca', 'Vitrine, cabeçalho, portaria e menu do painel', '#fff'),
    ('#15151E', 'Superfície escura', 'Blocos sobre o preto', '#fff'),
    ('#FFFFFF', 'Branco', 'Cartões, formulários e o painel de ingressos', '#0B0B10'),
    ('#F7F7FA', 'Fundo claro', 'Compra, área do cliente e painel', '#0B0B10'),
    ('#7C3AED', 'Roxo de ação', 'Botões principais e o bloco da data', '#fff'),
    ('#C4B5FD', 'Lilás', 'Links e destaques sobre o preto', '#0B0B10'),
]
STATES = [
    ('#15803D', 'Verde', 'Aprovado, válido, entrada liberada', '#fff'),
    ('#FACC15', 'Amarelo', 'Atenção, aguardando, já utilizado', '#1C1500'),
    ('#B91C1C', 'Vermelho', 'Recusado, cancelado, inválido', '#fff'),
]


def swatch(c, name, use, fg):
    border = 'border:1px solid #E4E4EC;' if c in ('#FFFFFF', '#F7F7FA') else ''
    return f'<li><span class="chip" style="background:{c};color:{fg};{border}">{c}</span><b>{name}</b><small>{use}</small></li>'


pages = []
n = 1
pages.append(page(
    'Paleta e fontes',
    'Preto, branco e roxo, como pede a marca. Verde, amarelo e vermelho aparecem só para mostrar situação. '
    'O corte diagonal do X do logotipo virou o detalhe da marca, no canto do bloco da data.',
    f"""<div class="brand">
      <div><h3>Cores</h3><ul class="sw">{''.join(swatch(*s) for s in SWATCHES)}</ul>
      <h3>Só para situação</h3><ul class="sw sw-3">{''.join(swatch(*s) for s in STATES)}</ul></div>
      <div><h3>Fontes</h3>
        <div class="font"><span class="f-bs">NOITE ROXA</span><b>Big Shoulders</b><small>Nomes de evento, datas e números grandes, como num cartaz.</small></div>
        <div class="font"><span class="f-ar">Comprar ingressos</span><b>Archivo</b><small>Todo o texto de leitura, botões e formulários.</small></div>
        <div class="font"><span class="f-mono">PX-AW9K-5UUT</span><b>IBM Plex Mono</b><small>Só em códigos, como o do ingresso.</small></div>
        <h3>Detalhe da marca</h3>
        <div class="stubrow"><span class="stub"><b>23</b><i>OUT</i></span><small>O bloco da data tem o canto cortado na mesma diagonal do X do logotipo.</small></div>
      </div></div>""",
    n,
)); n += 1

SCREENS = [
    ('Página inicial', 'O evento em destaque ocupa a tela como um cartaz: nome grande, data no bloco roxo e o botão de compra à vista.',
     phone(crop('P01__carregado', 390)) + desktop(crop('P01__carregado', 1440))),
    ('Página do evento', 'Data, local e classificação lado a lado. Os ingressos ficam num painel branco, o bloco mais fácil de ler da página.',
     phone(crop('P03__disponivel-com-tipo-esgotado-e-desativado', 390)) + desktop(crop('P03__disponivel-com-tipo-esgotado-e-desativado', 1440))),
    ('Pagamento com Pix', 'O tempo da reserva fica no alto e o QR do Pix num bloco roxo, diferente do QR do ingresso, com o código para copiar logo ao lado.',
     phone(crop('C04__pix-aguardando-pagamento', 390, height=1000)) + desktop(crop('C04__pix-aguardando-pagamento', 1440, height=755))),
    ('Compra confirmada', 'Os ingressos aparecem entrando numa carteira, um para cada ingresso comprado, com o atalho para Meus ingressos.',
     phone(crop('C07__compra-confirmada', 390, height=875)) + desktop(crop('C07__compra-confirmada', 1440, height=790))),
    ('Meus ingressos', 'Os ingressos ficam agrupados por evento e empilhados, com o que vale para entrar sempre por cima.',
     phone(crop('U01__proximos', 390, height=1000)) + desktop(crop('U01__proximos', 1440))),
    ('Ingresso e tela cheia', 'QR grande, preto sobre branco e com margem para a leitura, sem cor ou efeito sobre o código. Na tela cheia, só o essencial.',
     phone(crop('U04__valido', 390, height=1000), 'Ingresso') + phone(crop('U05__tela-cheia-valido', 390, height=844), 'Tela cheia')),
    ('Portaria', 'Verde, amarelo e vermelho ocupam a tela inteira, com símbolo e texto para ler de longe. O botão de próxima leitura é grande.',
     phone(crop('V05__entrada-liberada', 390, height=844), 'Entrada liberada')
     + phone(crop('V06__ingresso-ja-utilizado', 390, height=844), 'Já utilizado')
     + phone(crop('V07__ingresso-cancelado', 390, height=844), 'Cancelado')),
    ('Painel: visão geral', 'Menu preto à esquerda, vendas do dia e do mês em números grandes e tabelas simples para conferir. '
     'Quando um pagamento precisa de atenção da equipe, um aviso vermelho fica no alto de todas as telas do painel até ser resolvido.',
     phone(crop('ADM01__visao-geral', 390)) + desktop(crop('ADM01__visao-geral', 1440))),
    ('Painel: eventos', 'Cada evento mostra a situação, as vendas e as ações possíveis no mesmo lugar.',
     phone(crop('ADM02__lista-de-eventos', 390)) + desktop(crop('ADM02__lista-de-eventos', 1440))),
    ('Painel: criar evento', 'Formulário em uma coluna, com cada erro escrito junto do campo que precisa de ajuste.',
     phone(crop('ADM03__criar-evento', 390)) + desktop(crop('ADM03__criar-evento', 1440))),
    ('Painel: relatório de vendas', 'Totais no alto, tabela por evento e tipo de ingresso e o botão para baixar a planilha.',
     phone(crop('ADM16__relatorio-de-vendas', 390)) + desktop(crop('ADM16__relatorio-de-vendas', 1440, height=1000))),
]
for title, text, figs in SCREENS:
    pages.append(page(title, text, figs, n))
    n += 1

for k, f in FONTS.items():
    shutil.copy(f, work / f'{k}.woff2')
shutil.copy(ROOT / 'public' / 'brand' / 'partyx-logo-print.png', work / 'logo.png')

html = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta visual PartyX</title><style>
@font-face {{ font-family: BS; src: url(BS.woff2); font-weight: 100 900; }}
@font-face {{ font-family: BSS; src: url(BSS.woff2); font-weight: 800; }}
@font-face {{ font-family: AR; src: url(AR.woff2); font-weight: 100 900; }}
@font-face {{ font-family: MONO; src: url(MONO.woff2); font-weight: 500; }}
@page {{ size: A4 landscape; margin: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; font-family: AR, sans-serif; color: #0B0B10; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: 297mm; height: 210mm; padding: 14mm 16mm 12mm; page-break-after: always; display: flex; flex-direction: column; background: #F7F7FA; overflow: hidden; }}
.page:last-child {{ page-break-after: auto; }}
header {{ display: grid; grid-template-columns: auto 1fr; column-gap: 6mm; align-items: baseline; margin-bottom: 7mm; }}
.num {{ font-family: BS; font-weight: 800; font-size: 13pt; color: #7C3AED; }}
h2 {{ margin: 0; font-family: BS; font-weight: 800; font-size: 30pt; line-height: .95; text-transform: uppercase; }}
header p {{ grid-column: 2; margin: 3mm 0 0; max-width: 170mm; font-size: 12pt; line-height: 1.45; color: #3F3F50; }}
.figs {{ flex: 1; min-height: 0; display: flex; gap: 10mm; align-items: flex-start; justify-content: center; }}
figure {{ margin: 0; display: flex; flex-direction: column; align-items: center; gap: 2.5mm; }}
figure img {{ display: block; border-radius: 3mm; box-shadow: 0 2mm 6mm rgba(11,11,16,.18); border: 1px solid #E4E4EC; }}
.phone img {{ height: 138mm; width: auto; }}
.desk img {{ width: 182mm; height: auto; max-height: 138mm; object-fit: cover; object-position: top; }}
figcaption {{ font-size: 9.5pt; font-weight: 600; color: #5B5B6E; }}
.cover {{ background: #0B0B10; color: #fff; justify-content: space-between; padding: 22mm 22mm 18mm; }}
.cover img {{ height: 34mm; width: auto; align-self: flex-start; }}
.cover h1 {{ margin: 0; font-family: BS; font-weight: 800; font-size: 76pt; line-height: .86; text-transform: uppercase; }}
.cover .sub {{ margin: 6mm 0 0; font-size: 15pt; color: #B9B9C9; max-width: 190mm; line-height: 1.4; }}
.cover .foot {{ display: flex; justify-content: space-between; align-items: flex-end; font-size: 10.5pt; color: #8B8BA0; gap: 10mm; }}
.cover .tag {{ display: inline-block; background: #7C3AED; color: #fff; padding: 2mm 6mm 2mm 4mm; font-weight: 700; font-size: 11pt; clip-path: polygon(0 0, 100% 0, calc(100% - 3mm) 100%, 0 100%); }}
.brand {{ display: grid; grid-template-columns: 1.1fr 1fr; gap: 14mm; }}
h3 {{ margin: 0 0 3mm; font-size: 11pt; font-weight: 700; color: #5B5B6E; }}
.sw {{ list-style: none; padding: 0; margin: 0 0 7mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }}
.sw li {{ display: flex; flex-direction: column; gap: 1mm; }}
.chip {{ display: flex; align-items: flex-end; height: 18mm; padding: 2mm 3mm; border-radius: 2mm; font-family: MONO; font-size: 8.5pt; }}
.sw b {{ font-size: 10.5pt; }}
.sw small, .font small, .stubrow small {{ font-size: 9pt; color: #5B5B6E; line-height: 1.35; }}
.font {{ display: grid; grid-template-columns: 1fr; padding: 3mm 0; border-bottom: 1px solid #E4E4EC; }}
.font span {{ font-size: 24pt; line-height: 1.1; }}
.f-bs {{ font-family: BS; font-weight: 800; font-size: 34pt !important; }}
.f-ar {{ font-family: AR; font-weight: 700; }}
.f-mono {{ font-family: MONO; }}
.stubrow {{ display: flex; align-items: center; gap: 6mm; margin-top: 2mm; }}
.stub {{ display: inline-grid; justify-items: center; padding: 2.5mm 4mm 4mm; background: #7C3AED; color: #fff; font-family: BS; font-weight: 800; line-height: .85; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5mm), calc(100% - 3.6mm) 100%, 0 100%); }}
.stub b {{ font-size: 30pt; }} .stub i {{ font-style: normal; font-size: 11pt; margin-top: 1mm; }}
</style></head><body>
<section class="page cover">
  <img src="logo.png" alt="PartyX">
  <div><span class="tag">Para aprovação por escrito</span><h1>Proposta<br>visual</h1>
  <p class="sub">Site de eventos, compra, ingressos, portaria e painel da PartyX, no celular e no computador.</p></div>
  <div class="foot"><span>Outubro de 2026</span><span>Todos os eventos, nomes, códigos e valores mostrados são fictícios.</span></div>
</section>
{''.join(pages)}
</body></html>"""
(work / 'proposta.html').write_text(html, encoding='utf-8')
OUT.parent.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page()
    p.goto((work / 'proposta.html').as_uri())
    p.wait_for_timeout(800)
    p.pdf(path=str(OUT), format='A4', landscape=True, print_background=True, prefer_css_page_size=True)
    b.close()
print(OUT, f'{OUT.stat().st_size / 1024:.0f} kB', 'páginas:', len(pages) + 1)
