// Teste de carga do PDF 11.3 com k6: abertura de vendas de um evento grande.
// - visitantes: VISITANTES usuários simultâneos (padrão 200) abrindo a página do evento (HTML + API do evento), com pausa de leitura;
// - compras: COMPRAS_POR_MIN compras por minuto (padrão 50) em taxa de chegada constante: login, pedido com reserva (2 unidades),
//   Pix, confirmação do gateway FICTÍCIO pelo caminho do webhook e Meus ingressos.
// Só contra o servidor LOCAL (run-carga.sh): a confirmação usa a rota do gateway fictício, que não existe em homologação nem em
// produção. Nunca apontar para produção.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL;
const SLUG = __ENV.SLUG;
const TYPE = __ENV.TYPE_ID;
const DURACAO = __ENV.DURACAO || '3m';
const QTD = 2;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE || '')) fail(`recusado: BASE_URL precisa ser o servidor local (recebido: ${BASE})`);

const iniciadas = new Counter('compras_iniciadas');
const concluidas = new Counter('compras_concluidas');
const recusadasEstoque = new Counter('compras_recusadas_por_estoque');
const errosInesperados = new Counter('erros_inesperados');
const compraTotal = new Trend('compra_completa_ms', true);

export const options = {
  scenarios: {
    visitantes: {
      executor: 'constant-vus',
      vus: Number(__ENV.VISITANTES || 200),
      duration: DURACAO,
      exec: 'visitante',
    },
    compras: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.COMPRAS_POR_MIN || 50),
      timeUnit: '1m',
      duration: DURACAO,
      preAllocatedVUs: 20,
      maxVUs: 80,
      exec: 'compra',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    erros_inesperados: ['count==0'],
    // Metas de tempo: página do evento em até 1 s no p95. As etapas da compra têm limite folgado só para o k6 calcular o p95 de
    // cada uma (submétricas só existem com limite declarado).
    'http_req_duration{etapa:evento_html}': ['p(95)<1000'],
    'http_req_duration{etapa:evento_api}': ['p(95)<1000'],
    'http_req_duration{etapa:compra_1_login}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_2_pedido_reserva}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_3_pix}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_4_confirmacao}': ['p(95)<5000'],
    'http_req_duration{etapa:compra_5_meus_ingressos}': ['p(95)<5000'],
    'http_req_failed{etapa:evento_html}': ['rate<0.01'],
    'http_req_failed{etapa:evento_api}': ['rate<0.01'],
    compra_completa_ms: ['p(95)<10000'],
    // Só para o resumo trazer a contagem de cada etapa.
    ...Object.fromEntries(
      ['evento_html', 'evento_api', 'compra_1_login', 'compra_2_pedido_reserva', 'compra_3_pix', 'compra_4_confirmacao', 'compra_5_meus_ingressos'].map(
        e => [`http_reqs{etapa:${e}}`, ['count>=0']],
      ),
    ),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Cada usuário virtual com um IP próprio (TRUSTED_PROXY_HOPS=1): os limites por IP do servidor tratam cada um como uma pessoa.
const ip = n => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

export function visitante() {
  const headers = { 'x-forwarded-for': ip(exec.vu.idInTest) };
  const html = http.get(`${BASE}/eventos/${SLUG}`, { headers, tags: { etapa: 'evento_html' } });
  const api = http.get(`${BASE}/api/public/events/${SLUG}`, { headers, tags: { etapa: 'evento_api' } });
  if (!check(html, { 'página do evento 200': r => r.status === 200 }) || !check(api, { 'API do evento 200': r => r.status === 200 }))
    errosInesperados.add(1, { etapa: 'visitante' });
  sleep(1 + Math.random() * 2);
}

export function compra() {
  const n = exec.scenario.iterationInTest;
  const t0 = Date.now();
  iniciadas.add(1);
  http.cookieJar().clear(BASE);
  const headers = { origin: BASE, 'x-forwarded-for': ip(100000 + n), 'content-type': 'application/json' };
  const bad = (etapa, r) => {
    errosInesperados.add(1, { etapa });
    console.error(`compra ${n}: ${etapa} ${r.status} ${String(r.body).slice(0, 200)}`);
  };

  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: `carga${n}@exemplo.com`, password: 'festa2026Forte' }), {
    headers,
    tags: { etapa: 'compra_1_login' },
  });
  if (login.status !== 200) return bad('login', login);
  const me = http.get(`${BASE}/api/auth/me`, { headers, tags: { etapa: 'compra_1_login' } });
  const auth = { ...headers, 'x-csrf-token': me.json('csrfToken') };

  const pedido = http.post(
    `${BASE}/api/orders`,
    JSON.stringify({ eventSlug: SLUG, items: [{ ticketTypeId: TYPE, quantity: QTD }], couponCode: null }),
    // 409 = estoque acabou: recusa esperada depois do esgotamento, não é erro do sistema.
    { headers: auth, tags: { etapa: 'compra_2_pedido_reserva' }, responseCallback: http.expectedStatuses(201, 409) },
  );
  if (pedido.status === 409) {
    recusadasEstoque.add(1);
    return;
  }
  if (pedido.status !== 201) return bad('pedido', pedido);
  const id = pedido.json('order.id');

  const pix = http.post(`${BASE}/api/orders/${id}/payment`, JSON.stringify({ method: 'pix' }), {
    headers: auth,
    tags: { etapa: 'compra_3_pix' },
  });
  if (pix.status !== 201) return bad('pix', pix);

  const conf = http.post(`${BASE}/api/dev/mock-gateway/${id}/aprovado`, null, { headers: auth, tags: { etapa: 'compra_4_confirmacao' } });
  if (conf.status !== 200 || conf.json('outcome') !== 'confirmado') return bad('confirmacao', conf);

  const ing = http.get(`${BASE}/api/tickets`, { headers: auth, tags: { etapa: 'compra_5_meus_ingressos' } });
  const meus = ing.status === 200 ? (ing.json('tickets') || []).filter(t => t.orderId === id).length : -1;
  if (meus !== QTD) return bad('ingressos', ing);
  concluidas.add(1);
  compraTotal.add(Date.now() - t0);
}
