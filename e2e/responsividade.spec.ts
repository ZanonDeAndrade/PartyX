import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import { scanQr } from './support/camera';
import { apiLogin } from './support/helpers';
import { readRespState, RESP_DIR } from './support/responsivo-setup';
import { ROOT } from './support/server';

/**
 * CA-32 (nenhuma tela exige rolagem horizontal) em TODAS as rotas e estados, a 360, 390, 768 e 1440 px. Falha quando a página
 * tem `scrollWidth > clientWidth`. Rolagens horizontais INTERNAS (tabela larga dentro de uma caixa com rolagem própria) não
 * reprovam pelo critério pedido, mas vão listadas no resultado para revisão.
 * Inventário de telas e estados: o mesmo das capturas de UI (infra/ui/capture.py, docs/ui/checklist-telas.md).
 */
const R = readRespState();
const { S } = R;
const EV = S.events;
const BASE = R.base;
const WIDTHS = [360, 390, 768, 1440] as const;
const HEIGHT: Record<number, number> = { 360: 780, 390: 844, 768: 1024, 1440: 900 };
const EVID = path.join(ROOT, 'docs/evidencias/responsividade');
const RESULTS = path.join(RESP_DIR, 'resultados.jsonl');
const roxa = 'noite-roxa-warehouse';
const T = R.types[roxa]!;

const LOGINS: Record<string, [string, string]> = {
  marina: ['marina@exemplo.com', 'festa2026Forte'],
  lucas: ['lucas@exemplo.com', 'festa2026Forte'],
  admin: ['admin@exemplo.com', 'festa2026'],
  validador: ['validador@exemplo.com', 'festa2026'],
  primeiro: ['primeiro@exemplo.com', 'festa2026'],
};

type Step = (page: Page) => Promise<unknown>;
interface Screen {
  id: string;
  route: string;
  state: string;
  who?: keyof typeof LOGINS;
  before?: Step;
  action?: Step;
}

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
};
const click =
  (name: string, role: Parameters<Page['getByRole']>[0] = 'button', exact = false): Step =>
  async page => {
    await page.getByRole(role, { name, exact }).first().click();
    await settle(page);
  };
const fill =
  (label: string, value: string): Step =>
  page =>
    page.getByLabel(label, { exact: true }).first().fill(value);
const seq =
  (...steps: Step[]): Step =>
  async page => {
    for (const s of steps) await s(page);
  };
const hang =
  (pattern: string): Step =>
  page =>
    page.route(pattern, () => {});
const fail =
  (pattern: string): Step =>
  page =>
    page.route(pattern, r => r.abort());
