import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { readTextosState, TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Formulários no celular (pedido de 16/10/2026): no iPhone, os campos de data e hora do evento passavam da borda direita e ficavam
 * com o texto centrado. Em cada tela do painel (e nas do site com data), falha se houver:
 * - rolagem lateral da página;
 * - campo, botão ou tabela que passe da borda da tela (fora de um recorte com rolagem própria);
 * - campo de data ou hora com texto que não esteja à esquerda (medido nos pixels), altura diferente dos campos de texto ou fonte
 *   abaixo de 16 px.
 * O WebKit do Playwright (Linux) usa o mesmo controle de data do iPhone (o valor em ::-webkit-date-and-time-value), mas sem as regras
 * de estilo do iOS. Elas são postas numa camada de baixa prioridade, como as do navegador (copiadas de Source/WebCore/css/html.css,
 * ramo IOS_FAMILY; as cores do sistema viram aproximações). O controle nativo do iPhone, com a largura mínima dele, não existe aqui.
 */
const R = readTextosState();
const IMG = path.join(TEXTOS_DIR, '..', 'painel-celular', 'img');
const ETAPA = process.env.CAPTURA ?? 'depois';
test.beforeAll(() => mkdirSync(IMG, { recursive: true }));

const IOS_UA = `@layer simulacao-ios {
  input { font: 11px system-ui; padding-block: 0.2em 0.3em; padding-inline: 0.5em; }
  input:is([type="date"], [type="time"], [type="datetime-local"]) {
    align-items: center; display: inline-flex; overflow: hidden; border: 1px solid #d1d1d6; font-family: system-ui;
    padding-block: 0.2em; padding-inline: 0.5em; background-color: #e9e9eb; color: #007aff;
  }
  input::-webkit-date-and-time-value { margin: 0; text-align: center; inline-size: 100%; }
}`;
test.beforeEach(async ({ page, browserName }) => {
  // Sem a abertura (aviso só de teste): ela toca em toda carga de página fora das rotas de tarefa (aqui, a minha conta do site).
  await page.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
  if (browserName !== 'webkit') return;
  await page.addInitScript(css => {
    const add = () => {
      const st = document.createElement('style');
      st.textContent = css;
      (document.head ?? document.documentElement).append(st);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  }, IOS_UA);
});

const LOGIN = { admin: 'admin@partyx.test', buyer: 'compradora.com.um.endereco.de.email.bem.comprido.para.testar.a.quebra@partyx.test' };
/** Entra e volta direto para a tela testada (sem passar pelo início: lá o mouse parado em cima do destaque dispara o
 *  pré-carregamento do evento, que a navegação seguinte cancela e o WebKit acusa como erro da página). */
async function login(page: Page, who: keyof typeof LOGIN, back: string) {
  await page.goto(`${R.base}/entrar?voltar=${encodeURIComponent(back)}`, { waitUntil: 'networkidle' });
  await page.fill('#email', LOGIN[who]);
  await page.fill('#senha', 'festa2026');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
}

/** Roda na página. Devolve os problemas (vazio = ok). */
function detect() {
  const vw = document.documentElement.clientWidth;
  const issues: string[] = [];
  const name = (el: Element) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('type') ? `[${el.getAttribute('type')}]` : '');
  if (document.documentElement.scrollWidth > vw) issues.push(`rolagem lateral: ${document.documentElement.scrollWidth} > ${vw}`);
  // Dentro de um recorte com rolagem própria (tabela larga de propósito), passar da tela é esperado.
  const scroller = (el: Element) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true;
    }
    return false;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  for (const el of document.querySelectorAll('#conteudo input, #conteudo select, #conteudo textarea, #conteudo button, #conteudo table, [role=dialog] input, [role=dialog] select, [role=dialog] textarea, [role=dialog] button')) {
    if (!visible(el) || scroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5 || r.left < -0.5) issues.push(`${name(el)} fora da tela (${Math.round(r.left)} a ${Math.round(r.right)} de ${vw})`);
  }
  // Palavra curta partida em mais de uma linha (como o "R$" do campo de valor, que virava "R" em cima de "$").
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? '').trim();
    const el = n.parentElement;
    if (!t || t.length > 12 || /\s/.test(t) || !el || !visible(el) || !el.closest('#conteudo, [role=dialog]')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const tops = new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top)));
    if (tops.size > 1) issues.push(`"${t}" partido em ${tops.size} linhas`);
  }
  const text = [...document.querySelectorAll<HTMLInputElement>('.px-field input:not([type]), .px-field input[type=text], .px-field input[type=email]')].find(visible);
  const textH = text ? text.getBoundingClientRect().height : 48;
  for (const el of document.querySelectorAll<HTMLInputElement>('input[type=date], input[type=time], input[type=datetime-local]')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const h = el.getBoundingClientRect().height;
    if (!['left', 'start', '-webkit-left'].includes(s.textAlign)) issues.push(`${name(el)} com texto em ${s.textAlign}`);
    if (Math.abs(h - textH) > 1) issues.push(`${name(el)} com ${h.toFixed(1)} px de altura (texto: ${textH.toFixed(1)})`);
    if (parseFloat(s.fontSize) < 16) issues.push(`${name(el)} com fonte de ${s.fontSize}`);
    const parent = el.parentElement!.getBoundingClientRect();
    if (el.getBoundingClientRect().right > parent.right + 0.5) issues.push(`${name(el)} passa da caixa do campo`);
  }
  return [...new Set(issues)];
}

