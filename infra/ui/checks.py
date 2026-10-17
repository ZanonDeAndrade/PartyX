"""Verificações de UI com dados fictícios (docs/ui): rolagem horizontal em 360 px e "reduzir movimento".

Uso: python3 infra/ui/checks.py <pasta-de-trabalho>
- Mede `scrollWidth - clientWidth` em 360 px nas rotas principais (CA-32): tem de ser 0.
- Com prefers-reduced-motion: reduce, nenhuma animação CSS/Web Animations fica rodando depois do carregamento, a abertura em
  vídeo não aparece e a navegação não usa View Transitions.
- Sem a preferência, a abertura aparece na primeira página da vitrine e não aparece no checkout.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

WORK = Path(sys.argv[1])
BASE = 'http://localhost:8099'
S = json.loads((WORK / 'state-ui.json').read_text())
EV = S['events']
LOGINS = {'marina': ('marina@partyx.test', 'festa2026Forte'), 'admin': ('admin@partyx.test', 'festa2026'),
          'validador': ('validador@partyx.test', 'festa2026')}
ROUTES = [
    (None, '/'), (None, '/eventos'), (None, '/eventos/noite-roxa-warehouse'), (None, '/eventos/halloween-ficticio'),
    (None, '/entrar'), (None, '/criar-conta'), (None, '/termos-de-uso'), (None, '/nao-existe'),
    ('marina', f"/pedido/{S['orderPendingPix']}"), ('marina', f"/pedido/{S['orderPaid']}"), ('marina', '/meus-ingressos'),
    ('marina', f"/ingressos/{S['ticketValid']}"), ('marina', f"/ingressos/{S['ticketValid']}/tela-cheia"),
    ('marina', '/minhas-compras'), ('marina', '/minha-conta'),
    ('admin', '/admin'), ('admin', '/admin/pedidos'), ('admin', '/admin/eventos'), ('admin', f"/admin/eventos/{EV['noite-roxa-warehouse']}"),
    ('admin', '/admin/relatorios/vendas'), ('admin', '/admin/relatorios/taxa-mensal'), ('admin', '/admin/equipe'),
    ('validador', '/portaria'), ('validador', f"/portaria/{EV['noite-roxa-warehouse']}"),
]
NO_INTRO = 'window.__partyxSemAbertura = true'  # aviso só de teste, lido por src/intro/abertura.js
problems: list[str] = []


def ctx_for(browser, who, reduced, intro=False):
    ctx = browser.new_context(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True,
                              reduced_motion='reduce' if reduced else 'no-preference', locale='pt-BR')
    if not intro:
        ctx.add_init_script(NO_INTRO)
    if who:
        email, pw = LOGINS[who]
        assert ctx.request.post(f'{BASE}/api/auth/login', data={'email': email, 'password': pw},
                                headers={'origin': BASE}).status == 200
    return ctx


with sync_playwright() as pw:
    b = pw.chromium.launch()
    for who, route in ROUTES:
        ctx = ctx_for(b, who, reduced=True)
        page = ctx.new_page()
        page.goto(BASE + route)
        try:
            page.wait_for_load_state('networkidle', timeout=5000)
        except Exception:
            pass
        page.wait_for_timeout(500)
        over = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        running = page.evaluate("""document.getAnimations().filter(a => a.playState === 'running' &&
            !(a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('[aria-busy="true"]'))).length""")
        status = 'ok' if over == 0 and running == 0 else 'PROBLEMA'
        if status != 'ok':
            problems.append(f'{route}: rolagem lateral {over}px, animações rodando {running}')
        print(f'{status:8} 360px {route[:70]:70} rolagem lateral={over}px animações={running}')
        ctx.close()

    # Abertura: aparece em toda carga fora das rotas de tarefa; com "reduzir movimento", o logo parado. Nunca no pagamento.
    for reduced, route, expect in [(False, '/', 'video'), (True, '/', 'parado'), (False, f"/pedido/{S['orderPaid']}", None)]:
        ctx = ctx_for(b, 'marina' if route.startswith('/pedido') else None, reduced, intro=True)
        page = ctx.new_page()
        page.goto(BASE + route)
        page.wait_for_timeout(700)
        shown = page.evaluate("document.documentElement.getAttribute('data-px-abertura')")
        ok = shown == expect or (expect == 'video' and shown == 'css')  # sem vídeo no navegador do teste: o plano B em CSS
        if not ok:
            problems.append(f'abertura em {route} com reduzir movimento={reduced}: {shown}')
        print(f"{'ok' if ok else 'PROBLEMA':8} abertura em {route} (reduzir movimento={reduced}): {shown or 'não aparece'}")
        ctx.close()

    # View Transitions: com "reduzir movimento", a navegação interna não inicia transição.
    ctx = ctx_for(b, None, reduced=True)
    page = ctx.new_page()
    page.add_init_script("""window.__vt = 0; const o = Document.prototype.startViewTransition;
      if (o) Document.prototype.startViewTransition = function (cb) { window.__vt++; return o.call(this, cb); };""")
    page.goto(BASE + '/eventos')
    page.wait_for_load_state('networkidle')
    page.locator('.px-card-link').first.click()
    page.wait_for_timeout(600)
    vt = page.evaluate('window.__vt')
    print(f"{'ok' if vt == 0 else 'PROBLEMA':8} View Transitions com reduzir movimento: {vt} transições")
    if vt:
        problems.append('View Transition iniciada com reduzir movimento')
    ctx.close()
    b.close()

print('\nproblemas:', len(problems))
for p in problems:
    print(' -', p)
sys.exit(1 if problems else 0)