const fulfill =
  (pattern: string, body: unknown, status = 200): Step =>
  page =>
    page.route(pattern, r => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
const cart =
  (slug: string, items: { ticketTypeId: string; quantity: number }[]): Step =>
  page =>
    page.addInitScript(data => sessionStorage.setItem('px.cart', data), JSON.stringify({ slug, items }));
const mobileOnly =
  (step: Step): Step =>
  async page => {
    if (page.viewportSize()!.width < 768) await step(page);
  };
const linkMatching =
  (re: RegExp): Step =>
  async page => {
    await page.getByRole('link', { name: re }).first().click();
    await settle(page);
  };
const NONE = '00000000-0000-4000-8000-000000000000';

const SCREENS: Screen[] = [
  // ----- público -----
  { id: 'P01', route: '/', state: 'carregado' },
  { id: 'P01', route: '/', state: 'carregando', before: hang('**/api/public/home') },
  { id: 'P01', route: '/', state: 'erro de carregamento', before: fail('**/api/public/home') },
  { id: 'P01', route: '/', state: 'sem eventos', before: fulfill('**/api/public/home', { featured: [], upcoming: [] }) },
  { id: 'G07', route: '/', state: 'menu do celular aberto', who: 'marina', action: mobileOnly(click('Abrir menu')) },
  { id: 'P02', route: '/eventos', state: 'lista' },
  { id: 'P02', route: '/eventos?q=noite', state: 'busca com filtro' },
  { id: 'P02', route: '/eventos?q=inexistente&date=2030-01-01', state: 'nenhum resultado' },
  { id: 'P02', route: '/eventos', state: 'nenhuma venda disponivel', before: fulfill('**/api/public/events*', { events: [], filtering: false }) },
  { id: 'P02', route: '/eventos', state: 'carregando', before: hang('**/api/public/events*') },
  { id: 'P02', route: '/eventos', state: 'erro', before: fail('**/api/public/events*') },
  { id: 'P03', route: `/eventos/${roxa}`, state: 'disponivel com tipo esgotado e desativado' },
  {
    id: 'C01',
    route: `/eventos/${roxa}`,
    state: 'selecao de ingressos',
    action: seq(click('Mais um Pista', 'button', true), click('Mais um Pista', 'button', true), click('Mais um VIP open bar')),
  },
  { id: 'C01', route: `/eventos/${roxa}`, state: 'limite por compra atingido', action: seq(...Array(6).fill(click('Mais um Pista', 'button', true))) },
  { id: 'P03', route: '/eventos/reveillon-ficticio-2027', state: 'vendas ainda nao iniciadas' },
  { id: 'P03', route: '/eventos/rosa-eletrica', state: 'esgotado' },
  { id: 'P03', route: '/eventos/domingo-de-ressaca', state: 'vendas encerradas' },
  { id: 'P03', route: '/eventos/pre-estreia-lotada', state: 'unidades reservadas' },
  { id: 'P03', route: '/eventos/halloween-ficticio', state: 'evento encerrado por link direto' },
  { id: 'P03', route: '/eventos/quinta-experimental', state: 'sem banner e sem atracoes' },
  { id: 'P03', route: `/eventos/${roxa}`, state: 'carregando', before: hang('**/api/public/events/*') },
  {
    id: 'E05',
    route: `/eventos/${roxa}`,
    state: 'compartilhar com pre-visualizacao',
    before: page => page.addInitScript(() => delete (Navigator.prototype as { share?: unknown }).share),
    action: click('Compartilhar'),
  },
  { id: 'P04', route: '/termos-de-uso', state: 'termos' },
  { id: 'P05', route: '/privacidade', state: 'privacidade' },
  { id: 'P06', route: '/politica-de-cancelamento', state: 'cancelamento' },
  { id: 'P06', route: '/meia-entrada', state: 'meia-entrada' },
  { id: 'P07', route: '/pagina-que-nao-existe', state: 'pagina inexistente' },
  { id: 'P07', route: '/eventos/evento-que-nao-existe', state: 'evento inexistente' },
  // ----- acesso -----
  { id: 'A01', route: '/entrar', state: 'padrao' },
  {
    id: 'A01',
    route: '/entrar',
    state: 'credenciais incorretas',
    action: seq(fill('E-mail', 'ana@exemplo.com'), fill('Senha', 'senha-errada-1'), click('Entrar', 'button', true)),
  },
  {
    id: 'A01',
    route: '/entrar',
    state: 'bloqueio temporario',
    before: fulfill('**/api/auth/login', { erro: { codigo: 'login_bloqueado', mensagem: 'Muitas tentativas.' } }, 429),
    action: seq(fill('E-mail', 'marina@exemplo.com'), fill('Senha', 'x'), click('Entrar', 'button', true)),
  },
  {
    id: 'A01',
    route: '/entrar',
    state: 'conta desativada',
    action: seq(fill('E-mail', 'validador2@exemplo.com'), fill('Senha', 'festa2026'), click('Entrar', 'button', true)),
  },
  { id: 'A01', route: `/entrar?voltar=/checkout/${roxa}`, state: 'retorno ao checkout' },
  { id: 'A02', route: '/criar-conta', state: 'padrao' },
  { id: 'A02', route: '/criar-conta', state: 'campos incompletos', action: click('Criar conta', 'button', true) },
  {
    id: 'A02',
    route: '/criar-conta',
    state: 'cpf invalido e email ja cadastrado',
    action: seq(
      fill('Nome completo', 'Teste Fictício'),
      fill('E-mail', 'marina@exemplo.com'),
      fill('CPF', '111.111.111-11'),
      fill('Telefone com DDD', '119'),
      fill('Senha', 'curta'),
      click('Criar conta', 'button', true),
    ),
  },
  { id: 'A02', route: `/criar-conta?voltar=/checkout/${roxa}`, state: 'retorno ao checkout' },
  { id: 'A03', route: '/recuperar-senha', state: 'padrao' },
  { id: 'A04', route: '/recuperar-senha', state: 'confirmacao neutra', action: seq(fill('E-mail', 'alguem@exemplo.com'), click('Enviar link')) },
  { id: 'A05', route: '/redefinir-senha?token=invalido', state: 'link invalido' },
  { id: 'A05', route: '/redefinir-senha?token=x', state: 'link expirado', before: fulfill('**/api/auth/password/check', { estado: 'expirado' }) },
  { id: 'A05', route: '/redefinir-senha?token=x', state: 'link ja utilizado', before: fulfill('**/api/auth/password/check', { estado: 'utilizado' }) },
  { id: 'A05', route: '/redefinir-senha?token=x', state: 'link valido', before: fulfill('**/api/auth/password/check', { estado: 'valido' }) },
  {
    id: 'A05',
    route: '/redefinir-senha?token=x',
    state: 'senhas diferentes',
    before: fulfill('**/api/auth/password/check', { estado: 'valido' }),
    action: seq(fill('Nova senha', 'festa2026Nova'), fill('Confirmar nova senha', 'outra2026'), click('Salvar nova senha')),
  },
  {
    id: 'A06',
    route: '/redefinir-senha?token=x',
    state: 'senha alterada',
    before: seq(
      fulfill('**/api/auth/password/check', { estado: 'valido' }),
      fulfill('**/api/auth/password/reset', { mensagem: 'ok' }),
    ),
    action: seq(fill('Nova senha', 'festa2026Nova'), fill('Confirmar nova senha', 'festa2026Nova'), click('Salvar nova senha')),
  },
  { id: 'ADM22', route: '/primeiro-acesso', state: 'troca da senha temporaria', who: 'primeiro' },
  // ----- checkout -----
  { id: 'C02', route: `/checkout/${roxa}`, state: 'visitante vai ao login', before: cart(roxa, [{ ticketTypeId: T.Pista!, quantity: 2 }]) },
  {
    id: 'C02',
    route: `/checkout/${roxa}`,
    state: 'revisao do pedido',
    who: 'marina',
    before: cart(roxa, [
      { ticketTypeId: T.Pista!, quantity: 2 },
      { ticketTypeId: T['VIP open bar']!, quantity: 1 },
    ]),
  },
  {
    id: 'C02',
    route: `/checkout/${roxa}`,
    state: 'codigo do promoter valido',
    who: 'marina',
    before: cart(roxa, [{ ticketTypeId: T.Pista!, quantity: 2 }]),
    action: seq(fill('Código', 'DUDA'), click('Aplicar')),
  },
  {
    id: 'C02',
    route: `/checkout/${roxa}`,
    state: 'codigo do promoter invalido',
    who: 'marina',
    before: cart(roxa, [{ ticketTypeId: T.Pista!, quantity: 2 }]),
    action: seq(fill('Código', 'NAOEXISTE'), click('Aplicar')),
  },
  {
    id: 'C02',
    route: `/checkout/${roxa}`,
    state: 'codigo do promoter desativado',
    who: 'marina',
    before: cart(roxa, [{ ticketTypeId: T.Pista!, quantity: 2 }]),
    action: seq(fill('Código', 'LEO'), click('Aplicar')),
  },
  { id: 'C02', route: `/checkout/${roxa}`, state: 'estoque alterado', who: 'marina', before: cart(roxa, [{ ticketTypeId: T['Pista 1º lote']!, quantity: 2 }]) },
  { id: 'C02', route: `/checkout/${roxa}`, state: 'carrinho vazio', who: 'marina' },
  {
    id: 'C02',
    route: `/checkout/${roxa}`,
    state: 'conferindo disponibilidade',
    who: 'marina',
    before: seq(cart(roxa, [{ ticketTypeId: T.Pista!, quantity: 2 }]), hang('**/api/checkout/quote')),
  },
  { id: 'C03', route: `/pedido/${S.orderPendingNoMethod}`, state: 'escolha da forma de pagamento', who: 'marina' },
  { id: 'C03', route: `/pedido/${S.orderPendingNoMethod}`, state: 'cartao selecionado', who: 'marina', action: click('Cartão de crédito', 'radio') },
  { id: 'C04', route: `/pedido/${S.orderPendingPix}`, state: 'pix aguardando pagamento', who: 'marina' },
  { id: 'C04', route: `/pedido/${S.orderPendingPix}`, state: 'codigo pix copiado', who: 'marina', action: click('Copiar código Pix') },
  {
    id: 'C04',
    route: `/pedido/${S.orderPendingPix}`,
    state: 'ultimos 60 segundos da reserva',
    who: 'marina',
    before: page =>
      page.route(`**/api/orders/${S.orderPendingPix}`, async (r: Route) => {
        const resp = await r.fetch();
        const json = await resp.json();
        json.order.reservation = { ...json.order.reservation, secondsLeft: 45 };
        await r.fulfill({ response: resp, body: JSON.stringify(json) });
      }),
  },
  { id: 'C05', route: `/pedido/${S.orderPendingCard}`, state: 'cartao em pagina segura do gateway', who: 'marina' },
  { id: 'C06', route: `/pedido/${S.orderPaid}`, state: 'pagamento confirmado preparando ingressos', who: 'marina', before: fulfill('**/api/tickets', { tickets: [] }) },
  { id: 'C07', route: `/pedido/${S.orderPaid}`, state: 'compra confirmada', who: 'marina' },
  { id: 'C08', route: `/pedido/${S.orderExpired}`, state: 'reserva expirada', who: 'marina' },
  { id: 'C09', route: `/pedido/${S.orderDeclined}`, state: 'pagamento recusado', who: 'marina' },
  { id: 'C10', route: `/pedido/${S.orderNoStock}`, state: 'pago sem estoque', who: 'marina' },
  { id: 'U03', route: `/pedido/${S.orderRefunded}`, state: 'pedido estornado', who: 'marina' },
  { id: 'U03', route: `/pedido/${S.orderCancelled}`, state: 'pedido cancelado', who: 'marina' },
  { id: 'U03', route: `/pedido/${NONE}`, state: 'pedido nao encontrado', who: 'marina' },
  // ----- cliente -----
  { id: 'U01', route: '/meus-ingressos', state: 'proximos', who: 'marina' },
  { id: 'U01', route: '/meus-ingressos', state: 'historico', who: 'marina', action: click('Histórico', 'tab') },
  { id: 'U01', route: '/meus-ingressos', state: 'sem ingressos', who: 'lucas' },
  { id: 'U01', route: '/meus-ingressos', state: 'carregando', who: 'marina', before: hang('**/api/tickets') },
  { id: 'U01', route: '/meus-ingressos', state: 'erro', who: 'marina', before: fail('**/api/tickets') },
  { id: 'U02', route: '/minhas-compras', state: 'lista com todas as situacoes', who: 'marina' },
  { id: 'U02', route: '/minhas-compras', state: 'sem compras', who: 'lucas' },
  { id: 'U04', route: `/ingressos/${S.ticketValid}`, state: 'valido', who: 'marina' },
  { id: 'U04', route: `/ingressos/${S.ticketUsed}`, state: 'utilizado', who: 'marina' },
  { id: 'U04', route: `/ingressos/${S.ticketCancelled}`, state: 'cancelado', who: 'marina' },
  { id: 'U04', route: `/ingressos/${NONE}`, state: 'nao encontrado', who: 'marina' },
  { id: 'U05', route: `/ingressos/${S.ticketValid}/tela-cheia`, state: 'tela cheia valido', who: 'marina' },
  { id: 'U05', route: `/ingressos/${S.ticketCancelled}/tela-cheia`, state: 'tela cheia cancelado', who: 'marina' },
  { id: 'U06', route: '/minha-conta', state: 'dados', who: 'marina' },
  { id: 'U06', route: '/minha-conta', state: 'alteracoes salvas', who: 'marina', action: click('Salvar alterações') },
  { id: 'U07', route: '/minha-conta', state: 'alterar senha', who: 'marina', action: click('Alterar senha') },
  {
    id: 'U07',
    route: '/minha-conta',
    state: 'alterar senha com erro',
    who: 'marina',
    action: seq(
      click('Alterar senha'),
      fill('Senha atual', 'x'),
      fill('Nova senha', 'festa2026Nova'),
      fill('Confirmar nova senha', 'diferente1'),
      click('Salvar nova senha'),
    ),
  },
  // ----- portaria (resultados da leitura: GATE abaixo, com a câmera simulada) -----
  { id: 'V01', route: '/portaria', state: 'selecionar evento', who: 'validador' },
  { id: 'V02', route: `/portaria/${EV[roxa]}`, state: 'camera parada', who: 'validador' },
  {
    id: 'V02',
    route: `/portaria/${EV[roxa]}`,
    state: 'camera indisponivel',
    who: 'validador',
    before: page => page.addInitScript(() => Object.defineProperty(navigator, 'mediaDevices', { value: undefined })),
    action: click('Iniciar leitura'),
  },
  { id: 'V03', route: `/portaria/${EV[roxa]}`, state: 'busca manual', who: 'validador', action: click('Busca manual', 'tab') },
  {
    id: 'V04',
    route: `/portaria/${EV[roxa]}`,
    state: 'resultado com homonimos',
    who: 'validador',
    action: seq(click('Busca manual', 'tab'), fill('Código, nome, CPF ou e-mail', 'Marina Costa'), click('Buscar', 'button', true)),
  },
  {
    id: 'V04',
    route: `/portaria/${EV[roxa]}`,
    state: 'nenhum resultado',
    who: 'validador',
    action: seq(click('Busca manual', 'tab'), fill('Código, nome, CPF ou e-mail', 'Ninguém Fictício'), click('Buscar', 'button', true)),
  },
  {
    id: 'V09',
    route: `/portaria/${EV[roxa]}`,
    state: 'sem conexao',
    who: 'validador',
    action: async page => {
      await page.context().setOffline(true);
      await page.waitForTimeout(300);
    },
  },
  { id: 'G04', route: '/portaria', state: 'acesso negado ao cliente na portaria', who: 'marina' },
  {
    id: 'G05',
    route: '/meus-ingressos',
    state: 'sessao expirada com retorno',
    who: 'marina',
    before: fulfill('**/api/tickets', { erro: { codigo: 'nao_autenticado', mensagem: 'Entre na sua conta para continuar.' } }, 401),
    action: page => page.waitForURL('**/entrar?voltar=*', { timeout: 8000 }),
  },
  // ----- painel -----
  { id: 'ADM01', route: '/admin', state: 'visao geral', who: 'admin' },
  { id: 'ADM01', route: '/admin', state: 'carregando', who: 'admin', before: hang('**/api/admin/overview*') },
  { id: 'ADM01', route: '/admin', state: 'erro', who: 'admin', before: fail('**/api/admin/overview*') },
  { id: 'G07', route: '/admin', state: 'menu do painel no celular', who: 'admin', action: mobileOnly(click('Menu do painel')) },
  { id: 'ADM02', route: '/admin/eventos', state: 'lista de eventos', who: 'admin' },
  { id: 'ADM03', route: '/admin/eventos/novo', state: 'criar evento', who: 'admin' },
  { id: 'ADM03', route: '/admin/eventos/novo', state: 'erros do formulario', who: 'admin', action: click('Salvar rascunho') },
  { id: 'ADM03', route: `/admin/eventos/${EV[roxa]}/editar`, state: 'editar evento publicado', who: 'admin' },
  { id: 'ADM03', route: `/admin/eventos/${EV['festival-rascunho']}/previa`, state: 'pre-visualizacao', who: 'admin' },
  { id: 'ADM04', route: `/admin/eventos/${EV[roxa]}`, state: 'informacoes', who: 'admin' },
  { id: 'ADM04', route: `/admin/eventos/${EV['festival-rascunho']}`, state: 'rascunho', who: 'admin' },
  { id: 'ADM04', route: `/admin/eventos/${EV['halloween-ficticio']}`, state: 'encerrado', who: 'admin' },
  { id: 'ADM04', route: `/admin/eventos/${EV[roxa]}`, state: 'confirmar encerramento', who: 'admin', action: click('Encerrar evento') },
  { id: 'ADM04', route: `/admin/eventos/${EV['festival-rascunho']}`, state: 'confirmar publicacao', who: 'admin', action: click('Publicar') },
  { id: 'ADM05', route: `/admin/eventos/${EV[roxa]}`, state: 'tipos de ingresso', who: 'admin', action: click('Tipos de ingresso', 'tab') },
  {
    id: 'ADM06',
    route: `/admin/eventos/${EV[roxa]}`,
    state: 'novo tipo de ingresso',
    who: 'admin',
    action: seq(click('Tipos de ingresso', 'tab'), click('Novo tipo de ingresso')),
  },
  { id: 'ADM19', route: `/admin/eventos/${EV[roxa]}`, state: 'entradas ao vivo no evento', who: 'admin', action: click('Entradas ao vivo', 'tab') },
  { id: 'ADM14', route: `/admin/eventos/${EV[roxa]}`, state: 'ingressos do evento', who: 'admin', action: click('Ingressos', 'tab') },
  { id: 'ADM12', route: `/admin/eventos/${EV[roxa]}`, state: 'compradores do evento', who: 'admin', action: click('Compradores', 'tab') },
  { id: 'ADM23', route: `/admin/eventos/${EV[roxa]}`, state: 'contingencia', who: 'admin', action: click('Contingência', 'tab') },
  { id: 'ADM07', route: '/admin/promoters', state: 'lista', who: 'admin' },
  { id: 'ADM08', route: '/admin/promoters', state: 'novo promoter', who: 'admin', action: click('Novo promoter') },
  {
    id: 'ADM08',
    route: '/admin/promoters',
    state: 'codigo repetido',
    who: 'admin',
    action: seq(click('Novo promoter'), fill('Nome', 'Teste Fictício'), fill('Código', 'DUDA'), click('Criar promoter')),
  },
  { id: 'ADM09', route: '/admin/promoters', state: 'detalhe do promoter', who: 'admin', action: linkMatching(/Duda/) },
  { id: 'ADM10', route: '/admin/pedidos', state: 'lista de pedidos', who: 'admin' },
  { id: 'ADM11', route: `/admin/pedidos/${S.orderPaid}`, state: 'detalhe do pedido', who: 'admin' },
  { id: 'ADM11', route: `/admin/pedidos/${S.orderNoStock}`, state: 'pago sem estoque', who: 'admin' },
  {
    id: 'ADM15',
    route: `/admin/pedidos/${S.orderPaid}`,
    state: 'cancelar unidade',
    who: 'admin',
    action: async page => {
      await page.locator('button:enabled', { hasText: /^Cancelar$/ }).first().click();
      await settle(page);
    },
  },
  { id: 'ADM12', route: '/admin/compradores', state: 'compradores', who: 'admin' },
  { id: 'ADM13', route: '/admin/compradores', state: 'detalhe do comprador', who: 'admin', action: linkMatching(/Marina Costa/) },
  {
    id: 'ADM13',
    route: '/admin/compradores',
    state: 'corrigir e-mail ou cpf',
    who: 'admin',
    action: seq(linkMatching(/Marina Costa/), click('Corrigir e-mail ou CPF')),
  },
  { id: 'ADM14', route: '/admin/ingressos', state: 'ingressos', who: 'admin' },
  { id: 'ADM15', route: `/admin/ingressos/${S.ticketValid}`, state: 'detalhe do ingresso', who: 'admin' },
  { id: 'ADM15', route: `/admin/ingressos/${S.ticketCancelled}`, state: 'ingresso cancelado', who: 'admin' },
  {
    id: 'ADM15',
    route: `/admin/ingressos/${S.ticketValid}`,
    state: 'confirmar cancelamento',
    who: 'admin',
    action: async page => {
      await page.getByRole('button', { name: 'Cancelar ingresso' }).first().click({ force: true });
      await settle(page);
    },
  },
  { id: 'ADM16', route: '/admin/relatorios/vendas', state: 'relatorio de vendas', who: 'admin' },
  { id: 'ADM17', route: '/admin/relatorios/promoters', state: 'ranking de promoters', who: 'admin' },
  { id: 'ADM18', route: '/admin/relatorios/taxa-mensal', state: 'taxa mensal', who: 'admin' },
  { id: 'ADM19', route: '/admin/entradas', state: 'acompanhamento das entradas', who: 'admin' },
  { id: 'ADM20', route: '/admin/equipe', state: 'equipe', who: 'admin' },
  { id: 'ADM21', route: '/admin/equipe', state: 'novo usuario', who: 'admin', action: click('Novo usuário') },
  { id: 'ADM24', route: '/admin/conta', state: 'conta do administrador', who: 'admin' },
  { id: 'ADM24', route: '/admin/conta', state: 'alterar senha', who: 'admin', action: click('Alterar senha') },
  { id: 'ADM11', route: '/admin/excecoes', state: 'excecoes de pagamento', who: 'admin' },
  { id: 'G04', route: '/admin', state: 'acesso negado ao validador', who: 'validador' },
  { id: 'G04', route: '/admin', state: 'acesso negado ao cliente no painel', who: 'marina' },
];

const slugify = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function newContext(browser: Browser, width: number, who?: keyof typeof LOGINS, intro = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT[width]! },
    deviceScaleFactor: 1,
    isMobile: width < 768,
    hasTouch: width < 768,
    reducedMotion: intro ? 'no-preference' : 'reduce',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  if (!intro)
    await ctx.addInitScript(() => {
      try {
        sessionStorage.setItem('partyx_intro_seen', '1');
      } catch {
        // sem armazenamento: a abertura aparece, sem efeito na medida
      }
    });
  if (who) await apiLogin(ctx.request, BASE, ...LOGINS[who]!);
  return ctx;
}

