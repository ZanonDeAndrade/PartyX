import json, sys
from playwright.sync_api import sync_playwright
SP = sys.argv[1]; seed = json.load(open(f'{SP}/seed24.json')); fx = json.load(open(f'{SP}/fixture.json'))
BASE = 'http://localhost:8099'; S = seed['slug']; EV = seed['eventId']
PAGES = {
 'publico': [None, ['/', '/eventos', f'/eventos/{S}', '/criar-conta', '/entrar', '/recuperar-senha', '/termos-de-uso', '/privacidade', '/politica-de-cancelamento', '/pagina-que-nao-existe']],
 'cliente': [(fx['email'], 'festa2026Forte!'), [f'/checkout/{S}', '/meus-ingressos', '/minhas-compras', f"/pedido/{fx['orderId']}", f"/ingressos/{fx['ticketId']}", f"/ingressos/{fx['ticketId']}/tela-cheia"]],
 'administrador': [('admin@partyx.test', 'festa2026'), ['/admin', '/admin/pedidos', '/admin/eventos', f'/admin/eventos/{EV}', '/admin/relatorios/vendas', '/admin/relatorios/promoters', '/admin/relatorios/taxa-mensal']],
 'validador': [('validador@partyx.test', 'festa2026'), ['/portaria', f'/portaria/{EV}']],
}
PROFILES = {'desktop-1366': dict(viewport={'width': 1366, 'height': 768}), 'celular-360': dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True), 'tablet-768': dict(viewport={'width': 768, 'height': 1024}, has_touch=True)}
results = []
def run(engine, bt, profile, kw):
    for role, (cred, paths) in PAGES.items():
        ctx = bt.launch().new_context(**kw); page = ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:150]))
        page.on('console', lambda m: errs.append('console: ' + m.text[:150]) if m.type == 'error' and 'favicon' not in m.text and 'status of 40' not in m.text else None)
        if cred:
            page.goto(BASE + '/entrar'); page.get_by_label('E-mail').fill(cred[0]); page.get_by_label('Senha').fill(cred[1]); page.get_by_role('button', name='Entrar').click()
            try: page.wait_for_url(lambda u: '/entrar' not in u, timeout=10000)
            except Exception: results.append((engine, profile, role, 'LOGIN', 'FALHA login', [])); ctx.browser.close(); continue
        for p in paths:
            errs.clear()
            page.goto(BASE + p); page.wait_for_load_state('networkidle'); page.wait_for_timeout(400)
            hs = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
            h1 = page.locator('h1').count()
            body = page.inner_text('body')[:4000]
            broken = ('Algo deu errado' in body) or ('Cannot read' in body)
            issues = []
            if hs: issues.append('rolagem horizontal')
            if h1 == 0 and p not in ('/pagina-que-nao-existe',) and not p.endswith('/tela-cheia'): issues.append('sem h1')
            if broken: issues.append('tela de erro')
            issues += [e for e in errs if 'due to access control checks' not in e]
            cancelled = [e for e in errs if 'due to access control checks' in e]
            results.append((engine, profile, role, p.replace(fx['orderId'], ':pedido').replace(fx['ticketId'], ':ingresso').replace(EV, ':evento'), 'OK' if not issues else 'ACHADO', issues + (['obs: fetch cancelado pela navegação (WebKit)'] if cancelled else [])))
        if role == 'cliente' and profile == 'celular-360':
            page.goto(BASE + f"/ingressos/{fx['ticketId']}/tela-cheia"); page.wait_for_load_state('networkidle'); page.screenshot(path=f'{SP}/compat-{engine}-ingresso-tela-cheia.png')
        ctx.browser.close()
with sync_playwright() as p:
    for engine in ['chromium', 'firefox', 'webkit']:
        for prof, kw in PROFILES.items():
            kw2 = dict(kw)
            if engine == 'firefox': kw2.pop('is_mobile', None)
            try: run(engine, getattr(p, engine), prof, kw2)
            except Exception as e: results.append((engine, prof, '-', '-', 'ERRO DO ENSAIO', [str(e)[:200]]))
    for name, eng in [('Pixel 7', 'chromium'), ('iPhone 14', 'webkit')]:
        try: run(f'{eng}/{name}', getattr(p, eng), 'dispositivo-emulado', p.devices[name])
        except Exception as e: results.append((eng, name, '-', '-', 'ERRO DO ENSAIO', [str(e)[:200]]))
json.dump(results, open(f'{SP}/compat.json', 'w'), ensure_ascii=False, indent=1)
tot = len(results); ok = sum(1 for r in results if r[4] == 'OK'); print('páginas verificadas', tot, 'OK', ok)
for r in results:
    if r[4] != 'OK': print(r)
