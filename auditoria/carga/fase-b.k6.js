// Fase B da carga da auditoria: WEBHOOKS do gateway (500 notificações em 5 min, com 10% de assinatura inválida e repetições) e
// PORTARIA (500 leituras por 3 validadores). O tempo da portaria é comprimido (PORTARIA_DURACAO): a quantidade é a do dia do evento.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE = __ENV.BASE_URL;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE || '')) fail(`recusado: BASE_URL precisa ser local (recebido ${BASE})`);
const seed = JSON.parse(open(__ENV.SEED_FILE));
const dump = JSON.parse(open(__ENV.DUMP_FILE));
const orders = new SharedArray('pedidos', () => dump.orders);
const tickets = new SharedArray('ingressos', () => dump.tickets);
const WEBHOOKS = Number(__ENV.WEBHOOKS || 500);
const LEITURAS = Number(__ENV.LEITURAS || 500);
const PORTARIA_DURACAO = __ENV.PORTARIA_DURACAO || '9m';
const WEBHOOK_DURACAO = __ENV.WEBHOOK_DURACAO || '5m';

const whValidos = new Counter('webhooks_validos_200');
const whInvalidos = new Counter('webhooks_invalidos_401');
const whErros = new Counter('webhooks_erros');
const leituras = new Counter('leituras');
const leiturasValidas = new Counter('leituras_validas');
const leiturasRepetidas = new Counter('leituras_ja_utilizado');
const leiturasErro = new Counter('leituras_erro');

const portariaRate = Math.ceil(LEITURAS / (Number(PORTARIA_DURACAO.replace('m', '')) || 9));
export const options = {
  scenarios: {
    webhooks: {
      executor: 'constant-arrival-rate',
      rate: Math.ceil(WEBHOOKS / (Number(WEBHOOK_DURACAO.replace('m', '')) || 5)),
      timeUnit: '1m',
      duration: WEBHOOK_DURACAO,
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: 'webhook',
    },
    portaria: {
      executor: 'constant-arrival-rate',
      rate: portariaRate,
      timeUnit: '1m',
      duration: PORTARIA_DURACAO,
      preAllocatedVUs: 3,
      maxVUs: 3,
      exec: 'leitura',
      startTime: WEBHOOK_DURACAO,
    },
  },
  thresholds: {
    webhooks_erros: ['count==0'],
    leituras_erro: ['count==0'],
    'http_req_duration{etapa:webhook}': ['p(95)<2000'],
    'http_req_duration{etapa:portaria_scan}': ['p(95)<1000'],
    'http_req_duration{etapa:portaria_contador}': ['p(95)<1000'],
    ...Object.fromEntries(['webhook', 'webhook_invalido', 'portaria_scan', 'portaria_contador'].map(e => [`http_reqs{etapa:${e}}`, ['count>=0']])),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function webhook() {
  const i = exec.scenario.iterationInTest;
  if (i % 10 === 9) {
    // Assinatura inválida: precisa voltar 401 e não mudar nada.
    const res = http.post(`${BASE}/api/webhooks/payments`, JSON.stringify({ id: `evt_falso_${i}`, paymentId: 'mock_x', type: 'payment.aprovado' }), {
      headers: { 'Content-Type': 'application/json', 'x-mock-signature': 'invalida' },
      tags: { etapa: 'webhook_invalido' },
    });
    if (res.status === 401) whInvalidos.add(1);
    else whErros.add(1);
    return;
  }
  // Repetição da confirmação de um pedido já pago (idempotência) pelo caminho do webhook do gateway fictício.
  const orderId = orders[i % orders.length];
  const res = http.post(`${BASE}/api/dev/mock-gateway/${orderId}/aprovado`, null, { tags: { etapa: 'webhook' } });
  if (res.status === 200) whValidos.add(1);
  else whErros.add(1);
}

const validatorSessions = {};
function validatorHeaders() {
  const v = exec.vu.idInTest % 3;
  if (!validatorSessions[v]) {
    const email = seed.validators[v];
    const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: seed.password }), { headers: { 'Content-Type': 'application/json', Origin: BASE }, tags: { etapa: 'portaria_login' } });
    if (login.status !== 200) fail(`login do validador ${v} falhou: ${login.status}`);
    const csrf = http.get(`${BASE}/api/auth/me`, { tags: { etapa: 'portaria_login' } }).json('csrfToken');
    validatorSessions[v] = { 'Content-Type': 'application/json', Origin: BASE, 'X-CSRF-Token': csrf };
  }
  return validatorSessions[v];
}

export function leitura() {
  const i = exec.scenario.iterationInTest;
  const h = validatorHeaders();
  // 1 em cada 12 leituras é um QR já usado (alguém tentando entrar de novo).
  const qr = i % 12 === 11 ? tickets[Math.max(0, i - 11) % tickets.length] : tickets[i % tickets.length];
  const res = http.post(`${BASE}/api/gate/scan`, JSON.stringify({ eventId: seed.eventId, qr }), { headers: h, tags: { etapa: 'portaria_scan' } });
  leituras.add(1);
  if (res.status !== 200) {
    leiturasErro.add(1);
    return;
  }
  const result = res.json('result');
  if (result === 'valido') leiturasValidas.add(1);
  else if (result === 'ja_utilizado') leiturasRepetidas.add(1);
  // O contador da tela é consultado a cada 4 s por aparelho: aqui, uma consulta por leitura.
  const counter = http.get(`${BASE}/api/gate/events/${seed.eventId}/counter`, { headers: h, tags: { etapa: 'portaria_contador' } });
  check(counter, { 'contador 200': r => r.status === 200 });
}