/** Registra o início: um estado que quebra antes da medida aparece como "não medido" no resultado. */
const started = (id: string, route: string, state: string, width: number) =>
  appendFileSync(RESULTS, JSON.stringify({ start: true, id, route, state, width }) + '\n');

/** Mede, registra e captura. A medida é na largura do aparelho, antes de qualquer redimensionamento para a captura. */
const overflowOf = (page: Page) =>
  page.evaluate(() => {
    const el = document.documentElement;
    const inner: string[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const ox = getComputedStyle(node).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0)
        inner.push(`${node.tagName.toLowerCase()}${node.className ? '.' + String(node.className).split(' ')[0] : ''} (${node.scrollWidth}/${node.clientWidth})`);
    }
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, inner: inner.slice(0, 5) };
  });

async function measure(page: Page, id: string, route: string, state: string, width: number, fullPage = true) {
  await page.waitForTimeout(350);
  const m = await overflowOf(page);
  const dir = path.join(EVID, 'img', String(width)); // capturas fora do Git (.gitignore)
  mkdirSync(dir, { recursive: true });
  const file = `${id}__${slugify(state)}.jpg`;
  // Janela ou gaveta aberta: captura só a tela visível (a página por trás fica inerte).
  if (fullPage && (await page.locator('[aria-modal="true"]:visible').count()) > 0) fullPage = false;
  await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 40, fullPage, animations: 'disabled' });
  const ok = m.scrollWidth <= m.clientWidth;
  appendFileSync(RESULTS, JSON.stringify({ id, route, state, width, ...m, ok, file: `img/${width}/${file}` }) + '\n');
  expect(ok, `${id} "${state}" a ${width}px: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`).toBe(true);
}

