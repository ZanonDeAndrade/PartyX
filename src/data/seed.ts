import { AL, DAY, MIN, NOW0, RES_MIN } from '../lib/constants';
import { T, cpfFull, fT, norm } from '../lib/format';
import { xr } from '../lib/rng';
import type { Checkin, Customer, Database, Order, PartyEvent, Promoter, StaffUser, Ticket, TicketType } from '../types';

export function buildData(): Database {
  const r = xr(20261017),
    pick = a => a[Math.floor(r() * a.length)];
  const used = new Set();
  const code = () => {
    let s;
    do {
      s = 'PX-';
      for (let i = 0; i < 8; i++) {
        if (i === 4) s += '-';
        s += AL[Math.floor(r() * AL.length)];
      }
    } while (used.has(s));
    used.add(s);
    return s;
  };
  const names = [
    'Marina Costa',
    'Lucas Andrade',
    'Júlia Ribeiro',
    'Pedro Santos',
    'Pedro Santos',
    'Ana Souza',
    'Gabriel Nunes',
    'Letícia Moraes',
    'Rafaela Pinto',
    'Thiago Barros',
    'Camila Duarte',
    'Felipe Rocha',
    'Beatriz Lopes',
    'Vitor Mendes',
    'Larissa Freitas',
    'Diego Carvalho',
    'Isabela Farias',
    'Matheus Cardoso',
    'Natália Borges',
    'Otávio Ramos',
    'Priscila Teles',
    'Renan Vieira',
    'Sofia Queiroz',
    'Yuri Batista',
  ];
  const customers: Customer[] = names.map((n, i) => {
    const base = norm(n).replace(/\s+/g, '.');
    const email = i === 4 ? 'pedroh.santos@exemplo.com' : base + '@exemplo.com';
    const n9 = i === 0 ? '123456789' : String(100000000 + Math.floor(r() * 899999999));
    return {
      id: 'c' + (i + 1),
      name: n,
      email,
      cpf: cpfFull(n9),
      phone:
        i === 0 ? '(55) 99812-4470' : '(55) 99' + (100 + Math.floor(r() * 899)) + '-' + (1000 + Math.floor(r() * 8999)),
      created: T(2026, 9, 1) + Math.floor(r() * 30) * DAY,
      active: true,
      pw: 'demo1234',
    };
  });
  const staff: StaffUser[] = [
    {
      id: 's1',
      name: 'Carla Menezes',
      email: 'carla.menezes@partyx.exemplo',
      role: 'admin',
      active: true,
      pw: 'demo1234',
      created: T(2026, 9, 28, 9),
      last: NOW0 - 50 * MIN,
    },
    {
      id: 's2',
      name: 'Rafael Lima',
      email: 'rafael.lima@partyx.exemplo',
      role: 'validador',
      active: true,
      pw: 'demo1234',
      created: T(2026, 9, 28, 9),
      last: NOW0 - 45 * MIN,
    },
    {
      id: 's3',
      name: 'Joana Prado',
      email: 'joana.prado@partyx.exemplo',
      role: 'validador',
      active: true,
      pw: 'demo1234',
      created: T(2026, 10, 2, 14),
      last: NOW0 - 44 * MIN,
    },
    {
      id: 's4',
      name: 'Bruno Teixeira',
      email: 'bruno.teixeira@partyx.exemplo',
      role: 'validador',
      active: false,
      pw: 'demo1234',
      created: T(2026, 9, 28, 9),
      last: T(2026, 9, 27, 2, 10),
    },
    {
      id: 's5',
      name: 'Paulo Reis',
      email: 'paulo.reis@partyx.exemplo',
      role: 'validador',
      active: true,
      pw: 'temp1234',
      temp: true,
      created: T(2026, 10, 16, 18),
      last: null,
    },
  ];
  const promoters: Promoter[] = [
    { id: 'p1', name: 'Duda Martins', code: 'DUDA', phone: '(55) 99731-2208', active: true, created: T(2026, 9, 5) },
    { id: 'p2', name: 'Téo Almeida', code: 'TEO', phone: '(55) 99645-1187', active: true, created: T(2026, 9, 5) },
    { id: 'p3', name: 'Gabi Rocha', code: 'GABI', phone: '(55) 99802-7731', active: true, created: T(2026, 9, 12) },
    { id: 'p4', name: 'Thiago Pires', code: 'THIAGO', phone: '(55) 99577-0412', active: false, created: T(2026, 9, 5) },
  ];
  const addr = 'Rua das Acácias, 480, Centro, São Gabriel/RS';
  const events: PartyEvent[] = [
    {
      id: 'e1',
      slug: 'noite-neon',
      name: 'Noite Neon',
      start: T(2026, 10, 17, 23, 0),
      venue: 'Galpão Aurora',
      address: addr,
      desc: 'Uma noite de música eletrônica e pop com iluminação neon em toda a pista. Abertura dos portões às 22:30. Documento com foto obrigatório na entrada.',
      attractions: ['DJ Lume', 'Coletivo Vibra', 'MC Prisma'],
      age: '18 anos',
      status: 'publicado',
      featured: true,
      limit: 6,
      c1: '#1F1838',
      c2: '#2A2050',
    },
    {
      id: 'e2',
      slug: 'sunset-session',
      name: 'Sunset Session',
      start: T(2026, 10, 31, 17, 0),
      venue: 'Espaço Mirante',
      address: 'Estrada do Mirante, km 3, São Gabriel/RS',
      desc: 'Fim de tarde ao ar livre com sets de house. O espaço tem área coberta.',
      attractions: ['Duo Marés', 'DJ Sol Nascente'],
      age: '16 anos',
      status: 'publicado',
      featured: false,
      limit: 6,
      c1: '#221A2A',
      c2: '#2D2238',
    },
    {
      id: 'e3',
      slug: 'baile-de-halloween',
      name: 'Baile de Halloween',
      start: T(2026, 11, 7, 22, 0),
      venue: 'Clube Estação',
      address: 'Av. Ferroviária, 1200, São Gabriel/RS',
      desc: 'Baile à fantasia com três ambientes musicais.',
      attractions: ['Banda Lua Cheia', 'DJ Corvo'],
      age: '18 anos',
      status: 'publicado',
      featured: false,
      limit: 6,
      c1: '#1A1A24',
      c2: '#24242F',
    },
    {
      id: 'e4',
      slug: 'festa-branca',
      name: 'Festa Branca',
      start: T(2026, 10, 24, 22, 0),
      venue: 'Casarão 1912',
      address: 'Rua General Osório, 1912, São Gabriel/RS',
      desc: 'Traje branco. Pista com convidados especiais.',
      attractions: ['DJ Alvorada', 'Trio Seda'],
      age: '18 anos',
      status: 'publicado',
      featured: false,
      limit: 4,
      c1: '#24242C',
      c2: '#2E2E38',
    },
    {
      id: 'e5',
      slug: 'reveillon-partyx-2027',
      name: 'Réveillon PartyX 2027',
      start: T(2026, 12, 31, 22, 0),
      venue: 'Galpão Aurora',
      address: addr,
      desc: 'Virada do ano no Galpão Aurora.',
      attractions: ['Atrações a anunciar'],
      age: '18 anos',
      status: 'rascunho',
      featured: false,
      limit: 6,
      c1: '#1C1830',
      c2: '#262040',
    },
    {
      id: 'e6',
      slug: 'noite-retro',
      name: 'Noite Retrô',
      start: T(2026, 9, 26, 23, 0),
      venue: 'Galpão Aurora',
      address: addr,
      desc: 'Clássicos dos anos 80, 90 e 2000.',
      attractions: ['DJ Fita K7', 'Banda Vinil'],
      age: '18 anos',
      status: 'encerrado',
      featured: false,
      limit: 6,
      c1: '#221C1C',
      c2: '#2C2424',
    },
  ];
  events.forEach(e => {
    e.banner = e.id !== 'e5';
  });
  const ty = (
    id: string,
    eventId: string,
    name: string,
    price: number,
    total: number,
    start: number,
    end: number,
    active = true,
    half = false,
  ): TicketType => ({ id, eventId, name, price, total, start, end, active, half });
  const types = [
    ty('t11', 'e1', 'Pista 1º lote', 6000, 80, T(2026, 9, 20, 10), T(2026, 10, 4, 23, 59)),
    ty('t12', 'e1', 'Pista 2º lote', 8000, 200, T(2026, 10, 5, 0), T(2026, 10, 18, 3)),
    ty('t13', 'e1', 'Pista Meia-entrada 2º lote', 4000, 60, T(2026, 10, 5, 0), T(2026, 10, 18, 3), true, true),
    ty('t14', 'e1', 'VIP', 15000, 60, T(2026, 9, 20, 10), T(2026, 10, 18, 3)),
    ty('t15', 'e1', 'Camarote', 32000, 20, T(2026, 9, 20, 10), T(2026, 10, 18, 3)),
    ty('t16', 'e1', 'Área Open Bar', 22000, 40, T(2026, 9, 20, 10), T(2026, 10, 18, 3), false),
    ty('t21', 'e2', 'Pista', 5000, 150, T(2026, 10, 1, 10), T(2026, 10, 31, 16)),
    ty('t22', 'e2', 'VIP', 12000, 50, T(2026, 10, 1, 10), T(2026, 10, 31, 16)),
    ty('t31', 'e3', 'Pista 1º lote', 7000, 200, T(2026, 10, 20, 12), T(2026, 11, 7, 21)),
    ty('t32', 'e3', 'VIP', 14000, 60, T(2026, 10, 20, 12), T(2026, 11, 7, 21)),
    ty('t41', 'e4', 'Pista', 9000, 150, T(2026, 9, 25, 10), T(2026, 10, 15, 23, 59)),
    ty('t42', 'e4', 'Camarote', 25000, 20, T(2026, 9, 25, 10), T(2026, 10, 15, 23, 59)),
    ty('t51', 'e5', 'Pista 1º lote', 15000, 300, T(2026, 11, 1, 10), T(2026, 12, 31, 21)),
    ty('t61', 'e6', 'Pista', 5000, 100, T(2026, 9, 1, 10), T(2026, 9, 26, 23)),
    ty('t62', 'e6', 'VIP', 11000, 30, T(2026, 9, 1, 10), T(2026, 9, 26, 23)),
  ];
  const tById = (id: string) => types.find(t => t.id === id)!,
    cById = (id: string) => customers.find(c => c.id === id)!;
  const orders: Order[] = [],
    tickets: Ticket[] = [];
  const issue = (o, typeId, q) => {
    for (let i = 0; i < q; i++)
      tickets.push({
        id: 'k' + (tickets.length + 1),
        code: code(),
        orderId: o.id,
        typeId,
        eventId: o.eventId,
        holder: cById(o.userId).name,
        status: 'valido',
        issued: o.paidAt! + (5 + Math.floor(r() * 20)) * 1000,
        usedAt: null,
        usedBy: null,
        method: null,
      });
  };
  const mk = (o: any): Order => {
    o.id = 'o' + (orders.length + 1);
    o.hist = o.hist || [];
    o.attempts = 1;
    o.gw =
      'pay_' +
      Math.floor(r() * 1e9)
        .toString(16)
        .toUpperCase();
    orders.push(o);
    return o;
  };
  const gen = (typeId, count, from, to) => {
    const t = tById(typeId);
    let left = count;
    while (left > 0) {
      const q = Math.min(left, 1 + Math.floor(r() * r() * 4));
      left -= q;
      const buyer = customers[1 + Math.floor(r() * (customers.length - 1))];
      const created = from + Math.floor(r() * (to - from));
      const promo =
        r() < 0.45
          ? pick(created < T(2026, 10, 1) ? ['p1', 'p1', 'p2', 'p3', 'p4'] : ['p1', 'p1', 'p2', 'p3', 'p3'])
          : null;
      const method = r() < 0.62 ? 'pix' : 'card';
      const paidAt = created + (method === 'pix' ? 60000 + Math.floor(r() * 240000) : 9000);
      const o = mk({
        userId: buyer.id,
        eventId: t.eventId,
        promoterId: promo,
        items: [{ typeId, qty: q, unit: t.price }],
        total: q * t.price,
        status: 'pago',
        method,
        created,
        paidAt,
        expiresAt: created + RES_MIN * MIN,
        card4: method === 'card' ? String(1000 + Math.floor(r() * 8999)) : null,
      });
      o.hist.push(
        { t: created, l: 'Pedido criado' },
        { t: paidAt, l: 'Pagamento aprovado pelo gateway' },
        { t: paidAt + 12000, l: 'Ingressos emitidos: ' + q + ' unidade(s)' },
      );
      issue(o, typeId, q);
    }
  };
  gen('t11', 79, T(2026, 9, 20, 10), T(2026, 10, 3, 23));
  gen('t12', 126, T(2026, 10, 5, 1), T(2026, 10, 17, 23, 20));
  gen('t13', 31, T(2026, 10, 5, 1), T(2026, 10, 17, 23));
  gen('t14', 36, T(2026, 9, 20, 10), T(2026, 10, 17, 23));
  gen('t15', 9, T(2026, 9, 22, 10), T(2026, 10, 17, 22));
  gen('t21', 39, T(2026, 10, 1, 10), T(2026, 10, 17, 23));
  gen('t22', 12, T(2026, 10, 1, 10), T(2026, 10, 17, 23));
  gen('t41', 118, T(2026, 9, 25, 10), T(2026, 10, 15, 23));
  gen('t42', 9, T(2026, 9, 25, 10), T(2026, 10, 15, 23));
  gen('t61', 62, T(2026, 9, 1, 10), T(2026, 9, 26, 22));
  gen('t62', 21, T(2026, 9, 1, 10), T(2026, 9, 26, 22));
  const h = (o, t, l) => o.hist.push({ t, l });
  let o = mk({
    userId: 'c1',
    eventId: 'e1',
    promoterId: 'p1',
    items: [
      { typeId: 't12', qty: 2, unit: 8000 },
      { typeId: 't14', qty: 1, unit: 15000 },
    ],
    total: 31000,
    status: 'pago',
    method: 'pix',
    created: T(2026, 10, 5, 14, 18),
    paidAt: T(2026, 10, 5, 14, 22),
    expiresAt: T(2026, 10, 5, 14, 28),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.paidAt!, 'Pagamento aprovado pelo gateway');
  h(o, o.paidAt! + 9000, 'Ingressos emitidos: 3 unidades');
  issue(o, 't12', 2);
  issue(o, 't14', 1);
  o = mk({
    userId: 'c1',
    eventId: 'e6',
    promoterId: null,
    items: [{ typeId: 't61', qty: 2, unit: 5000 }],
    total: 10000,
    status: 'pago',
    method: 'card',
    card4: '4821',
    created: T(2026, 9, 12, 20, 3),
    paidAt: T(2026, 9, 12, 20, 3) + 9000,
    expiresAt: T(2026, 9, 12, 20, 13),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.paidAt!, 'Pagamento aprovado pelo gateway');
  h(o, o.paidAt! + 8000, 'Ingressos emitidos: 2 unidades');
  issue(o, 't61', 2);
  tickets.slice(-2).forEach(k => {
    k.status = 'utilizado';
    k.usedAt = T(2026, 9, 26, 23, 48);
    k.usedBy = 's2';
    k.method = 'câmera';
  });
  o = mk({
    userId: 'c1',
    eventId: 'e2',
    promoterId: 'p2',
    items: [{ typeId: 't21', qty: 1, unit: 5000 }],
    total: 5000,
    status: 'pago',
    method: 'pix',
    created: T(2026, 10, 11, 13, 58),
    paidAt: T(2026, 10, 11, 14, 2),
    expiresAt: T(2026, 10, 11, 14, 8),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.paidAt!, 'Pagamento aprovado pelo gateway');
  h(o, o.paidAt! + 7000, 'Ingressos emitidos: 1 unidade');
  issue(o, 't21', 1);
  const kc = tickets[tickets.length - 1];
  kc.status = 'cancelado';
  kc.cancelAt = T(2026, 10, 13, 10, 5);
  kc.cancelBy = 'Carla Menezes';
  kc.cancelReason = 'Solicitação do comprador';
  h(o, kc.cancelAt, 'Ingresso ' + kc.code + ' cancelado por Carla Menezes. Estorno, se houver, feito no gateway');
  o = mk({
    userId: 'c1',
    eventId: 'e4',
    promoterId: null,
    items: [{ typeId: 't41', qty: 1, unit: 9000 }],
    total: 9000,
    status: 'expirado',
    method: 'pix',
    created: T(2026, 10, 12, 19, 2),
    paidAt: null,
    expiresAt: T(2026, 10, 12, 19, 12),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.created, 'Reserva de 1 ingresso até 19:12');
  h(o, o.expiresAt, 'Prazo encerrado. Reserva liberada e cobrança Pix expirada');
  o = mk({
    userId: 'c1',
    eventId: 'e1',
    promoterId: null,
    items: [{ typeId: 't11', qty: 1, unit: 6000 }],
    total: 6000,
    status: 'estornado',
    method: 'card',
    card4: '4821',
    created: T(2026, 10, 3, 16, 9),
    paidAt: T(2026, 10, 3, 16, 10),
    expiresAt: T(2026, 10, 3, 16, 19),
    refundAt: T(2026, 10, 6, 11, 20),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.paidAt!, 'Pagamento aprovado pelo gateway');
  h(o, o.paidAt! + 8000, 'Ingressos emitidos: 1 unidade');
  issue(o, 't11', 1);
  h(o, o.refundAt, 'Estorno informado pelo gateway. Ingressos cancelados automaticamente');
  const kr = tickets[tickets.length - 1];
  kr.status = 'cancelado';
  kr.cancelAt = o.refundAt;
  kr.cancelBy = 'Gateway (estorno)';
  kr.cancelReason = 'Estorno no gateway';
  o = mk({
    userId: 'c2',
    eventId: 'e1',
    promoterId: 'p3',
    items: [{ typeId: 't11', qty: 1, unit: 6000 }],
    total: 6000,
    status: 'pago_sem_estoque',
    method: 'pix',
    created: T(2026, 10, 4, 23, 41),
    paidAt: T(2026, 10, 4, 23, 58),
    expiresAt: T(2026, 10, 4, 23, 51),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.created, 'Reserva de 1 ingresso até 23:51');
  h(o, o.expiresAt, 'Prazo encerrado. Reserva liberada');
  h(o, o.paidAt!, 'Pagamento aprovado após o prazo');
  h(
    o,
    o.paidAt! + 2000,
    'Sem estoque para emissão. Nenhum ingresso emitido. Aguardando estorno pela PartyX no gateway',
  );
  o = mk({
    userId: 'c3',
    eventId: 'e6',
    promoterId: 'p4',
    items: [{ typeId: 't62', qty: 1, unit: 11000 }],
    total: 11000,
    status: 'contestado',
    method: 'card',
    card4: '0934',
    created: T(2026, 9, 14, 21, 30),
    paidAt: T(2026, 9, 14, 21, 30) + 9000,
    expiresAt: T(2026, 9, 14, 21, 40),
    refundAt: T(2026, 9, 22, 9, 15),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.paidAt!, 'Pagamento aprovado pelo gateway');
  h(o, o.paidAt! + 8000, 'Ingressos emitidos: 1 unidade');
  issue(o, 't62', 1);
  h(o, o.refundAt, 'Contestação (chargeback) informada pelo gateway. Ingressos cancelados');
  const kx = tickets[tickets.length - 1];
  kx.status = 'cancelado';
  kx.cancelAt = o.refundAt;
  kx.cancelBy = 'Gateway (contestação)';
  kx.cancelReason = 'Contestação no cartão';
  o = mk({
    userId: 'c6',
    eventId: 'e1',
    promoterId: null,
    items: [{ typeId: 't12', qty: 2, unit: 8000 }],
    total: 16000,
    status: 'pendente',
    method: 'pix',
    created: NOW0 - 4 * MIN,
    paidAt: null,
    expiresAt: NOW0 + 6 * MIN,
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.created, 'Reserva de 2 ingressos até ' + fT(o.expiresAt));
  o = mk({
    userId: 'c4',
    eventId: 'e1',
    promoterId: null,
    items: [{ typeId: 't14', qty: 1, unit: 15000 }],
    total: 15000,
    status: 'nao_concluido',
    method: 'card',
    created: T(2026, 10, 16, 20, 10),
    paidAt: null,
    expiresAt: T(2026, 10, 16, 20, 20),
  });
  h(o, o.created, 'Pedido criado');
  h(o, o.created + 20000, 'Pagamento recusado pela operadora do cartão. Reserva liberada');
  orders
    .sort((a, b) => a.created - b.created)
    .forEach((x, i) => {
      x.num = 'PX-' + (10001 + i);
    });
  const checkins: Checkin[] = [];
  const ev1Start = T(2026, 10, 17, 23, 0);
  tickets.forEach(k => {
    const ord = orders.find(x => x.id === k.orderId)!;
    if (k.status !== 'valido' || ord.status !== 'pago' || ord.userId === 'c1') return;
    if (k.eventId === 'e1' && r() < 0.58) {
      k.status = 'utilizado';
      k.usedAt = ev1Start + Math.floor(r() * 39 * MIN);
      k.usedBy = r() < 0.5 ? 's2' : 's3';
      k.method = r() < 0.9 ? 'câmera' : 'manual';
    }
    if (k.eventId === 'e6' && r() < 0.88) {
      k.status = 'utilizado';
      k.usedAt = T(2026, 9, 26, 23, 0) + Math.floor(r() * 150 * MIN);
      k.usedBy = r() < 0.5 ? 's2' : 's4';
      k.method = r() < 0.9 ? 'câmera' : 'manual';
    }
  });
  tickets
    .filter(k => k.status === 'utilizado')
    .forEach(k =>
      checkins.push({
        ticketId: k.id,
        code: k.code,
        eventId: k.eventId,
        by: k.usedBy!,
        result: 'valido',
        method: k.method!,
        at: k.usedAt!,
      }),
    );
  const e1used = tickets.filter(k => k.eventId === 'e1' && k.status === 'utilizado');
  [0, 1, 2].forEach(i => {
    const k = e1used[i * 7];
    if (k)
      checkins.push({
        ticketId: k.id,
        code: k.code,
        eventId: 'e1',
        by: 's2',
        result: 'ja_utilizado',
        method: 'câmera',
        at: k.usedAt! + 90000,
      });
  });
  checkins.push({
    ticketId: null,
    code: 'PX-8Q2M-XXXX',
    eventId: 'e1',
    by: 's3',
    result: 'invalido',
    method: 'câmera',
    at: ev1Start + 21 * MIN,
  });
  checkins.push({
    ticketId: kr.id,
    code: kr.code,
    eventId: 'e1',
    by: 's3',
    result: 'cancelado',
    method: 'câmera',
    at: ev1Start + 33 * MIN,
  });
  checkins.sort((a, b) => a.at - b.at);
  const audit = [
    { t: T(2026, 10, 1, 9, 12), by: 'Carla Menezes', l: 'Promoter THIAGO desativado', ent: 'p4' },
    { t: T(2026, 10, 10, 18, 40), by: 'Carla Menezes', l: 'Usuário Bruno Teixeira desativado', ent: 's4' },
    {
      t: kc.cancelAt,
      by: 'Carla Menezes',
      l: 'Ingresso ' + kc.code + ' cancelado. Motivo: Solicitação do comprador',
      ent: kc.id,
    },
    { t: T(2026, 10, 16, 18, 2), by: 'Carla Menezes', l: 'Usuário Paulo Reis criado com perfil Validador', ent: 's5' },
  ];
  return {
    customers,
    staff,
    promoters,
    events,
    types,
    orders,
    tickets,
    checkins,
    audit,
    nextNum: 10001 + orders.length,
  };
}
