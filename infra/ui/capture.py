"""Captura TODAS as telas e estados do PartyX com dados fictícios (docs/ui).

Uso: python3 infra/ui/capture.py <pasta-de-trabalho> <pasta-de-saída> <larguras separadas por vírgula> [filtro]
A pasta de trabalho é a de `up-ui.sh` (state-ui.json, seed-ui.json e run/.data/emails).
Gera <saída>/<ID>__<estado>__<largura>.jpg e <saída>/manifest.json.

Estados que não dá para produzir de verdade (carregando, falha de rede, últimos segundos da reserva) usam interceptação
de requisições no navegador; todos os outros vêm do servidor local com o gateway fictício.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

WORK = Path(sys.argv[1])
OUT = Path(sys.argv[2])
WIDTHS = [int(w) for w in sys.argv[3].split(',')]
FILTER = re.compile(sys.argv[4]) if len(sys.argv) > 4 else None
BASE = os.environ.get('BASE_URL', 'http://localhost:8099')
ROOT = Path(__file__).resolve().parents[2]
OUT.mkdir(parents=True, exist_ok=True)
S = json.loads((WORK / 'state-ui.json').read_text())
EV = S['events']
EMAILS = WORK / 'run' / '.data' / 'emails'
HEIGHT = {360: 780, 390: 844, 768: 1024, 1440: 900}
manifest: list[dict] = []
done_ids: set[str] = set()

PASS = {'admin': 'festa2026', 'validador': 'festa2026', 'primeiro': 'festa2026'}
LOGINS = {
    'marina': ('marina@partyx.test', 'festa2026Forte'),
    'lucas': ('lucas@partyx.test', 'festa2026Forte'),
    'joao': ('joao@partyx.test', 'festa2026Forte'),
    'admin': ('admin@partyx.test', 'festa2026'),
    'validador': ('validador@partyx.test', 'festa2026'),
    'primeiro': ('primeiro@partyx.test', 'festa2026'),
}
# Sem a abertura em vídeo nas capturas comuns (ela tem captura própria).
NO_INTRO = "try { sessionStorage.setItem('partyx_intro_seen', '1') } catch (e) {}"


def wanted(sid: str) -> bool:
    return FILTER is None or bool(FILTER.search(sid))


def shot(page, sid: str, route: str, state: str, width: int, full=True):
    # Janela ou gaveta aberta: captura só a tela visível (é o que a pessoa vê; a página por trás fica inerte).
    if full and page.locator('[aria-modal="true"]:visible').count() > 0:
        full = False
    name = f"{sid}__{re.sub(r'[^a-z0-9]+', '-', state.lower()).strip('-')}__{width}.jpg"
    if full:
        # Desce a página inteira para carregar as imagens com loading="lazy" e volta ao topo (cabeçalho fixo no lugar).
        page.evaluate("""async () => {
          const h = document.documentElement.scrollHeight;
          for (let y = 0; y < h; y += innerHeight / 2) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
          scrollTo(0, 0);
        }""")
    page.wait_for_timeout(350)
    if full:
        # Viewport do tamanho da página: barras fixas (compra no celular) aparecem no rodapé, como no aparelho.
        vp = page.viewport_size
        h = min(page.evaluate('document.documentElement.scrollHeight'), 14000)
        page.set_viewport_size({'width': vp['width'], 'height': max(h, vp['height'])})
        page.wait_for_timeout(150)
        page.screenshot(path=str(OUT / name), full_page=True, type='jpeg', quality=72, animations='disabled')
        page.set_viewport_size(vp)
    else:
        page.screenshot(path=str(OUT / name), full_page=False, type='jpeg', quality=72, animations='disabled')
    manifest.append({'id': sid, 'route': route, 'state': state, 'width': width, 'file': name})
    print('ok', name, flush=True)


def settle(page):
    try:
        page.wait_for_load_state('networkidle', timeout=6000)
    except Exception:
        pass


def api_login(ctx, who: str):
    email, pw = LOGINS[who]
    r = ctx.request.post(f'{BASE}/api/auth/login', data={'email': email, 'password': pw}, headers={'origin': BASE})
    assert r.status == 200, (who, r.status, r.text())


def new_ctx(browser, width: int, who: str | None, reduced=True, intro=False, perms=None):
    ctx = browser.new_context(
        viewport={'width': width, 'height': HEIGHT[width]},
        device_scale_factor=1,
        is_mobile=width < 768,
        has_touch=width < 768,
        reduced_motion='reduce' if reduced else 'no-preference',
        locale='pt-BR',
        timezone_id='America/Sao_Paulo',
        permissions=perms or [],
    )
    if not intro:
        ctx.add_init_script(NO_INTRO)
    if who:
        api_login(ctx, who)
    return ctx


def visit(ctx, route: str, before=None):
    page = ctx.new_page()
    if before:
        before(page)
    page.goto(BASE + route)
    settle(page)
    return page


def hang(pattern):
    """Requisição que nunca responde: estado de carregamento."""
    return lambda page: page.route(pattern, lambda r: None)


def fail(pattern):
    return lambda page: page.route(pattern, lambda r: r.abort())


def fulfill(pattern, body):
    return lambda page: page.route(
        pattern, lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(body))
    )


def cart(slug, items):
    data = json.dumps({'slug': slug, 'items': items})
    return lambda page: page.add_init_script(f"sessionStorage.setItem('px.cart', {json.dumps(data)})")


def types_of(slug):
    seed = json.loads((WORK / 'seed-ui.json').read_text())
    return seed['events'][slug]['types']


# ---------------------------------------------------------------------------------------------------------------------
# Lista de telas: (id, rota, estado, perfil, preparar(page) antes do goto, ação(page) depois)
# ---------------------------------------------------------------------------------------------------------------------
roxa = 'noite-roxa-warehouse'
T = types_of(roxa)


def click(text, role='button', exact=False):
    return lambda page: (page.get_by_role(role, name=text, exact=exact).first.click(), settle(page))


def fill(label, value):
    return lambda page: page.get_by_label(label, exact=True).first.fill(value)


def seq(*fns):
    def run(page):
        for f in fns:
            f(page)
    return run


def wait(ms):
    return lambda page: page.wait_for_timeout(ms)


def mobile_only(page):
    return page.viewport_size['width'] < 768


SCREENS = [
    # ----- público -----
    ('P01', '/', 'carregado', None, None, None),
    ('P01', '/', 'carregando', None, hang('**/api/public/home'), None),
    ('P01', '/', 'erro de carregamento', None, fail('**/api/public/home'), None),
    ('P01', '/', 'sem eventos', None, fulfill('**/api/public/home', {'featured': [], 'upcoming': []}), None),
    ('G07', '/', 'menu do celular aberto', 'marina', None, lambda p: mobile_only(p) and click('Abrir menu')(p)),
    ('P02', '/eventos', 'lista', None, None, None),
    ('P02', '/eventos?q=noite', 'busca com filtro', None, None, None),
    ('P02', '/eventos?q=inexistente&date=2030-01-01', 'nenhum resultado', None, None, None),
    ('P02', '/eventos', 'nenhuma venda disponivel', None, fulfill('**/api/public/events*', {'events': [], 'filtering': False}), None),
    ('P02', '/eventos', 'carregando', None, hang('**/api/public/events*'), None),
    ('P02', '/eventos', 'erro', None, fail('**/api/public/events*'), None),
    ('P03', f'/eventos/{roxa}', 'disponivel com tipo esgotado e desativado', None, None, None),
    ('C01', f'/eventos/{roxa}', 'selecao de ingressos', None, None,
     seq(click('Mais um Pista', exact=True), click('Mais um Pista', exact=True), click('Mais um VIP open bar'))),
    ('C01', f'/eventos/{roxa}', 'limite por compra atingido', None, None,
     seq(*[click('Mais um Pista', exact=True)] * 6)),
    ('P03', '/eventos/reveillon-ficticio-2027', 'vendas ainda nao iniciadas', None, None, None),
    ('P03', '/eventos/rosa-eletrica', 'esgotado', None, None, None),
    ('P03', '/eventos/domingo-de-ressaca', 'vendas encerradas', None, None, None),
    ('P03', '/eventos/pre-estreia-lotada', 'unidades reservadas', None, None, None),
    ('P03', '/eventos/halloween-ficticio', 'evento encerrado por link direto', None, None, None),
    ('P03', '/eventos/quinta-experimental', 'sem banner e sem atracoes', None, None, None),
    ('P03', f'/eventos/{roxa}', 'carregando', None, hang('**/api/public/events/*'), None),
    ('E05', f'/eventos/{roxa}', 'compartilhar com pre-visualizacao', None,
     lambda p: p.add_init_script('delete Navigator.prototype.share'), click('Compartilhar')),
    ('P04', '/termos-de-uso', 'texto nao fornecido', None, None, None),
    ('P05', '/privacidade', 'texto nao fornecido', None, None, None),
    ('P06', '/politica-de-cancelamento', 'texto nao fornecido', None, None, None),
    ('P07', '/pagina-que-nao-existe', 'pagina inexistente', None, None, None),
    ('P07', '/eventos/evento-que-nao-existe', 'evento inexistente', None, None, None),
    # ----- acesso -----
    ('A01', '/entrar', 'padrao', None, None, None),
    ('A01', '/entrar', 'credenciais incorretas', None, None,
     seq(fill('E-mail', 'ana@partyx.test'), fill('Senha', 'senha-errada-1'), click('Entrar', exact=True))),
    ('A01', '/entrar', 'bloqueio temporario', None,
     lambda p: p.route('**/api/auth/login', lambda r: r.fulfill(status=429, content_type='application/json', body=json.dumps(
         {'erro': {'codigo': 'login_bloqueado', 'mensagem': 'Muitas tentativas.'}}))),
     seq(fill('E-mail', 'marina@partyx.test'), fill('Senha', 'x'), click('Entrar', exact=True))),
    ('A01', '/entrar', 'conta desativada', None, None,
     seq(fill('E-mail', 'validador2@partyx.test'), fill('Senha', 'festa2026'), click('Entrar', exact=True))),
    ('A01', f'/entrar?voltar=/checkout/{roxa}', 'retorno ao checkout', None, None, None),
    ('A02', '/criar-conta', 'padrao', None, None, None),
    ('A02', '/criar-conta', 'campos incompletos', None, None, click('Criar conta', exact=True)),
    ('A02', '/criar-conta', 'cpf invalido e email ja cadastrado', None, None,
     seq(fill('Nome completo', 'Teste Fictício'), fill('E-mail', 'marina@partyx.test'), fill('CPF', '111.111.111-11'),
         fill('Telefone com DDD', '119'), fill('Senha', 'curta'), click('Criar conta', exact=True))),
    ('A02', f'/criar-conta?voltar=/checkout/{roxa}', 'retorno ao checkout', None, None, None),
    ('A03', '/recuperar-senha', 'padrao', None, None, None),
    ('A04', '/recuperar-senha', 'confirmacao neutra', None, None,
     seq(fill('E-mail', 'alguem@partyx.test'), click('Enviar link'))),
    ('A05', '/redefinir-senha?token=invalido', 'link invalido', None, None, None),
    ('A05', '/redefinir-senha?token=x', 'link expirado', None,
     fulfill('**/api/auth/password/check', {'estado': 'expirado'}), None),
    ('A05', '/redefinir-senha?token=x', 'link ja utilizado', None,
     fulfill('**/api/auth/password/check', {'estado': 'utilizado'}), None),
    ('A05', '/redefinir-senha?token=x', 'link valido', None, fulfill('**/api/auth/password/check', {'estado': 'valido'}), None),
    ('A05', '/redefinir-senha?token=x', 'senhas diferentes', None, fulfill('**/api/auth/password/check', {'estado': 'valido'}),
     seq(fill('Nova senha', 'festa2026Nova'), fill('Confirmar nova senha', 'outra2026'), click('Salvar nova senha'))),
    ('A06', '/redefinir-senha?token=x', 'senha alterada', None,
     seq(fulfill('**/api/auth/password/check', {'estado': 'valido'}),
         lambda p: p.route('**/api/auth/password/reset', lambda r: r.fulfill(status=200, content_type='application/json',
                                                                            body='{"mensagem":"ok"}'))),
     seq(fill('Nova senha', 'festa2026Nova'), fill('Confirmar nova senha', 'festa2026Nova'), click('Salvar nova senha'))),
    ('ADM22', '/primeiro-acesso', 'troca da senha temporaria', 'primeiro', None, None),
    # ----- checkout -----
    ('C02', f'/checkout/{roxa}', 'visitante vai ao login', None, cart(roxa, [{'ticketTypeId': T['Pista'], 'quantity': 2}]), None),
    ('C02', f'/checkout/{roxa}', 'revisao do pedido', 'marina',
     cart(roxa, [{'ticketTypeId': T['Pista'], 'quantity': 2}, {'ticketTypeId': T['VIP open bar'], 'quantity': 1}]), None),
    ('C02', f'/checkout/{roxa}', 'codigo do promoter valido', 'marina',
     cart(roxa, [{'ticketTypeId': T['Pista'], 'quantity': 2}]), seq(fill('Código', 'DUDA'), click('Aplicar'))),
    ('C02', f'/checkout/{roxa}', 'codigo do promoter invalido', 'marina',
     cart(roxa, [{'ticketTypeId': T['Pista'], 'quantity': 2}]), seq(fill('Código', 'NAOEXISTE'), click('Aplicar'))),
    ('C02', f'/checkout/{roxa}', 'codigo do promoter desativado', 'marina',
     cart(roxa, [{'ticketTypeId': T['Pista'], 'quantity': 2}]), seq(fill('Código', 'LEO'), click('Aplicar'))),
    ('C02', f'/checkout/{roxa}', 'estoque alterado', 'marina',
     cart(roxa, [{'ticketTypeId': T['Pista 1º lote'], 'quantity': 2}]), None),
    ('C02', f'/checkout/{roxa}', 'carrinho vazio', 'marina', None, None),
    ('C02', f'/checkout/{roxa}', 'conferindo disponibilidade', 'marina',
     seq(cart(roxa, [{'ticketTypeId': T['Pista'], 'quantity': 2}]), hang('**/api/checkout/quote')), None),
    ('C03', f"/pedido/{S['orderPendingNoMethod']}", 'escolha da forma de pagamento', 'marina', None, None),
    ('C03', f"/pedido/{S['orderPendingNoMethod']}", 'cartao selecionado', 'marina', None, click('Cartão de crédito', role='radio')),
    ('C04', f"/pedido/{S['orderPendingPix']}", 'pix aguardando pagamento', 'marina', None, None),
    ('C04', f"/pedido/{S['orderPendingPix']}", 'codigo pix copiado', 'marina', None, click('Copiar código Pix')),
    ('C04', f"/pedido/{S['orderPendingPix']}", 'ultimos 60 segundos da reserva', 'marina',
     lambda p: p.route(f"**/api/orders/{S['orderPendingPix']}", lambda r: (lambda resp: r.fulfill(
         response=resp, body=json.dumps({'order': {**resp.json()['order'], 'reservation': {
             **(resp.json()['order'].get('reservation') or {}), 'secondsLeft': 45}}})))(r.fetch())), None),
    ('C05', f"/pedido/{S['orderPendingCard']}", 'cartao em pagina segura do gateway', 'marina', None, None),
    ('C06', f"/pedido/{S['orderPaid']}", 'pagamento confirmado preparando ingressos', 'marina',
     fulfill('**/api/tickets', {'tickets': []}), None),
    ('C07', f"/pedido/{S['orderPaid']}", 'compra confirmada', 'marina', None, None),
    ('C08', f"/pedido/{S['orderExpired']}", 'reserva expirada', 'marina', None, None),
    ('C09', f"/pedido/{S['orderDeclined']}", 'pagamento recusado', 'marina', None, None),
    ('C10', f"/pedido/{S['orderNoStock']}", 'pago sem estoque', 'marina', None, None),
    ('U03', f"/pedido/{S['orderRefunded']}", 'pedido estornado', 'marina', None, None),
    ('U03', f"/pedido/{S['orderCancelled']}", 'pedido cancelado', 'marina', None, None),
    ('U03', '/pedido/00000000-0000-4000-8000-000000000000', 'pedido nao encontrado', 'marina', None, None),
    # ----- cliente -----
    ('U01', '/meus-ingressos', 'proximos', 'marina', None, None),
    ('U01', '/meus-ingressos', 'historico', 'marina', None, click('Histórico', role='tab')),
    ('U01', '/meus-ingressos', 'sem ingressos', 'lucas', None, None),
    ('U01', '/meus-ingressos', 'carregando', 'marina', hang('**/api/tickets'), None),
    ('U01', '/meus-ingressos', 'erro', 'marina', fail('**/api/tickets'), None),
    ('U02', '/minhas-compras', 'lista com todas as situacoes', 'marina', None, None),
    ('U02', '/minhas-compras', 'sem compras', 'lucas', None, None),
    ('U04', f"/ingressos/{S['ticketValid']}", 'valido', 'marina', None, None),
    ('U04', f"/ingressos/{S['ticketUsed']}", 'utilizado', 'marina', None, None),
    ('U04', f"/ingressos/{S['ticketCancelled']}", 'cancelado', 'marina', None, None),
    ('U04', '/ingressos/00000000-0000-4000-8000-000000000000', 'nao encontrado', 'marina', None, None),
    ('U05', f"/ingressos/{S['ticketValid']}/tela-cheia", 'tela cheia valido', 'marina', None, None),
    ('U05', f"/ingressos/{S['ticketCancelled']}/tela-cheia", 'tela cheia cancelado', 'marina', None, None),
    ('U06', '/minha-conta', 'dados', 'marina', None, None),
    ('U06', '/minha-conta', 'alteracoes salvas', 'marina', None, click('Salvar alterações')),
    ('U07', '/minha-conta', 'alterar senha', 'marina', None, click('Alterar senha')),
    ('U07', '/minha-conta', 'alterar senha com erro', 'marina', None,
     seq(click('Alterar senha'), fill('Senha atual', 'x'), fill('Nova senha', 'festa2026Nova'),
         fill('Confirmar nova senha', 'diferente1'), click('Salvar nova senha'))),
    # ----- portaria (sem câmera; os resultados vêm de capture_gate) -----
    ('V01', '/portaria', 'selecionar evento', 'validador', None, None),
    ('V02', f"/portaria/{EV[roxa]}", 'camera parada', 'validador', None, None),
    ('V02', f"/portaria/{EV[roxa]}", 'camera indisponivel', 'validador',
     lambda p: p.add_init_script("Object.defineProperty(navigator, 'mediaDevices', {value: undefined})"),
     click('Iniciar leitura')),
    ('V03', f"/portaria/{EV[roxa]}", 'busca manual', 'validador', None, click('Busca manual', role='tab')),
    ('V04', f"/portaria/{EV[roxa]}", 'resultado com homonimos', 'validador', None,
     seq(click('Busca manual', role='tab'), fill('Código, nome, CPF ou e-mail', 'Marina Costa'), click('Buscar', exact=True))),
    ('V04', f"/portaria/{EV[roxa]}", 'nenhum resultado', 'validador', None,
     seq(click('Busca manual', role='tab'), fill('Código, nome, CPF ou e-mail', 'Ninguém Fictício'), click('Buscar', exact=True))),
    ('V09', f"/portaria/{EV[roxa]}", 'sem conexao', 'validador', None,
     lambda p: (p.context.set_offline(True), p.wait_for_timeout(300))),
    ('G04', '/portaria', 'acesso negado ao cliente', 'marina', None, None),
    # G05: a sessão acaba no servidor durante o uso (a lista de ingressos responde 401): aviso no login, com retorno ao ponto.
    ('G05', '/meus-ingressos', 'sessao expirada com retorno', 'marina',
     lambda p: p.route('**/api/tickets', lambda r: r.fulfill(status=401, content_type='application/json', body=json.dumps(
         {'erro': {'codigo': 'nao_autenticado', 'mensagem': 'Entre na sua conta para continuar.'}}))),
     lambda p: p.wait_for_url('**/entrar?voltar=*', timeout=8000)),
    # ----- painel -----
    ('ADM01', '/admin', 'visao geral', 'admin', None, None),
    ('ADM01', '/admin', 'carregando', 'admin', hang('**/api/admin/overview*'), None),
    ('ADM01', '/admin', 'erro', 'admin', fail('**/api/admin/overview*'), None),
    ('G07', '/admin', 'menu do painel no celular', 'admin', None, lambda p: mobile_only(p) and click('Menu do painel')(p)),
    ('ADM02', '/admin/eventos', 'lista de eventos', 'admin', None, None),
    ('ADM03', '/admin/eventos/novo', 'criar evento', 'admin', None, None),
    ('ADM03', '/admin/eventos/novo', 'erros do formulario', 'admin', None, click('Salvar rascunho')),
    ('ADM03', f"/admin/eventos/{EV[roxa]}/editar", 'editar evento publicado', 'admin', None, None),
    ('ADM03', f"/admin/eventos/{EV['festival-rascunho']}/previa", 'pre-visualizacao', 'admin', None, None),
    ('ADM04', f"/admin/eventos/{EV[roxa]}", 'informacoes', 'admin', None, None),
    ('ADM04', f"/admin/eventos/{EV['festival-rascunho']}", 'rascunho', 'admin', None, None),
    ('ADM04', f"/admin/eventos/{EV['halloween-ficticio']}", 'encerrado', 'admin', None, None),
    ('ADM04', f"/admin/eventos/{EV[roxa]}", 'confirmar encerramento', 'admin', None, click('Encerrar evento')),
    ('ADM04', f"/admin/eventos/{EV['festival-rascunho']}", 'confirmar publicacao', 'admin', None, click('Publicar')),
    ('ADM05', f"/admin/eventos/{EV[roxa]}", 'tipos de ingresso', 'admin', None, click('Tipos de ingresso', role='tab')),
    ('ADM06', f"/admin/eventos/{EV[roxa]}", 'novo tipo de ingresso', 'admin', None,
     seq(click('Tipos de ingresso', role='tab'), click('Novo tipo de ingresso'))),
    ('ADM19', f"/admin/eventos/{EV[roxa]}", 'entradas ao vivo no evento', 'admin', None, click('Entradas ao vivo', role='tab')),
    ('ADM14', f"/admin/eventos/{EV[roxa]}", 'ingressos do evento', 'admin', None, click('Ingressos', role='tab')),
    ('ADM12', f"/admin/eventos/{EV[roxa]}", 'compradores do evento', 'admin', None, click('Compradores', role='tab')),
    ('ADM23', f"/admin/eventos/{EV[roxa]}", 'contingencia', 'admin', None, click('Contingência', role='tab')),
    ('ADM07', '/admin/promoters', 'lista', 'admin', None, None),
    ('ADM08', '/admin/promoters', 'novo promoter', 'admin', None, click('Novo promoter')),
    ('ADM08', '/admin/promoters', 'codigo repetido', 'admin', None,
     seq(click('Novo promoter'), fill('Nome', 'Teste Fictício'), fill('Código', 'DUDA'), click('Criar promoter'))),
    ('ADM09', '/admin/promoters', 'detalhe do promoter', 'admin', None,
     lambda p: (p.get_by_role('link', name=re.compile('Duda')).first.click(), settle(p))),
    ('ADM10', '/admin/pedidos', 'lista de pedidos', 'admin', None, None),
    ('ADM11', f"/admin/pedidos/{S['orderPaid']}", 'detalhe do pedido', 'admin', None, None),
    ('ADM11', f"/admin/pedidos/{S['orderNoStock']}", 'pago sem estoque', 'admin', None, None),
    ('ADM15', f"/admin/pedidos/{S['orderPaid']}", 'cancelar unidade', 'admin', None,
     lambda p: (p.locator('button:enabled', has_text=re.compile('^Cancelar$')).first.click(), settle(p))),
    ('ADM12', '/admin/compradores', 'compradores', 'admin', None, None),
    ('ADM13', '/admin/compradores', 'detalhe do comprador', 'admin', None,
     lambda p: (p.get_by_role('link', name=re.compile('Marina Costa')).first.click(), settle(p))),
    ('ADM13', '/admin/compradores', 'corrigir e-mail ou cpf', 'admin', None,
     seq(lambda p: (p.get_by_role('link', name=re.compile('Marina Costa')).first.click(), settle(p)),
         click('Corrigir e-mail ou CPF'))),
    ('ADM14', '/admin/ingressos', 'ingressos', 'admin', None, None),
    ('ADM15', f"/admin/ingressos/{S['ticketValid']}", 'detalhe do ingresso', 'admin', None, None),
    ('ADM15', f"/admin/ingressos/{S['ticketCancelled']}", 'ingresso cancelado', 'admin', None, None),
    ('ADM15', f"/admin/ingressos/{S['ticketValid']}", 'confirmar cancelamento', 'admin', None,
     lambda p: (p.get_by_role('button', name='Cancelar ingresso').first.click(force=True), settle(p))),
    ('ADM16', '/admin/relatorios/vendas', 'relatorio de vendas', 'admin', None, None),
    ('ADM17', '/admin/relatorios/promoters', 'ranking de promoters', 'admin', None, None),
    ('ADM18', '/admin/relatorios/taxa-mensal', 'taxa mensal', 'admin', None, None),
    ('ADM19', '/admin/entradas', 'acompanhamento das entradas', 'admin', None, None),
    ('ADM20', '/admin/equipe', 'equipe', 'admin', None, None),
    ('ADM21', '/admin/equipe', 'novo usuario', 'admin', None, click('Novo usuário')),
    ('ADM24', '/admin/conta', 'conta do administrador', 'admin', None, None),
    ('ADM24', '/admin/conta', 'alterar senha', 'admin', None, click('Alterar senha')),
    ('ADM11', '/admin/excecoes', 'excecoes de pagamento', 'admin', None, None),
    ('G04', '/admin', 'acesso negado ao validador', 'validador', None, None),
    ('G04', '/admin', 'acesso negado ao cliente', 'marina', None, None),
]


def capture_screens(pw):
    browser = pw.chromium.launch()
    for width in WIDTHS:
        for sid, route, state, who, before, action in SCREENS:
            key = f'{sid}:{state}'
            if not wanted(key):
                continue
            ctx = new_ctx(browser, width, who, perms=['clipboard-read', 'clipboard-write'])
            try:
                page = visit(ctx, route, before)
                if action:
                    action(page)
                    settle(page)
                shot(page, sid, route, state, width)
            except Exception as e:  # registra e segue: a lista de estados ausentes entra no diagnóstico
                print('FALHA', key, width, repr(e)[:300], flush=True)
                manifest.append({'id': sid, 'route': route, 'state': state, 'width': width, 'file': None, 'erro': repr(e)[:300]})
            finally:
                ctx.close()
    browser.close()


def qr_video(text: str, path: Path):
    png = path.with_suffix('.png')
    subprocess.run(['node', '-e', f"require('qrcode').toFile({json.dumps(str(png))}, {json.dumps(text)}, {{width: 360, margin: 4}})"],
                   cwd=ROOT, check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', str(png), '-vf',
                    'pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p', '-t', '2', '-r', '10', str(path)], check=True)


def joao_fresh_qrs(pw) -> list[str]:
    b = pw.chromium.launch()
    ctx = b.new_context()
    api_login(ctx, 'joao')
    tickets = ctx.request.get(f'{BASE}/api/tickets').json()['tickets']
    qrs = []
    for t in tickets:
        if t['status'] == 'valido':
            qrs.append(ctx.request.get(f"{BASE}/api/tickets/{t['id']}").json()['ticket']['qrPayload'])
    b.close()
    return qrs


def capture_gate(pw):
    """Resultados da portaria com a câmera simulada do Chromium lendo um QR de verdade (V02, V05 a V09)."""
    fresh = S.get('freshQrs') or joao_fresh_qrs(pw)
    cases = [
        ('V05', 'entrada liberada', None),
        ('V06', 'ingresso ja utilizado', S['qrUsed']),
        ('V07', 'ingresso invalido', 'PX1.qr-adulterado-ficticio'),
        ('V07', 'ingresso cancelado', S['qrCancelled']),
        ('V08', 'ingresso de outro evento', S['qrOtherEvent']),
        ('V09', 'falha ao consultar o servidor', S['qrUsed']),
        ('V02', 'camera lendo', 'texto-qualquer-sem-resultado'),
    ]
    tmp = Path(tempfile.mkdtemp())
    for width in WIDTHS:
        for sid, state, qr in cases:
            if not wanted(f'{sid}:{state}'):
                continue
            if qr is None:
                # Um ingresso novo por largura, fixo pela posição da largura: processos em paralelo não disputam o mesmo.
                slot = [360, 390, 768, 1440].index(width) if width in (360, 390, 768, 1440) else 0
                if slot >= len(fresh):
                    print('FALHA sem ingresso válido para', width)
                    continue
                qr = fresh[slot]
            vid = tmp / f'{sid}-{width}-{abs(hash(state))}.y4m'
            qr_video(qr, vid)
            b = pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                                         f'--use-file-for-fake-video-capture={vid}'])
            ctx = new_ctx(b, width, 'validador', perms=['camera'])
            try:
                page = ctx.new_page()
                if state == 'falha ao consultar o servidor':
                    page.route('**/api/gate/scan', lambda r: r.abort())
                if state == 'camera lendo':
                    page.route('**/api/gate/scan', lambda r: None)
                page.goto(f"{BASE}/portaria/{EV[roxa]}")
                settle(page)
                page.get_by_role('button', name='Iniciar leitura').click()
                if state in ('camera lendo', 'falha ao consultar o servidor'):
                    page.wait_for_timeout(1500)
                else:
                    page.locator('[role=alert]').first.wait_for(timeout=8000)
                shot(page, sid, f"/portaria/{EV[roxa]}", state, width, full=False)
            except Exception as e:
                print('FALHA', sid, state, width, repr(e)[:300], flush=True)
                manifest.append({'id': sid, 'route': '/portaria/:id', 'state': state, 'width': width, 'file': None, 'erro': repr(e)[:300]})
            finally:
                ctx.close()
                b.close()


def capture_intro(pw):
    if not wanted('INTRO:abertura'):
        return
    b = pw.chromium.launch()
    for width in WIDTHS:
        ctx = new_ctx(b, width, None, reduced=False, intro=True)
        page = ctx.new_page()
        page.goto(BASE + '/')
        page.wait_for_timeout(1200)
        shot(page, 'INTRO', '/', 'abertura em video', width, full=False)
        ctx.close()
    b.close()


def capture_mail_and_pdf(pw):
    """E01 a E04: e-mails capturados pelo servidor local e PDFs do ingresso."""
    b = pw.chromium.launch()
    latest: dict[str, Path] = {}
    for f in sorted(EMAILS.glob('*.html')):
        latest[f.stem.split('-', 1)[1]] = f
    mails = [('E01', 'cadastro'), ('E02', 'recuperacao_senha'), ('E03', 'compra_confirmada'), ('C10', 'pagamento_sem_estoque')]
    for width in WIDTHS:
        for sid, kind in mails:
            if kind not in latest or not wanted(f'{sid}:email {kind}'):
                continue
            ctx = b.new_context(viewport={'width': width, 'height': 900})
            page = ctx.new_page()
            page.goto(latest[kind].as_uri())
            shot(page, sid, f'e-mail {kind}', f'email {kind}', width)
            ctx.close()
    if wanted('E04:pdf'):
        ctx = b.new_context()
        api_login(ctx, 'marina')
        for name, url in [('pdf do ingresso', f"/api/tickets/{S['ticketValid']}/pdf"),
                          ('pdf do pedido', f"/api/orders/{S['orderPaid']}/tickets/pdf")]:
            pdf = OUT / f"E04__{name.replace(' ', '-')}.pdf"
            pdf.write_bytes(ctx.request.get(BASE + url).body())
            prefix = OUT / f"E04__{name.replace(' ', '-')}"
            subprocess.run(['pdftoppm', '-jpeg', '-jpegopt', 'quality=72', '-r', '60', str(pdf), str(prefix)], check=True)
            pdf.unlink()
            for img in sorted(OUT.glob(f"E04__{name.replace(' ', '-')}-*.jpg")):
                manifest.append({'id': 'E04', 'route': url, 'state': name, 'width': 0, 'file': img.name})
                print('ok', img.name)
        ctx.close()
    b.close()


with sync_playwright() as pw:
    capture_screens(pw)
    capture_gate(pw)
    capture_intro(pw)
    capture_mail_and_pdf(pw)

old = []
# Um manifesto por conjunto de larguras: capturas em paralelo (uma largura por processo) não sobrescrevem umas às outras.
mf = OUT / ('manifest.json' if sys.argv[3] == '390,1440' else f"manifest-{sys.argv[3].replace(',', '-')}.json")
if mf.exists() and FILTER is not None:
    keep = {(m['id'], m['state'], m['width']) for m in manifest}
    old = [m for m in json.loads(mf.read_text()) if (m['id'], m['state'], m['width']) not in keep]
mf.write_text(json.dumps(old + manifest, ensure_ascii=False, indent=1))
print('total', len(manifest), 'falhas', sum(1 for m in manifest if not m['file']))