type Step = (page: Page) => Promise<void>;
const click = (label: string, role: 'button' | 'link' | 'tab' = 'button'): Step => async page => {
  await page.getByRole(role, { name: label, exact: true }).first().click();
  await page.waitForTimeout(400);
};
const tab = (label: string) => click(label, 'tab');
interface Screen {
  id: string;
  path: string;
  who?: keyof typeof LOGIN;
  open?: Step[];
  /** Captura da página inteira (o formulário do evento, antes e depois). */
  shot?: boolean;
}
const SCREENS: Screen[] = [
  { id: 'evento-novo', path: '/admin/eventos/novo', shot: true },
  { id: 'evento-editar', path: `/admin/eventos/${R.eventId}/editar`, shot: true },
  { id: 'evento-detalhe', path: `/admin/eventos/${R.eventId}` },
  { id: 'evento-tipos', path: `/admin/eventos/${R.eventId}`, open: [tab('Tipos de ingresso')] },
  { id: 'tipo-novo', path: `/admin/eventos/${R.eventId}`, open: [tab('Tipos de ingresso'), click('Novo tipo de ingresso')], shot: true },
  { id: 'tipo-editar', path: `/admin/eventos/${R.eventId}`, open: [tab('Tipos de ingresso'), click('Editar tipo')] },
  { id: 'lote-novo', path: `/admin/eventos/${R.eventId}`, open: [tab('Tipos de ingresso'), click('Novo lote')], shot: true },
  { id: 'evento-entradas', path: `/admin/eventos/${R.eventId}`, open: [tab('Entradas ao vivo')] },
  { id: 'evento-ingressos', path: `/admin/eventos/${R.eventId}`, open: [tab('Ingressos')] },
  { id: 'evento-compradores', path: `/admin/eventos/${R.eventId}`, open: [tab('Compradores')] },
  { id: 'evento-contingencia', path: `/admin/eventos/${R.eventId}`, open: [tab('Contingência')] },
  { id: 'eventos', path: '/admin/eventos' },
  { id: 'inicio', path: '/admin' },
  { id: 'pedidos', path: '/admin/pedidos' },
  { id: 'compradores', path: '/admin/compradores' },
  { id: 'ingressos', path: '/admin/ingressos' },
  { id: 'promoters', path: '/admin/promoters' },
  { id: 'promoter-novo', path: '/admin/promoters', open: [click('Novo promoter')] },
  { id: 'entradas', path: '/admin/entradas' },
  { id: 'equipe', path: '/admin/equipe' },
  { id: 'equipe-novo', path: '/admin/equipe', open: [click('Novo usuário')] },
  { id: 'conta', path: '/admin/conta' },
  { id: 'conta-senha', path: '/admin/conta', open: [click('Alterar senha')] },
  { id: 'configuracoes', path: '/admin/configuracoes', shot: true },
  { id: 'excecoes', path: '/admin/excecoes' },
  { id: 'rel-vendas', path: '/admin/relatorios/vendas' },
  { id: 'rel-promoters', path: '/admin/relatorios/promoters' },
  { id: 'rel-taxa', path: '/admin/relatorios/taxa-mensal' },
  { id: 'pedido', path: `/admin/pedidos/${R.orderId}` },
  { id: 'ingresso', path: `/admin/ingressos/${R.ticketId}` },
  // Site: datas de nascimento.
  { id: 'cadastro', path: '/criar-conta', who: undefined },
  { id: 'minha-conta', path: '/minha-conta', who: 'buyer' },
];

