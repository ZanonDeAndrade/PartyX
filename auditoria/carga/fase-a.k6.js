// Fase A da carga da auditoria: ABERTURA DAS VENDAS de um evento de 500 ingressos numa cidade pequena.
// - abertura: VISITANTES pessoas chegam nos primeiros 2 min e ficam 10 min navegando (página do evento: HTML e API), com pausas de leitura;
// - pedidos: PEDIDOS_POR_MIN compras por minuto por 10 min (login, pedido com reserva, Pix, confirmação pelo caminho do webhook do gateway
//   FICTÍCIO, consulta do pedido e Meus ingressos). Com 600 tentativas para 500 ingressos, as recusas por estoque são esperadas.
// Alvo: só o servidor local. Nunca produção.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE = __ENV.BASE_URL;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE || '')) fail(`recusado: BASE_URL precisa ser local (recebido ${BASE})`);
const seed = JSON.parse(open(__ENV.SEED_FILE));
const buyers = new SharedArray('compradores', () => seed.buyers);
const VISITANTES = Number(__ENV.VISITANTES || 300);
const PEDIDOS_POR_MIN = Number(__ENV.PEDIDOS_POR_MIN || 60);
const DURACAO = __ENV.DURACAO || '10m';

const iniciadas = new Counter('compras_iniciadas');
const concluidas = new Counter('compras_concluidas');
const recusadasEstoque = new Counter('compras_recusadas_por_estoque');
const errosInesperados = new Counter('erros_inesperados');
const compraTotal = new Trend('compra_completa_ms', true);
const ttfbEvento = new Trend('ttfb_pagina_evento_ms', true);

export const options = {
  scenarios: {
    abertura: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: VISITANTES },
        { duration: '8m', target: VISITANTES },
      ],
      gracefulRampDown: '10s',
      exec: 'visitante',
    },
    pedidos: {
      executor: 'constant-arrival-rate',
      rate: PEDIDOS_POR_MIN,
      timeUnit: '1m',
      duration: DURACAO,
      preAllocatedVUs: Math.ceil(PEDIDOS_POR_MIN / 2),
      maxVUs: PEDIDOS_POR_MIN * 2,
      exec: 'compra',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    erros_inesperados: ['count==0'],
    'http_req_duration{etapa:evento_html}': ['p(95)<1000'],
    'http_req_duration{etapa:evento_api}': ['p(95)<1000'],
    'http_req_duration{etapa:compra_1_login}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_2_pedido_reserva}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_3_pix}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_4_confirmacao}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_5_pedido}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_6_meus_ingressos}': ['p(95)<5000'],
    ...Object.fromEntries(
      ['evento_html', 'evento_api', 'compra_1_login', 'compra_2_pedido_reserva', 'compra_3_pix', 'compra_4_confirmacao', 'compra_5_pedido', 'compra_6_meus_ingressos'].map(e => [`http_reqs{etapa:${e}}`, ['count>=0']]),
    ),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const legal = http.get(`${BASE}/api/legal/versions`).json();
  return { cancellation: legal.cancellation };
}

export function visitante() {
  const html = http.get(`${BASE}/eventos/${seed.slug}`, { tags: { etapa: 'evento_html' } });
  ttfbEvento.add(html.timings.waiting);
  check(html, { 'página do evento 200': r => r.status === 200 });
  const api = http.get(`${BASE}/api/public/events/${seed.slug}`, { tags: { etapa: 'evento_api' } });
  check(api, { 'API do evento 200': r => r.status === 200 });
  sleep(5 + Math.random() * 10);
}

export function compra(data) {
  const i = exec.scenario.iterationInTest % buyers.length;
  const buyer = buyers[i];
  const jar = http.cookieJar();
  jar.clear(BASE);
  const started = Date.now();
  iniciadas.add(1);
  const headers = { 'Content-Type': 'application/json', Origin: BASE };
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: buyer.email, password: buyer.password }), { headers, tags: { etapa: 'compra_1_login' } });
  if (login.status !== 200) {
    errosInesperados.add(1);
    return;
  }
  const me = http.get(`${BASE}/api/auth/me`, { tags: { etapa: 'compra_1_login' } });
  const csrf = me.json('csrfToken');
  const h = Object.assign({}, headers, { 'X-CSRF-Token': csrf });
  const qty = 1 + (i % 2); // 1 ou 2 ingressos
  const type = i % 10 < 7 ? seed.types.pista : seed.types.vip;
  const order = http.post(
    `${BASE}/api/orders`,
    JSON.stringify({ eventSlug: seed.slug, items: [{ ticketTypeId: type, quantity: qty }], couponCode: null, cancellationAccepted: true, cancellationVersion: data.cancellation }),
    { headers: h, tags: { etapa: 'compra_2_pedido_reserva' } },
  );
  if (order.status === 409) {
    recusadasEstoque.add(1);
    return;
  }
  if (order.status !== 201) {
    errosInesperados.add(1);
    return;
  }
  const orderId = order.json('order.id');
  const pay = http.post(`${BASE}/api/orders/${orderId}/payment`, JSON.stringify({ method: 'pix' }), { headers: h, tags: { etapa: 'compra_3_pix' } });
  if (pay.status !== 201) {
    errosInesperados.add(1);
    return;
  }
  sleep(1 + Math.random() * 3); // tempo de abrir o app do banco
  const conf = http.post(`${BASE}/api/dev/mock-gateway/${orderId}/aprovado`, null, { tags: { etapa: 'compra_4_confirmacao' } });
  if (conf.status !== 200) {
    errosInesperados.add(1);
    return;
  }
  let paid = false;
  for (let k = 0; k < 10 && !paid; k++) {
    const o = http.get(`${BASE}/api/orders/${orderId}`, { tags: { etapa: 'compra_5_pedido' } });
    paid = o.status === 200 && o.json('order.status') === 'pago';
    if (!paid) sleep(0.5);
  }
  if (!paid) {
    errosInesperados.add(1);
    return;
  }
  const tickets = http.get(`${BASE}/api/tickets`, { tags: { etapa: 'compra_6_meus_ingressos' } });
  check(tickets, { 'meus ingressos 200': r => r.status === 200 });
  concluidas.add(1);
  compraTotal.add(Date.now() - started);
}