test.describe.configure({ mode: 'parallel' });

// Controle negativo: na mesma emulação de celular, uma página com um bloco mais largo que a tela TEM de ser acusada.
test('controle: o detector acusa rolagem horizontal a 360 px', async ({ browser }) => {
  const ctx = await newContext(browser, 360);
  try {
    const page = await ctx.newPage();
    await page.setContent(
      '<meta name="viewport" content="width=device-width, initial-scale=1"><div style="width:420px;height:20px">largo</div>',
    );
    const m = await overflowOf(page);
    expect(m.clientWidth).toBe(360);
    expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);
  } finally {
    await ctx.close();
  }
});

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    for (const s of SCREENS) {
      test(`${s.id} ${s.state}`, async ({ browser }) => {
        started(s.id, s.route, s.state, width);
        const ctx = await newContext(browser, width, s.who);
        try {
          const page = await ctx.newPage();
          if (s.before) await s.before(page);
          await page.goto(BASE + s.route);
          await settle(page);
          if (s.action) {
            await s.action(page);
            await settle(page);
          }
          await measure(page, s.id, s.route, s.state, width);
        } finally {
          await ctx.close();
        }
      });
    }

    // Resultados da leitura na portaria, com a câmera simulada lendo um QR de verdade (V02, V05 a V09).
    const gate: [string, string, string | number, ('result' | 'hang' | 'abort')?][] = [
      ['V05', 'entrada liberada', WIDTHS.indexOf(width)],
      ['V06', 'ingresso ja utilizado', S.qrUsed!],
      ['V07', 'ingresso invalido', 'PX1.qr-adulterado-ficticio'],
      ['V07', 'ingresso cancelado', S.qrCancelled!],
      ['V08', 'ingresso de outro evento', S.qrOtherEvent!],
      ['V09', 'falha ao consultar o servidor', S.qrUsed!, 'abort'],
      ['V02', 'camera lendo', 'texto-qualquer-sem-resultado', 'hang'],
    ];
    for (const [id, state, qrRef, mode = 'result'] of gate) {
      test(`${id} ${state}`, async () => {
        started(id, '/portaria/:evento', state, width);
        const qr = typeof qrRef === 'number' ? S.freshQrs[qrRef]! : qrRef;
        const scan = await scanQr(BASE, EV[roxa]!, qr, {
          viewport: { width, height: HEIGHT[width]! },
          waitResult: mode === 'result',
          before:
            mode === 'abort'
              ? page => page.route('**/api/gate/scan', r => r.abort())
              : mode === 'hang'
                ? page => page.route('**/api/gate/scan', () => {})
                : undefined,
        });
        try {
          await measure(scan.page, id, '/portaria/:evento', state, width, false);
        } finally {
          await scan.close();
        }
      });
    }

    test('INTRO abertura em video', async ({ browser }) => {
      started('INTRO', '/', 'abertura em video', width);
      const ctx = await newContext(browser, width, undefined, true);
      try {
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`);
        await page.waitForTimeout(1200);
        await measure(page, 'INTRO', '/', 'abertura em video', width, false);
      } finally {
        await ctx.close();
      }
    });

    // E-mails (E01 a E03 e C10): o HTML enviado, capturado pelo servidor local, aberto nesta largura.
    test('E-mails enviados', async ({ browser }) => {
      const dir = path.join(RESP_DIR, 'server/.data/emails');
      const latest = new Map<string, string>();
      for (const f of readdirSync(dir).filter(f => f.endsWith('.html')).sort()) latest.set(f.split('-').slice(1).join('-'), f);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768 });
      try {
        for (const [tpl, ids] of [
          ['cadastro.html', 'E01'],
          ['recuperacao_senha.html', 'E02'],
          ['compra_confirmada.html', 'E03'],
          ['pagamento_sem_estoque.html', 'C10'],
        ] as const) {
          const f = latest.get(tpl);
          expect(f, `e-mail ${tpl} não capturado`).toBeTruthy();
          const page = await ctx.newPage();
          await page.setContent(readFileSync(path.join(dir, f!), 'utf8'));
          await measure(page, ids, `e-mail ${tpl}`, `email ${tpl.replace('.html', '')}`, width);
          await page.close();
        }
      } finally {
        await ctx.close();
      }
    });
  });
}