for (const s of SCREENS)
  test(s.id, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    if (s.who !== undefined || !s.path.startsWith('/criar-conta')) await login(page, s.who ?? 'admin', s.path);
    await page.goto(R.base + s.path, { waitUntil: 'networkidle' });
    for (const step of s.open ?? []) await step(page);
    // O cadastro tem a data de nascimento: preenchida, o alinhamento do texto também é medido.
    if (s.id === 'cadastro') await page.locator('input[type=date]').fill('2000-05-17');
    await page.waitForTimeout(300);
    if (s.shot) {
      const dialog = page.getByRole('dialog');
      const target = (await dialog.count()) ? 'dialogo' : 'pagina';
      await page.screenshot({ path: path.join(IMG, `${ETAPA}-${s.id}-${info.project.name}.png`), fullPage: target === 'pagina' });
    }
    expect(await page.evaluate(detect)).toEqual([]);
    expect(await textOffsets(page)).toEqual([]);
    // O botão de escolher a capa (o do navegador) tem a altura de toque dos outros botões.
    const file = page.locator('#ev-banner');
    if (await file.count())
      expect(await file.evaluate(el => parseFloat(getComputedStyle(el, '::file-selector-button').minHeight) || 0)).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });

/** Medido na captura de cada campo de data ou hora: o texto de um campo preenchido começa perto da borda esquerda (padding de
 *  14 px), não no meio; e nada (texto ou ícone) encosta na borda direita, cheio ou vazio. */
async function textOffsets(page: Page) {
  const issues: string[] = [];
  for (const input of await page.locator('input:is([type=date], [type=time], [type=datetime-local])').all()) {
    if (!(await input.isVisible())) continue;
    const id = (await input.getAttribute('id')) ?? 'campo';
    const box = (await input.boundingBox())!;
    const { data, info } = await sharp(await input.screenshot()).greyscale().raw().toBuffer({ resolveWithObject: true });
    const scale = info.width / box.width;
    const dark = (x: number) => {
      for (let y = Math.floor(info.height * 0.2); y < info.height * 0.8; y++) if (data[y * info.width + x]! < 110) return true;
      return false;
    };
    for (let x = info.width - Math.ceil(10 * scale); x < info.width - Math.ceil(3 * scale); x++)
      if (dark(x)) {
        issues.push(`${id}: texto ou ícone encostado na borda direita`);
        break;
      }
    if (!(await input.inputValue())) continue;
    let first = -1;
    for (let x = Math.ceil(4 * scale); x < info.width && first < 0; x++) if (dark(x)) first = x;
    const offset = first / scale;
    if (first < 0 || offset > 24) issues.push(`${id}: texto começa a ${offset.toFixed(0)} px da borda`);
  }
  return issues;
}
