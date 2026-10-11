import { T, brl, pad, fD, fT, fTs, fDT, fDTs, fShort, norm, cpfOk, maskCPF } from '../lib/format';
import { LS, NOW0, MIN, DAY, RES_MIN, AL } from '../lib/constants';
import { B, bd, pb } from '../lib/badges';
import { beep } from '../lib/beep';
import { buildData } from '../data/seed';
import { R, PATH } from './routes';
import { pubV } from './views/public';
import { authV } from './views/auth';
import { ckV } from './views/checkout';
import { meV } from './views/account';
import { admV } from './views/admin';
import { gateV } from './views/gate';
import { overV } from './views/overlays';
import { Logic } from './Logic';
import type { AppState, Database, Loose, Customer, Order, PartyEvent, Ticket, TicketType, User } from '../types';
export class PartyXLogic extends Logic<AppState> {
  scroller: HTMLElement | null = null;
  _mob = false;
  _sk: string | null = null;
  _st: any = null;
  _navKey = '';
  tt: ReturnType<typeof setTimeout> | undefined;
  lt: ReturnType<typeof setTimeout> | undefined;
  iv: ReturnType<typeof setInterval> | undefined;
  onResize: () => void = () => {};
  t0 = Date.now();
  tk = 0;
  state: AppState = this.initState();

  initState() {
    let s: Loose = {};
    try {
      s = JSON.parse(localStorage.getItem(LS) || '{}') || {};
    } catch (e) {}
    const db = buildData();
    const base: Loose = {
      rev: 0,
      db,
      route: 'P01',
      uid: null,
      frame: 'auto',
      winW: typeof window !== 'undefined' ? window.innerWidth : 1280,
      notes: false,
      index: false,
      idxQ: '',
      ev: 'e1',
      order: null,
      ticket: null,
      prom: null,
      buyer: null,
      admTab: 'info',
      preview: false,
      v: {},
      q: '',
      qDate: '',
      lq: '',
      lqDate: '',
      listLoading: false,
      hq: '',
      cart: { eventId: 'e1', q: {} },
      ck: { promoIn: '', promo: null, promoMsg: null, outcome: 'aprovar', inst: false },
      ckAlert: null,
      auth: { email: '', pw: '', show: false, err: null, fails: 0, until: 0, returnTo: null },
      reg: { name: '', email: '', cpf: '', phone: '', pw: '', show: false, accept: false, err: {} },
      rec: { email: '', err: null, pw: '', pw2: '', err2: {}, used: false },
      first: { pw: '', pw2: '', err: {} },
      acct: null,
      pwf: null,
      evf: null,
      tf: null,
      pf: null,
      sf: null,
      corr: null,
      f: {
        evStatus: 'todos',
        evQ: '',
        ordEv: 'todos',
        ordSt: 'todos',
        ordPer: 'tudo',
        ordQ: '',
        buyEv: 'e1',
        buyQ: '',
        tkEv: 'e1',
        tkType: 'todos',
        tkSt: 'todos',
        tkQ: '',
        repEv: 'todos',
        repType: 'todos',
        repPer: 'mes',
        rkEv: 'todos',
        rkPer: 'tudo',
        rkMetric: 'qtd',
        txMonth: '2026-10',
        entEv: 'e1',
        prEv: 'todos',
        prPer: 'tudo',
        teamQ: '',
        promQ: '',
      },
      pg: {},
      modal: null,
      drawer: null,
      toast: null,
      dirty: false,
      menu: false,
      reveal: false,
      g: {
        eventId: 'e1',
        cam: 'perm',
        busy: false,
        res: null,
        online: true,
        sound: true,
        mq: '',
        mres: null,
        mbusy: false,
        conf: null,
        last: null,
        cool: 0,
        multiCam: true,
      },
    };
    ['route', 'uid', 'frame', 'notes', 'ev', 'order', 'ticket', 'prom', 'buyer', 'admTab'].forEach(k => {
      if (s[k] !== undefined && s[k] !== null) base[k] = s[k];
    });
    const has = (arr, id) => !id || arr.some(x => x.id === id);
    const volatile = [
      'C02',
      'C03',
      'C04',
      'C05',
      'C06',
      'C07',
      'C08',
      'C09',
      'C10',
      'ADM03',
      'A05',
      'A06',
      'A04',
      'ADM22',
    ];
    if (
      !R[base.route] ||
      volatile.includes(base.route) ||
      !has(db.orders, base.order) ||
      !has(db.tickets, base.ticket)
    ) {
      base.route = 'P01';
      base.order = null;
      base.ticket = null;
    }
    const u = db.customers.find(c => c.id === base.uid) || db.staff.find(c => c.id === base.uid);
    if (!u) base.uid = null;
    return base;
  }

  componentDidMount() {
    this.onResize = () => this.setState({ winW: window.innerWidth, winH: window.innerHeight });
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.iv = setInterval(() => this.onTick(), 1000);
  }
  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize);
    clearInterval(this.iv);
  }
  componentDidUpdate() {
    const s = this.state,
      key = s.route + '|' + s.order + '|' + s.ticket + '|' + s.admTab + '|' + s.ev;
    if (this._navKey !== key) {
      this._navKey = key;
      if (this.scroller) this.scroller.scrollTop = 0;
    }
    try {
      localStorage.setItem(
        LS,
        JSON.stringify({
          route: s.route,
          uid: s.uid,
          frame: s.frame,
          notes: s.notes,
          ev: s.ev,
          order: s.order,
          ticket: s.ticket,
          prom: s.prom,
          buyer: s.buyer,
          admTab: s.admTab,
        }),
      );
    } catch (e) {}
  }

  now() {
    return NOW0 + (Date.now() - this.t0);
  }
  user(id = this.state.uid): User {
    const db = this.state.db;
    return (db.customers.find(u => u.id === id) || db.staff.find(u => u.id === id) || null) as User;
  }
  role() {
    const u = this.user();
    return u ? u.role || 'cliente' : null;
  }
  home(role = this.role()) {
    return role === 'admin' ? 'ADM01' : role === 'validador' ? 'V01' : role === 'cliente' ? 'U01' : 'P01';
  }
  mut(fn: (db: Database) => void) {
    fn(this.state.db);
    this.setState(s => ({ rev: s.rev + 1 }));
  }
  up(key: keyof AppState, patch: Loose) {
    this.setState(s => ({ [key]: { ...s[key], ...patch } }));
  }
  setF(key, val) {
    this.setState(s => ({ f: { ...s.f, [key]: val }, pg: {} }));
  }
  toast(text: string, tone = 'dark', action: Loose = null) {
    clearTimeout(this.tt);
    this.setState({ toast: { text, tone, action } });
    this.tt = setTimeout(() => this.setState({ toast: null }), 3600);
  }
  ev(id: string | null = this.state.ev): PartyEvent {
    return this.state.db.events.find(e => e.id === id)!;
  }
  typ(id: string): TicketType {
    return this.state.db.types.find(t => t.id === id)!;
  }
  ord(id: string | null = this.state.order): Order {
    return this.state.db.orders.find(o => o.id === id)!;
  }
  tkt(id: string | null = this.state.ticket): Ticket {
    return this.state.db.tickets.find(k => k.id === id)!;
  }
  cust(id: string | null): Customer {
    return this.state.db.customers.find(c => c.id === id)!;
  }
  staffName(id: string | null): string {
    const u = this.state.db.staff.find(x => x.id === id);
    return u ? u.name : '';
  }

  go(route: string, patch: Loose = {}, force = false) {
    const s = this.state;
    if (s.dirty && !force && route !== s.route) {
      this.setState({ modal: { kind: 'unsaved', next: () => this.go(route, patch, true) } });
      return;
    }
    const need = (R[route] || [])[1] || 'any',
      role = this.role();
    const ok =
      need === 'any' ||
      (need === 'cli' && role === 'cliente') ||
      (need === 'adm' && role === 'admin') ||
      (need === 'gate' && (role === 'admin' || role === 'validador'));
    if (!ok) {
      if (!role) {
        this.setState({
          route: 'A01',
          auth: { ...s.auth, err: null, returnTo: { route, patch } },
          modal: null,
          drawer: null,
          menu: false,
          dirty: false,
        });
        return;
      }
      this.setState({
        route: 'G04',
        v: { ...s.v, denied: route },
        modal: null,
        drawer: null,
        menu: false,
        dirty: false,
      });
      return;
    }
    this.setState({ route, modal: null, drawer: null, menu: false, dirty: false, ...patch });
  }
  uidFor(role) {
    return role === 'cliente' ? 'c1' : role === 'admin' ? 's1' : role === 'validador' ? 's2' : null;
  }
  demoRole(role) {
    this.setState({ uid: this.uidFor(role), dirty: false, index: false }, () => this.go(this.home(role), {}, true));
  }
  jump(role: string | null, route: string, patch: Loose = {}) {
    const uid = role === 'keep' ? this.state.uid : this.uidFor(role);
    this.setState({ uid, dirty: false, index: false, modal: null, drawer: null, v: {}, ...(patch.pre || {}) }, () => {
      const p: Loose = { ...patch };
      delete p.pre;
      delete p.after;
      this.go(route, p, true);
      if (patch.after) setTimeout(() => patch.after(), 30);
    });
  }
  logout() {
    this.setState(
      { uid: null, ck: { promoIn: '', promo: null, promoMsg: null, outcome: 'aprovar', inst: false } },
      () => this.go('P01', {}, true),
    );
    this.toast('Você saiu da sua conta.');
  }

  onTick() {
    const s = this.state,
      n = this.now();
    let changed = false;
    s.db.orders.forEach(o => {
      if (o.status === 'pendente' && o.expiresAt < n) {
        if (o.id === s.ck.orderId && (s.route === 'C04' || s.route === 'C05')) {
          this.expireOrder(o.id);
        } else {
          o.status = 'expirado';
          o.hist.push({ t: o.expiresAt, l: 'Prazo encerrado. Reserva liberada' });
        }
        changed = true;
      }
    });
    this.tk++;
    if (s.route === 'ADM19' && s.v.live !== false && s.v.conn !== 'off' && this.tk % 5 === 0) {
      this.simEntry(s.f.entEv);
      changed = true;
    }
    if (changed || ['C04', 'C05', 'ADM19', 'ADM01', 'V02', 'U03', 'ADM11'].includes(s.route))
      this.setState(st => ({ rev: st.rev + 1 }));
  }
  simEntry(eid) {
    const db = this.state.db,
      n = this.now();
    const cand = db.tickets.filter(
      k =>
        k.eventId === eid &&
        k.status === 'valido' &&
        this.ord(k.orderId).status === 'pago' &&
        this.ord(k.orderId).userId !== 'c1',
    );
    if (!cand.length) return;
    const k = cand[Math.floor(Math.random() * cand.length)];
    k.status = 'utilizado';
    k.usedAt = n;
    k.usedBy = Math.random() < 0.5 ? 's2' : 's3';
    k.method = 'câmera';
    db.checkins.push({
      ticketId: k.id,
      code: k.code,
      eventId: eid,
      by: k.usedBy,
      result: 'valido',
      method: 'câmera',
      at: n,
    });
  }

  stats() {
    const s = this.state,
      key = s.rev + ':' + Math.floor(this.now() / 5000);
    if (this._sk === key) return this._st;
    const db = s.db,
      n = this.now(),
      m: Loose = {};
    db.types.forEach(t => (m[t.id] = { sold: 0, res: 0, used: 0, canc: 0, valid: 0 }));
    db.tickets.forEach(k => {
      const x = m[k.typeId];
      if (!x) return;
      x.sold++;
      if (k.status === 'utilizado') x.used++;
      else if (k.status === 'cancelado') x.canc++;
      else x.valid++;
    });
    db.orders.forEach(o => {
      if (o.status === 'pendente' && o.expiresAt > n)
        o.items.forEach(i => {
          if (m[i.typeId]) m[i.typeId].res += i.qty;
        });
    });
    db.types.forEach(t => {
      const x = m[t.id];
      x.avail = Math.max(0, t.total - x.sold - x.res - (t.taken || 0));
    });
    this._sk = key;
    this._st = m;
    return m;
  }
  sale(t) {
    const n = this.now(),
      x = this.stats()[t.id];
    if (!t.active)
      return {
        k: 'off',
        label: 'Indisponível',
        tone: 'neu',
        buy: false,
        note: 'Tipo indisponível para venda no momento.',
      };
    if (n < t.start)
      return {
        k: 'soon',
        label: 'Em breve',
        tone: 'info',
        buy: false,
        note: 'Vendas a partir de ' + fDT(t.start) + '.',
      };
    if (n > t.end)
      return {
        k: 'closed',
        label: 'Vendas encerradas',
        tone: 'neu',
        buy: false,
        note: 'Vendas encerradas em ' + fDT(t.end) + '.',
      };
    if (x.sold >= t.total)
      return { k: 'out', label: 'Esgotado', tone: 'err', buy: false, note: 'Todas as unidades foram vendidas.' };
    if (x.avail <= 0)
      return {
        k: 'held',
        label: 'Indisponível no momento',
        tone: 'warn',
        buy: false,
        note: 'As últimas unidades estão reservadas por outros compradores e podem voltar se a reserva expirar.',
      };
    return {
      k: 'on',
      label: 'À venda',
      tone: 'ok',
      buy: true,
      avail: x.avail,
      note:
        (t.half ? 'Meia-entrada: apresente o documento que dá direito ao benefício na entrada. ' : '') +
        'Vendas até ' +
        fDT(t.end) +
        '.',
    };
  }
  evSale(e) {
    const ts = this.state.db.types.filter(t => t.eventId === e.id),
      n = this.now();
    if (e.status === 'encerrado') return { k: 'ended', label: 'Evento encerrado', tone: 'dark' };
    const on = ts.filter(t => this.sale(t).buy);
    if (on.length) return { k: 'open', min: Math.min(...on.map(t => t.price)), label: 'À venda', tone: 'ok' };
    const soon = ts.filter(t => t.active && n < t.start).sort((a, b) => a.start - b.start)[0];
    if (soon)
      return { k: 'soon', label: 'Vendas a partir de ' + fD(soon.start).slice(0, 5), tone: 'info', start: soon.start };
    const anyOut = ts.some(t => this.sale(t).k === 'out' || this.sale(t).k === 'held');
    if (
      anyOut &&
      ts.every(t => ['out', 'held', 'off', 'closed'].includes(this.sale(t).k)) &&
      ts.some(t => this.sale(t).k === 'out')
    )
      return { k: 'out', label: 'Esgotado', tone: 'err' };
    return { k: 'closed', label: 'Vendas encerradas', tone: 'neu' };
  }
  evCard(e) {
    const es = this.evSale(e),
      open = es.k === 'open';
    return {
      id: e.id,
      name: e.name,
      dateShort: fShort(e.start),
      venue: e.venue,
      c1: e.c1,
      c2: e.c2,
      priceText: open ? 'a partir de' : '',
      priceLabel: open ? brl(es.min) : '',
      hasState: !open,
      stateLabel: es.label,
      sBg: B[es.tone][0],
      sFg: B[es.tone][1],
      cta: open ? 'Comprar' : 'Ver evento',
      ctaBg: open ? '#7C3AED' : 'transparent',
      ctaBorder: open ? '0' : '1px solid #3A3A4C',
      hasPrice: open,
      onClick: () => this.openEvent(e.id),
    };
  }
  openEvent(id, extra = {}) {
    const s = this.state;
    this.go('P03', {
      ev: id,
      preview: false,
      cart: s.cart.eventId === id ? s.cart : { eventId: id, q: {} },
      ckAlert: null,
      ...extra,
    });
  }
  pubEvents() {
    const n = this.now();
    return this.state.db.events
      .filter(e => e.status === 'publicado' && e.start > n - 8 * 3600000)
      .sort((a, b) => a.start - b.start);
  }

  qty(typeId, d) {
    const s = this.state,
      ev = this.ev(s.cart.eventId),
      q = { ...s.cart.q };
    const total = Object.values(q).reduce((a, b) => a + b, 0),
      t = this.typ(typeId),
      sa = this.sale(t);
    let nv = (q[typeId] || 0) + d;
    if (nv < 0) nv = 0;
    if (d > 0) {
      if (total >= ev.limit) {
        this.toast('Limite de ' + ev.limit + ' ingressos por compra atingido.');
        return;
      }
      if (!sa.buy || nv > sa.avail) {
        this.toast('Não há mais unidades disponíveis deste tipo.');
        return;
      }
    }
    q[typeId] = nv;
    this.setState({ cart: { ...s.cart, q }, ckAlert: null });
  }
  sel() {
    const s = this.state;
    return Object.entries(s.cart.q)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const t = this.typ(id);
        return { t, qty: n, sub: n * t.price };
      });
  }
  contCheckout() {
    const items = this.sel();
    if (!items.length) {
      this.toast('Escolha pelo menos um ingresso para continuar.');
      return;
    }
    const role = this.role();
    if (role && role !== 'cliente') {
      this.setState({
        modal: {
          kind: 'info',
          title: 'Compra disponível para clientes',
          text: 'Você está conectado com um perfil da equipe PartyX. Para comprar, saia e entre com uma conta de cliente.',
          ok: 'Entendi',
        },
      });
      return;
    }
    this.go('C02', { ckAlert: null });
  }
  applyPromo() {
    const s = this.state,
      code = String(s.ck.promoIn || '')
        .toUpperCase()
        .replace(/\s/g, '');
    if (!code) {
      this.up('ck', { promoMsg: { tone: 'err', text: 'Digite o código do promoter ou deixe o campo em branco.' } });
      return;
    }
    const p = s.db.promoters.find(x => x.code === code);
    if (!p) {
      this.up('ck', {
        promo: null,
        promoMsg: { tone: 'err', text: 'Código não encontrado. Confira com quem indicou o evento.' },
      });
      return;
    }
    if (!p.active) {
      this.up('ck', {
        promo: null,
        promoMsg: { tone: 'err', text: 'Este código está desativado e não pode ser usado.' },
      });
      return;
    }
    this.up('ck', {
      promo: p.id,
      promoMsg: { tone: 'ok', text: 'Código ' + p.code + ' aplicado. O valor do pedido não muda.' },
    });
  }
  startPayment(method) {
    const s = this.state,
      n = this.now(),
      items = this.sel(),
      ev = this.ev(s.cart.eventId);
    if (!items.length) {
      this.openEvent(ev.id);
      return;
    }
    let ex = s.ck.orderId ? this.ord(s.ck.orderId) : null;
    if (ex && ex.eventId !== ev.id) ex = null;
    const keep = ex && ex.status === 'pendente' && ex.expiresAt > n;
    let changed = false;
    const q: Loose = { ...s.cart.q };
    items.forEach(i => {
      const sa = this.sale(i.t);
      let av = sa.buy ? sa.avail : 0;
      if (keep) {
        const mine = ex!.items.find(x => x.typeId === i.t.id);
        if (mine) av += mine.qty;
      }
      if (i.qty > av) {
        q[i.t.id] = av;
        changed = true;
      }
    });
    if (changed) {
      this.setState({
        cart: { ...s.cart, q },
        ckAlert:
          'A disponibilidade mudou antes de o pagamento começar. Ajustamos as quantidades para o que ainda está disponível. Confira o pedido antes de continuar.',
      });
      this.go('C02', {}, true);
      return;
    }
    const its = items.map(i => ({ typeId: i.t.id, qty: i.qty, unit: i.t.price })),
      total = its.reduce((a, i) => a + i.qty * i.unit, 0),
      units = its.reduce((a, i) => a + i.qty, 0);
    let target = ex as Order;
    this.mut(db => {
      if (ex && ['pendente', 'nao_concluido'].includes(ex.status)) {
        ex.items = its;
        ex.total = total;
        ex.method = method;
        ex.promoterId = s.ck.promo || null;
        if (!keep) {
          ex.status = 'pendente';
          ex.expiresAt = n + RES_MIN * MIN;
          ex.attempts = (ex.attempts || 1) + 1;
          ex.hist.push({
            t: n,
            l:
              'Nova tentativa de pagamento no mesmo pedido. Reserva de ' +
              units +
              ' ingresso(s) até ' +
              fT(ex.expiresAt),
          });
        } else
          ex.hist.push({
            t: n,
            l: 'Forma de pagamento escolhida: ' + (method === 'pix' ? 'Pix' : 'cartão de crédito'),
          });
      } else {
        target = {
          id: 'on' + db.orders.length,
          num: 'PX-' + db.nextNum++,
          userId: s.uid!,
          eventId: ev.id,
          promoterId: s.ck.promo || null,
          items: its,
          total,
          status: 'pendente',
          method,
          created: n,
          paidAt: null,
          expiresAt: n + RES_MIN * MIN,
          attempts: 1,
          gw:
            'pay_' +
            Math.floor(Math.random() * 1e9)
              .toString(16)
              .toUpperCase(),
          hist: [
            { t: n, l: 'Pedido criado' },
            { t: n, l: 'Reserva de ' + units + ' ingresso(s) até ' + fT(n + RES_MIN * MIN) },
          ],
        };
        db.orders.push(target);
      }
    });
    this.setState(st => ({ ck: { ...st.ck, orderId: target.id, card: 'form', cardErr: null } }));
    this.go(method === 'pix' ? 'C04' : 'C05', { order: target.id }, true);
  }
  approve(oid) {
    const o = this.ord(oid),
      n = this.now();
    if (o.status === 'pago' || o.status === 'pago_sem_estoque') {
      this.toast('Confirmação repetida do gateway recebida e ignorada. Nenhum ingresso foi duplicado.');
      return;
    }
    this.mut(() => {
      o.status = 'pago';
      o.paidAt = n;
      o.issuing = true;
      if (o.method === 'card') o.card4 = '4821';
      o.hist.push({ t: n, l: 'Pagamento aprovado pelo gateway' });
    });
    this.go('C07', { order: oid }, true);
    setTimeout(() => this.issue(oid), 2600);
  }
  issue(oid) {
    const db = this.state.db,
      o = this.ord(oid);
    if (!o) return;
    if (db.tickets.some(k => k.orderId === oid)) {
      o.issuing = false;
      this.mut(() => {});
      return;
    }
    const n = this.now(),
      u = this.cust(o.userId);
    this.mut(db => {
      o.items.forEach(i => {
        for (let j = 0; j < i.qty; j++) {
          let c;
          do {
            c = 'PX-';
            for (let x = 0; x < 8; x++) {
              if (x === 4) c += '-';
              c += AL[Math.floor(Math.random() * AL.length)];
            }
          } while (db.tickets.some(k => k.code === c));
          db.tickets.push({
            id: 'kn' + db.tickets.length,
            code: c,
            orderId: oid,
            typeId: i.typeId,
            eventId: o.eventId,
            holder: u.name,
            status: 'valido',
            issued: n,
            usedAt: null,
            usedBy: null,
          });
        }
      });
      o.issuing = false;
      o.hist.push({ t: n, l: 'Ingressos emitidos: ' + o.items.reduce((a, i) => a + i.qty, 0) + ' unidade(s)' });
    });
  }
  expireOrder(oid) {
    const o = this.ord(oid);
    if (!o) return;
    if (o.status === 'pendente')
      this.mut(() => {
        o.status = 'expirado';
        o.hist.push({ t: this.now(), l: 'Prazo encerrado. Reserva liberada e cobrança Pix expirada' });
      });
    this.go('C08', { order: oid }, true);
  }
  lateApprove(oid, stock) {
    const o = this.ord(oid),
      n = this.now();
    this.mut(() => {
      o.status = 'expirado';
      o.expiresAt = Math.min(o.expiresAt, n - 1000);
      o.hist.push({ t: n - 1000, l: 'Prazo encerrado. Reserva liberada' });
    });
    if (stock) {
      o.hist.push({ t: n, l: 'Pagamento aprovado após o prazo. Estoque disponível: emissão autorizada pelo servidor' });
      this.approve(oid);
      return;
    }
    this.mut(() => {
      o.status = 'pago_sem_estoque';
      o.paidAt = n;
      o.hist.push(
        { t: n, l: 'Pagamento aprovado após o prazo' },
        {
          t: n + 1000,
          l: 'Sem estoque para emissão. Nenhum ingresso emitido. Aguardando estorno pela PartyX no gateway',
        },
      );
    });
    this.go('C10', { order: oid }, true);
  }
  payCard() {
    const s = this.state,
      o = this.ord(s.ck.orderId);
    if (!o || s.ck.card === 'busy') return;
    const out = s.ck.outcome || 'aprovar';
    if (out === 'dados') {
      this.up('ck', { cardErr: 'O gateway não aceitou o número do cartão. Confira os dígitos.' });
      return;
    }
    this.up('ck', { card: 'busy', cardErr: null });
    this.go('C06', { order: o.id }, true);
    setTimeout(() => {
      this.up('ck', { card: 'form' });
      if (out === 'aprovar') this.approve(o.id);
      else if (out === 'recusar') {
        this.mut(() => {
          o.status = 'nao_concluido';
          o.hist.push({ t: this.now(), l: 'Pagamento recusado pela operadora do cartão. Reserva liberada' });
        });
        this.go('C09', { order: o.id, v: { fail: 'recusado' } }, true);
      } else this.go('C09', { order: o.id, v: { fail: 'comunicacao' } }, true);
    }, 2400);
  }
  recheck(oid) {
    this.go('C06', { order: oid }, true);
    setTimeout(() => this.approve(oid), 2200);
  }
  download(name) {
    this.toast('Gerando PDF…', 'dark');
    setTimeout(
      () => this.toast('Download concluído: ' + name, 'ok', { label: 'Ver modelo do PDF', href: '/docs/emails#E04' }),
      1300,
    );
  }

  login() {
    const s = this.state,
      a = s.auth,
      n = this.now(),
      db = s.db;
    if (a.until > n) {
      this.up('auth', { err: 'blocked' });
      return;
    }
    const email = norm(a.email),
      u = db.customers.find(x => x.email === email) || db.staff.find(x => x.email === email);
    if (!email || !a.pw) {
      this.up('auth', { err: 'empty' });
      return;
    }
    if (!u || u.pw !== a.pw) {
      const fails = a.fails + 1;
      if (fails >= 5) this.up('auth', { fails: 0, until: n + 15 * MIN, err: 'blocked' });
      else this.up('auth', { fails, err: 'cred' });
      return;
    }
    if (!u.active) {
      this.up('auth', { err: 'off', offStaff: !!u.role });
      return;
    }
    if (u.temp) {
      this.setState({ uid: u.id, auth: { ...a, err: null, pw: '' }, first: { pw: '', pw2: '', err: {} } }, () =>
        this.go('ADM22', {}, true),
      );
      return;
    }
    const rt = a.returnTo;
    this.setState({ uid: u.id, auth: { ...a, err: null, pw: '', fails: 0, returnTo: null } }, () => {
      const role = this.role();
      if (rt && ((R[rt.route] || [])[1] !== 'cli' || role === 'cliente')) this.go(rt.route, rt.patch || {}, true);
      else this.go(this.home(role), {}, true);
      this.toast('Olá, ' + u.name.split(' ')[0] + '.');
    });
  }
  register() {
    const s = this.state,
      g = s.reg,
      db = s.db,
      err: Loose = {};
    if (g.name.trim().split(/\s+/).length < 2) err.name = 'Informe nome e sobrenome.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email.trim())) err.email = 'Informe um e-mail válido.';
    else if (db.customers.some(c => c.email === norm(g.email)) || db.staff.some(c => c.email === norm(g.email)))
      err.email = 'Este e-mail já tem cadastro. Entre ou recupere sua senha.';
    if (!cpfOk(g.cpf))
      err.cpf =
        g.cpf.replace(/\D/g, '').length < 11
          ? 'Informe os 11 dígitos do CPF.'
          : 'CPF inválido. Confira os números digitados.';
    else if (db.customers.some(c => c.cpf === g.cpf.replace(/\D/g, '')))
      err.cpf = 'Este CPF já tem cadastro. Entre com sua conta ou fale com a PartyX.';
    if (g.phone.replace(/\D/g, '').length < 10) err.phone = 'Informe o telefone com DDD.';
    if (g.pw.length < 8 || !/\d/.test(g.pw) || !/[a-zA-Z]/.test(g.pw))
      err.pw = 'Use pelo menos 8 caracteres, com letras e números.';
    if (!g.accept) err.accept = 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.';
    if (Object.keys(err).length) {
      this.up('reg', { err });
      return;
    }
    const c: Loose = {
      id: 'cn' + db.customers.length,
      name: g.name.trim(),
      email: norm(g.email),
      cpf: g.cpf.replace(/\D/g, ''),
      phone: g.phone,
      pw: g.pw,
      active: true,
      created: this.now(),
    };
    this.mut(db => db.customers.push(c));
    this.setState({ uid: c.id, reg: { ...g, done: true, err: {} } });
  }
  afterRegister() {
    const rt = this.state.auth.returnTo;
    this.setState(
      {
        reg: { name: '', email: '', cpf: '', phone: '', pw: '', show: false, accept: false, err: {} },
        auth: { ...this.state.auth, returnTo: null },
      },
      () => (rt ? this.go(rt.route, rt.patch || {}, true) : this.go('P01', {}, true)),
    );
  }
  pwRules(pw) {
    return [
      { label: 'Pelo menos 8 caracteres', ok: pw.length >= 8 },
      { label: 'Letras e números', ok: /\d/.test(pw) && /[a-zA-Z]/.test(pw) },
    ].map(r => ({ ...r, c: r.ok ? '#15803D' : '#5B5B6E', m: r.ok ? '✓' : '○' }));
  }

  admNav(route) {
    const I = (label: string, r: string, match?: string[], sub?: string[][]) => ({
      label,
      r,
      match: match || [r],
      sub,
    });
    return [
      I('Visão geral', 'ADM01'),
      I('Eventos', 'ADM02', ['ADM02', 'ADM03', 'ADM04']),
      I('Pedidos', 'ADM10', ['ADM10', 'ADM11']),
      I('Compradores', 'ADM12', ['ADM12', 'ADM13']),
      I('Ingressos', 'ADM14'),
      I('Promoters', 'ADM07', ['ADM07', 'ADM09']),
      I(
        'Relatórios',
        'ADM16',
        ['ADM16', 'ADM17', 'ADM18'],
        [
          ['Vendas', 'ADM16'],
          ['Promoters', 'ADM17'],
          ['Taxa mensal', 'ADM18'],
        ],
      ),
      I('Entradas', 'ADM19'),
      I('Equipe', 'ADM20'),
    ].map(i => {
      const act = i.match.includes(route);
      return {
        label: i.label,
        onClick: () => this.go(i.r),
        bg: act ? 'rgba(124,58,237,.18)' : 'transparent',
        fg: act ? '#fff' : '#D4D4DE',
        fw: act ? 700 : 500,
        sh: act ? 'inset 3px 0 0 #8B5CF6' : 'none',
        hasSub: !!i.sub,
        sub: (i.sub || []).map(([l, r]) => ({
          label: l,
          onClick: () => this.go(r),
          fg: r === route ? '#fff' : '#A6A6BA',
          fw: r === route ? 700 : 500,
        })),
      };
    });
  }

  renderVals() {
    const s = this.state,
      db = s.db,
      route = s.route,
      meta = R[route] || R.P01,
      area = meta[2];
    const fw = s.frame === 'auto' ? s.winW : +s.frame,
      scale = s.frame === 'auto' ? 1 : Math.min(1, (s.winW - 16) / fw);
    const mob = fw < 768,
      desk = fw >= 1100,
      role = this.role(),
      u = this.user();
    const is: Loose = {};
    Object.keys(R).forEach(k => (is[k] = k === route));
    const go: Loose = {};
    Object.keys(R).forEach(k => (go[k] = () => this.go(k)));
    const dark = ['P01', 'P02', 'P03', 'P07'].includes(route);
    const ckRoutes = ['C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10'];
    const W = [
      ['Ajustar', 'auto'],
      ['360', '360'],
      ['390', '390'],
      ['768', '768'],
      ['1440', '1440'],
    ];
    const roles = [
      ['Visitante', null],
      ['Cliente', 'cliente'],
      ['Administrador', 'admin'],
      ['Validador', 'validador'],
    ];
    const ctx: Loose = { s, db, route, mob, desk, fw, role, u };
    const V: Loose = {
      is,
      go,
      mob,
      desk,
      notMob: !mob,
      demo: {
        roles: roles.map(([l, r]) => ({
          label: l,
          onClick: () => this.demoRole(r),
          bg: role === r ? '#0B0B10' : 'transparent',
          fg: role === r ? '#fff' : '#3F3F50',
        })),
        widths: W.map(([l, v]) => ({
          label: l,
          onClick: () => this.setState({ frame: v }),
          bg: s.frame === v ? '#0B0B10' : 'transparent',
          fg: s.frame === v ? '#fff' : '#3F3F50',
        })),
        toggleIndex: () => this.setState({ index: !s.index }),
        toggleNotes: () => this.setState({ notes: !s.notes }),
        notesLabel: s.notes ? 'Ocultar anotações' : 'Anotações',
        id: this.screenId(),
        path: 'dominio-partyx' + this.path(),
        reset: () => {
          try {
            localStorage.removeItem(LS);
          } catch (e) {}
          this.t0 = Date.now();
          this._sk = null;
          this.setState({ ...this.initState(), route: 'P01', uid: null, frame: s.frame });
          this.toast('Dados de demonstração reiniciados.');
        },
      },
      scrollRef: el => {
        this.scroller = el;
      },
      frameBoxW: s.frame === 'auto' ? '100%' : Math.round(fw * scale) + 'px',
      frameW: s.frame === 'auto' ? '100%' : fw + 'px',
      frameH: scale === 1 ? '100%' : 100 / scale + '%',
      frameScale: scale,
      frameBg:
        area === 'adm' ? '#F7F7FA' : area === 'gate' ? '#000' : area === 'bare' ? '#fff' : dark ? '#0B0B10' : '#F7F7FA',
      isPub: area === 'pub',
      isAdm: area === 'adm',
      isGate: area === 'gate',
      isBare: area === 'bare',
      showFooter: area === 'pub' && (route[0] === 'P' || route[0] === 'A' || route === 'G04'),
      footMt: dark ? '0' : '48px',
      hdr: {
        checkout: ckRoutes.includes(route),
        full: !ckRoutes.includes(route),
        isCli: role === 'cliente',
        isGuest: !role,
        isStaff: role === 'admin' || role === 'validador',
        staffLabel: role === 'admin' ? 'Painel' : 'Portaria',
        staffHome: () => this.go(this.home()),
        initials: u
          ? u.name
              .split(' ')
              .map(p => p[0])
              .slice(0, 2)
              .join('')
          : '',
        showMobSearch: !desk && route !== 'P02',
        q: s.hq,
        onQ: e => this.setState({ hq: e.target.value }),
        submit: e => {
          e.preventDefault();
          this.searchTo(s.hq, '');
        },
        openMenu: () => this.setState({ drawer: { kind: 'pubmenu' } }),
      },
    };
    Object.assign(
      V,
      pubV(this, ctx),
      authV(this, ctx),
      ckV(this, ctx),
      meV(this, ctx),
      admV(this, ctx),
      gateV(this, ctx),
      overV(this, ctx),
    );
    return V;
  }
  screenId() {
    const s = this.state,
      r = s.route;
    if (s.drawer && s.drawer.id) return (r === 'ADM04' && s.admTab === 'tipos' ? 'ADM05' : r) + ' › ' + s.drawer.id;
    if (r === 'P03') return 'P03 · C01';
    if (r === 'ADM04' && s.admTab === 'tipos') return 'ADM05';
    if (r === 'V02' && s.g.res) return s.g.res.id;
    if (r === 'V03' && s.g.res) return s.g.res.id;
    if (r === 'V03' && s.g.mres) return 'V04';
    if (s.drawer && s.drawer.id) return r + ' › ' + s.drawer.id;
    if (s.modal && s.modal.id) return r + ' › ' + s.modal.id;
    return r;
  }
  path() {
    const s = this.state,
      r = s.route,
      e = this.ev(),
      o = this.ord(),
      k = this.tkt();
    if (r === 'P03') return '/eventos/' + (e ? e.slug : '');
    if (['C02'].includes(r)) return '/eventos/' + this.ev(s.cart.eventId).slug + '/pedido';
    if (r[0] === 'C' && o)
      return (
        '/pedidos/' +
        o.num +
        {
          C03: '/pagamento',
          C04: '/pix',
          C05: '/cartao',
          C06: '/processando',
          C07: '/confirmado',
          C08: '/expirado',
          C09: '/falha',
          C10: '',
        }[r]
      );
    if (r === 'U03' && o) return '/minhas-compras/' + o.num;
    if (r === 'U04' && k) return '/meus-ingressos/' + k.code;
    if (r === 'U05' && k) return '/meus-ingressos/' + k.code + '?tela-cheia';
    if (r === 'ADM03')
      return s.evf && s.evf.id ? '/admin/eventos/' + this.ev(s.evf.id).slug + '/editar' : '/admin/eventos/novo';
    if (r === 'ADM04' && e) return '/admin/eventos/' + e.slug + (s.admTab !== 'info' ? '/' + s.admTab : '');
    if (r === 'ADM11' && o) return '/admin/pedidos/' + o.num;
    if (r === 'ADM09') return '/admin/promoters/' + s.prom;
    if (r === 'ADM13') return '/admin/compradores/' + s.buyer;
    if (r === 'V02') return '/portaria/' + (this.ev(s.g.eventId) || {}).slug;
    if (r === 'V03') return '/portaria/' + (this.ev(s.g.eventId) || {}).slug + '/busca';
    return PATH[r] || '/';
  }
  searchTo(q, d) {
    this.setState({ lq: q, lqDate: d, listLoading: true });
    this.go('P02');
    clearTimeout(this.lt);
    this.lt = setTimeout(() => this.setState({ listLoading: false }), 750);
  }

  btn(label, onClick, kind = 'sec') {
    const K: Loose = {
      pri: ['#7C3AED', '#fff', '0'],
      sec: ['#fff', '#0B0B10', '1px solid #D4D4DE'],
      dan: ['#fff', '#B91C1C', '1px solid #FECACA'],
      dark: ['#0B0B10', '#fff', '0'],
      danf: ['#DC2626', '#fff', '0'],
    }[kind];
    return { label, onClick, bg: K[0], fg: K[1], bd: K[2] };
  }
  blk(o) {
    return {
      isKpis: false,
      isNote: false,
      isCard: false,
      isKV: false,
      isTimeline: false,
      isProg: false,
      isChart: false,
      isForm: false,
      isLoading: false,
      isError: false,
      isEmpty: false,
      showGrid: false,
      showCards: false,
      hasPager: false,
      hasHead: false,
      hasFoot: false,
      span: '1 / -1',
      title: '',
      sub: '',
      actions: [],
      ...o,
    };
  }
  kpis(items: Loose[], min = '170px', span?: string) {
    return this.blk({
      isKpis: true,
      min,
      span: span || '1 / -1',
      items: items.map(([label, value, def, color]) => ({
        label,
        value: String(value),
        def: def || '',
        color: color || '#0B0B10',
      })),
    });
  }
  note(tone: string, title: string, text: string, span?: string) {
    const T2: Loose = {
      info: ['#F5F3FF', '#4C1D95', '#DDD6FE'],
      warn: ['#FFFBEB', '#854D0E', '#FDE68A'],
      err: ['#FEF2F2', '#991B1B', '#FECACA'],
      ok: ['#F0FDF4', '#14532D', '#BBF7D0'],
      neu: ['#fff', '#3F3F50', '#E4E4EC'],
    }[tone];
    return this.blk({ isNote: true, bg: T2[0], fg: T2[1], bd: T2[2], title, text, span: span || '1 / -1' });
  }
  kv(title, items, o: Loose = {}) {
    return this.blk({
      isCard: true,
      isKV: true,
      hasHead: !!title,
      title,
      sub: o.sub || '',
      actions: o.actions || [],
      span: o.span || '1 / -1',
      items: items.map(i => ({
        k: i.k,
        v: i.v,
        ff: i.mono ? "'IBM Plex Mono',monospace" : 'inherit',
        hasBadge: !!i.badge,
        badge: i.badge || {},
        hasLink: !!i.link,
        link: i.link || {},
        span: i.span || 'auto',
      })),
    });
  }
  tl(title, items, o: Loose = {}) {
    const D: Loose = { ok: '#15803D', err: '#DC2626', warn: '#EAB308', info: '#8B5CF6', neu: '#A6A6BA' };
    return this.blk({
      isCard: true,
      isTimeline: true,
      hasHead: true,
      title,
      span: o.span || '1 / -1',
      actions: o.actions || [],
      items: items.map(i => ({ t: i.t, l: i.l, dot: D[i.tone || 'neu'] })),
    });
  }
  prog(title, rows, legend, o: Loose = {}) {
    return this.blk({
      isCard: true,
      isProg: true,
      hasHead: true,
      title,
      sub: o.sub || '',
      span: o.span || '1 / -1',
      actions: o.actions || [],
      rows,
      legend,
    });
  }
  chart(title, bars, note, o: Loose = {}) {
    const mx = Math.max(1, ...bars.map(b => b.v));
    return this.blk({
      isCard: true,
      isChart: true,
      hasHead: true,
      title,
      sub: o.sub || '',
      span: o.span || '1 / -1',
      gap: bars.length > 20 ? '2px' : '6px',
      note,
      bars: bars.map(b => ({
        h: Math.max(2, (b.v / mx) * 100) + '%',
        c: b.hl ? '#7C3AED' : '#C4B5FD',
        label: b.label,
        tip: b.label + ': ' + b.tip,
      })),
    });
  }
  form(title, fields, o: Loose = {}) {
    return this.blk({
      isCard: true,
      isForm: true,
      hasHead: !!title,
      title,
      sub: o.sub || '',
      span: o.span || '1 / -1',
      actions: o.actions || [],
      fields,
    });
  }
  tbl(key, title, cols, rows, o: Loose = {}) {
    const mob = this._mob,
      per = o.per || 10,
      pages = Math.max(1, Math.ceil(rows.length / per)),
      p = Math.min(this.state.pg[key] || 0, pages - 1);
    const slice = o.all ? rows : rows.slice(p * per, p * per + per);
    const nc = c => ({
      isText: !c.k || c.k === 't',
      isBadge: c.k === 'b',
      isAct: c.k === 'a',
      isBar: c.k === 'bar',
      t: c.t === undefined ? '' : String(c.t),
      sub: c.sub || '',
      hasSub: !!c.sub,
      ff: c.mono ? "'IBM Plex Mono',monospace" : 'inherit',
      fw: c.strong ? 700 : 400,
      badge: c.badge || {},
      w: c.w || '0%',
      w2: c.w2 || '0%',
      acts: (c.acts || []).map(a => ({
        label: a.label,
        onClick: e => {
          e.stopPropagation();
          a.onClick();
        },
        fg: a.danger ? '#B91C1C' : '#0B0B10',
        bd: a.danger ? '#FECACA' : '#D4D4DE',
      })),
    });
    const rs = slice.map(r => ({
      onClick: r.onClick || (() => {}),
      cur: r.onClick ? 'pointer' : 'default',
      bg: r.hl ? '#FFFBEB' : '#fff',
      cells: r.cells.map((c, j) => ({ ...nc(c), align: cols[j].align || 'left' })),
    }));
    const mrows = slice.map(r => {
      const c0 = r.cells[0],
        act = r.cells.find(c => c.k === 'a');
      return {
        onClick: r.onClick || (() => {}),
        cur: r.onClick ? 'pointer' : 'default',
        hasChev: !!r.onClick,
        title: c0.k === 'b' ? c0.badge.label : String(c0.t),
        sub: c0.sub || '',
        ff: c0.mono ? "'IBM Plex Mono',monospace" : 'inherit',
        lines: r.cells
          .map((c, j) => ({ c, j }))
          .slice(1)
          .filter(x => x.c.k !== 'a')
          .map(({ c, j }) => ({
            k: cols[j].label,
            isBadge: c.k === 'b',
            isText: c.k !== 'b',
            badge: c.badge || {},
            t: String(c.t === undefined ? '' : c.t) + (c.sub && c.k !== 'bar' ? ' · ' + c.sub : ''),
          })),
        hasActs: !!act,
        acts: act ? nc(act).acts : [],
      };
    });
    const ok = rows.length > 0 && !o.loading && !o.error;
    return this.blk({
      isCard: true,
      span: o.span || '1 / -1',
      hasHead: !!title,
      title,
      sub: o.sub || '',
      actions: o.actions || [],
      isLoading: !!o.loading,
      skel: [1, 2, 3, 4, 5],
      isError: !!o.error,
      retry: o.retry || (() => {}),
      isEmpty: !rows.length && !o.loading && !o.error,
      emptyTitle: (o.empty || {}).title || 'Nada encontrado',
      emptyText: (o.empty || {}).text || '',
      hasEmptyAct: !!(o.empty && o.empty.act),
      emptyAct: (o.empty || {}).act || {},
      showGrid: !mob && ok,
      showCards: mob && ok,
      gcols: cols.map(c => c.w || '1fr').join(' '),
      minW: o.minW || '0',
      cols: cols.map(c => ({ label: c.label, align: c.align || 'left' })),
      rows: rs,
      mrows,
      hasFoot: !!o.foot && ok,
      foot: (o.foot || []).map((t, j) => ({ t, align: cols[j].align || 'left' })),
      footText: o.footText || '',
      hasPager: rows.length > per && !o.all && ok,
      pager: {
        text: p * per + 1 + '–' + Math.min(rows.length, (p + 1) * per) + ' de ' + rows.length,
        page: p + 1 + ' / ' + pages,
        prev: () => p > 0 && this.setState(s => ({ pg: { ...s.pg, [key]: p - 1 } })),
        next: () => p < pages - 1 && this.setState(s => ({ pg: { ...s.pg, [key]: p + 1 } })),
        pOp: p > 0 ? 1 : 0.4,
        nOp: p < pages - 1 ? 1 : 0.4,
      },
    });
  }
  fld(form, key, label, type = 'text', o: Loose = {}) {
    const F = this.state[form] || {},
      er = (F.err || {})[key],
      val = F[key];
    return {
      key,
      label,
      value: val === undefined || val === null ? '' : val,
      isText: ['text', 'email', 'money', 'number', 'date', 'time', 'tel', 'password'].includes(type),
      inputType:
        {
          money: 'text',
          number: 'number',
          date: 'date',
          time: 'time',
          tel: 'tel',
          email: 'email',
          password: 'password',
        }[type] || 'text',
      isArea: type === 'area',
      isSel: type === 'select',
      isToggle: type === 'toggle',
      isRO: type === 'ro',
      isUpload: type === 'upload',
      options: o.options || [],
      on: !!val,
      toggle: () => this.setForm(form, { [key]: !val }),
      onChange: e => this.setForm(form, { [key]: o.mask ? o.mask(e.target.value) : e.target.value }),
      err: er || '',
      hasErr: !!er,
      hint: o.hint || '',
      hasHint: !!o.hint,
      span: o.half ? 'span 1' : '1 / -1',
      ph: o.ph || '',
      prefix: o.prefix || '',
      hasPrefix: !!o.prefix,
      bd: er ? '2px solid #DC2626' : '1px solid #D4D4DE',
      ff: o.mono ? "'IBM Plex Mono',monospace" : 'inherit',
      toggleLabel: val ? o.onLabel || 'Ativo' : o.offLabel || 'Inativo',
      tBg: val ? '#7C3AED' : '#A6A6BA',
      tX: val ? '21px' : '3px',
      up: o.up || {},
    };
  }
  setForm(form, patch) {
    this.setState(s => ({
      [form]: {
        ...s[form],
        ...patch,
        err: { ...((s[form] || {}).err || {}), ...Object.fromEntries(Object.keys(patch).map(k => [k, null])) },
      },
      dirty: form === 'evf' ? true : s.dirty,
    }));
  }
  fsel(label, key, options) {
    const v = this.state.f[key];
    return { label, key, value: v, options, onChange: e => this.setF(key, e.target.value) };
  }
  filt(o) {
    const mob = this._mob,
      sels = o.selects || [];
    const def = o.defaults || {};
    const count = sels.filter(x => def[x.key] !== undefined && x.value !== def[x.key]).length;
    return {
      has: true,
      hasSearch: !!o.search,
      search: o.search
        ? { value: this.state.f[o.search.key], onChange: e => this.setF(o.search.key, e.target.value), ph: o.search.ph }
        : {},
      selects: sels,
      showSelects: !mob && sels.length > 0,
      drawerBtn: mob && sels.length > 0,
      count: count ? '(' + count + ')' : '',
      openDrawer: () =>
        this.setState({
          drawer: {
            kind: 'filters',
            id: 'G07',
            sels: sels.map(x => x.key),
            labels: sels.map(x => x.label),
            opts: sels.map(x => x.options),
          },
        }),
      hasChips: count > 0 || !!(o.search && this.state.f[o.search.key]),
      clear: () => this.setState(s => ({ f: { ...s.f, ...def, ...(o.search ? { [o.search.key]: '' } : {}) }, pg: {} })),
    };
  }
  evOpts(all = true, only?: (e: PartyEvent) => boolean) {
    const es = this.state.db.events.filter(e => !only || only(e)).sort((a, b) => b.start - a.start);
    return [
      ...(all ? [{ v: 'todos', l: 'Todos os eventos' }] : []),
      ...es.map(e => ({ v: e.id, l: e.name + ' · ' + fD(e.start).slice(0, 5) })),
    ];
  }
  range(k) {
    const d0 = new Date(this.now());
    d0.setHours(0, 0, 0, 0);
    const t0 = d0.getTime();
    return (
      {
        hoje: [t0, t0 + DAY],
        '7d': [t0 - 6 * DAY, t0 + DAY],
        '30d': [t0 - 29 * DAY, t0 + DAY],
        mes: [T(2026, 10, 1), T(2026, 11, 1)],
        set: [T(2026, 9, 1), T(2026, 10, 1)],
      }[k] || [0, Infinity]
    );
  }
  inR(ts, k) {
    const [a, b] = this.range(k);
    return ts >= a && ts < b;
  }
  units(o) {
    return o.items.reduce((a, i) => a + i.qty, 0);
  }
  emis(o) {
    const ks = this.state.db.tickets.filter(k => k.orderId === o.id);
    if (o.issuing) return bd('Em emissão', 'info');
    if (o.status === 'pago_sem_estoque') return bd('Não emitido: sem estoque', 'err');
    if (!ks.length) return bd('Não emitido', 'neu');
    const c = ks.filter(k => k.status === 'cancelado').length;
    if (c === ks.length) return bd('Cancelados ' + c, 'err');
    return c ? bd('Emitidos ' + ks.length + ' · ' + c + ' cancel.', 'warn') : bd('Emitidos ' + ks.length, 'ok');
  }
  orderRow(o, withEvent = true) {
    const c = this.cust(o.userId);
    return {
      onClick: () => this.go('ADM11', { order: o.id }),
      hl: o.status === 'pago_sem_estoque',
      cells: [
        { t: o.num, mono: true, strong: true, sub: fDTs(o.created) },
        { t: c.name, sub: c.email },
        ...(withEvent ? [{ t: this.ev(o.eventId).name }] : []),
        { t: this.units(o) },
        { t: brl(o.total), strong: true },
        { k: 'b', badge: pb(o), sub: o.method === 'pix' ? 'Pix' : 'Cartão' },
        { k: 'b', badge: this.emis(o) },
      ],
    };
  }
  orderCols(withEvent = true) {
    return [
      { label: 'Pedido', w: '1.1fr' },
      { label: 'Comprador', w: '1.5fr' },
      ...(withEvent ? [{ label: 'Evento', w: '1.1fr' }] : []),
      { label: 'Qtd.', w: '.5fr', align: 'right' },
      { label: 'Valor', w: '.9fr', align: 'right' },
      { label: 'Pagamento', w: '1fr' },
      { label: 'Emissão', w: '1.2fr' },
    ];
  }
  openExport(title, filters, o: Loose = {}) {
    this.setState({
      modal: {
        kind: 'export',
        id: 'ADM23',
        title,
        filters,
        pdf: !!o.pdf,
        fmt: 'csv',
        st: 'idle',
        fail: false,
        base: o.base || 'exportacao',
      },
    });
  }
  openEventForm(id) {
    const e = id ? this.ev(id) : null,
      d = new Date(e ? e.start : 0);
    const evf = e
      ? {
          id,
          name: e.name,
          date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
          time: fT(e.start),
          venue: e.venue,
          address: e.address,
          desc: e.desc,
          attractions: e.attractions.join('\n'),
          age: e.age,
          limit: String(e.limit),
          featured: !!e.featured,
          banner: e.banner === false ? null : 'ok',
          err: {},
        }
      : {
          id: null,
          name: '',
          date: '',
          time: '',
          venue: '',
          address: '',
          desc: '',
          attractions: '',
          age: '18 anos',
          limit: '6',
          featured: false,
          banner: null,
          err: {},
        };
    this.go('ADM03', { evf, preview: false });
  }
  saveEvent(then?: any) {
    const s = this.state,
      f = s.evf,
      er: Loose = {};
    if (!f.name.trim()) er.name = 'Informe o nome do evento.';
    if (!f.date) er.date = 'Informe a data.';
    if (!f.time) er.time = 'Informe o horário.';
    if (!f.venue.trim()) er.venue = 'Informe o local.';
    const lim = parseInt(f.limit, 10);
    if (!(lim >= 1 && lim <= 50)) er.limit = 'Informe um número entre 1 e 50.';
    if (Object.keys(er).length) {
      this.up('evf', { err: er });
      this.toast('Revise os campos destacados.', 'err');
      return;
    }
    const start = new Date(f.date + 'T' + f.time).getTime();
    let id = f.id;
    this.mut(db => {
      const data: Loose = {
        name: f.name.trim(),
        start,
        venue: f.venue.trim(),
        address: f.address.trim(),
        desc: f.desc.trim(),
        attractions: f.attractions
          .split('\n')
          .map(x => x.trim())
          .filter(Boolean),
        age: f.age,
        limit: lim,
        featured: !!f.featured,
        banner: f.banner === 'ok',
      };
      if (id) Object.assign(this.ev(id), data);
      else {
        id = 'en' + db.events.length;
        db.events.push({
          id,
          slug: norm(f.name)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          status: 'rascunho',
          c1: '#1C1830',
          c2: '#262040',
          ...data,
        });
      }
      if (data.featured)
        db.events.forEach(e => {
          if (e.id !== id) e.featured = false;
        });
      db.audit.push({
        t: this.now(),
        by: this.user().name,
        l: 'Evento ' + data.name + (f.id ? ' editado' : ' criado como rascunho'),
        ent: id,
      });
    });
    this.setState({ dirty: false, evf: { ...f, id } });
    this.toast(f.id ? 'Alterações salvas.' : 'Rascunho salvo. Cadastre os tipos de ingresso para publicar.', 'ok');
    if (then === 'preview') this.go('P03', { ev: id, preview: true, cart: { eventId: id, q: {} } }, true);
    else this.go('ADM04', { ev: id, admTab: f.id ? 'info' : 'tipos' }, true);
  }
  fakeUpload(bad) {
    if (bad) {
      this.setState(s => ({ evf: { ...s.evf, banner: 'err' }, dirty: true }));
      return;
    }
    this.setState(s => ({ evf: { ...s.evf, banner: 'up', pct: 0 }, dirty: true }));
    let p = 0;
    const iv = setInterval(() => {
      p += 20;
      if (p >= 100) {
        clearInterval(iv);
        this.setState(s => ({ evf: { ...s.evf, banner: 'ok', pct: 100 } }));
      } else this.setState(s => ({ evf: { ...s.evf, pct: p } }));
    }, 280);
  }
  publishEvent(e) {
    const ts = this.state.db.types.filter(t => t.eventId === e.id && t.active),
      miss: Loose[] = [];
    if (!ts.length) miss.push('Cadastre pelo menos um tipo de ingresso ativo.');
    if (e.banner === false) miss.push('Envie o banner do evento.');
    if (!e.desc) miss.push('Preencha a descrição.');
    if (miss.length) {
      this.setState({
        modal: {
          kind: 'info',
          title: 'Ainda não é possível publicar',
          text: 'Complete os itens abaixo e tente novamente.',
          list: miss,
          ok: 'Entendi',
        },
      });
      return;
    }
    this.setState({
      modal: {
        kind: 'confirm',
        title: 'Publicar ' + e.name + '?',
        text: 'O evento passa a aparecer no site. Cada tipo de ingresso é vendido conforme o próprio período de vendas.',
        confirm: 'Publicar evento',
        onConfirm: () => {
          this.mut(db => {
            e.status = 'publicado';
            db.audit.push({ t: this.now(), by: this.user().name, l: 'Evento ' + e.name + ' publicado', ent: e.id });
          });
          this.setState({ modal: null });
          this.toast('Evento publicado. Ele já aparece no site.', 'ok');
        },
      },
    });
  }
  closeEvent(e) {
    this.setState({
      modal: {
        kind: 'confirm',
        danger: true,
        title: 'Encerrar ' + e.name + '?',
        text: 'Confira o impacto antes de confirmar:',
        list: [
          'O evento sai da listagem e novas vendas ficam bloqueadas.',
          'A página continua acessível pelo link, com o aviso de evento encerrado.',
          'Ingressos já emitidos não são cancelados automaticamente e continuam valendo na portaria.',
          'Esta ação fica registrada com seu nome e horário.',
        ],
        confirm: 'Encerrar evento',
        onConfirm: () => {
          this.mut(db => {
            e.status = 'encerrado';
            e.featured = false;
            db.audit.push({ t: this.now(), by: this.user().name, l: 'Evento ' + e.name + ' encerrado', ent: e.id });
          });
          this.setState({ modal: null });
          this.toast('Evento encerrado. Novas vendas bloqueadas.', 'ok');
        },
      },
    });
  }
  openType(eventId, id) {
    const t = id ? this.typ(id) : null,
      dd = ts => {
        const d = new Date(ts);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      };
    const n = this.now(),
      e = this.ev(eventId);
    this.setState({
      tf: t
        ? {
            id,
            eventId,
            name: t.name,
            price: (t.price / 100).toFixed(2).replace('.', ','),
            total: String(t.total),
            sd: dd(t.start),
            st: fT(t.start),
            ed: dd(t.end),
            et: fT(t.end),
            active: t.active,
            err: {},
          }
        : {
            id: null,
            eventId,
            name: '',
            price: '',
            total: '',
            sd: dd(n),
            st: '10:00',
            ed: dd(e.start),
            et: fT(e.start),
            active: true,
            err: {},
          },
      drawer: { kind: 'type', id: 'ADM06' },
    });
  }
  saveType() {
    const f = this.state.tf,
      er: Loose = {},
      x = f.id ? this.stats()[f.id] : { sold: 0, res: 0 };
    const price = Math.round(parseFloat(String(f.price).replace(/\./g, '').replace(',', '.')) * 100),
      total = parseInt(f.total, 10);
    if (!f.name.trim()) er.name = 'Informe o nome do tipo.';
    if (!(price > 0)) er.price = 'Informe um valor maior que zero. Ingressos gratuitos não fazem parte do escopo.';
    if (!(total > 0)) er.total = 'Informe a quantidade total.';
    else if (total < x.sold + x.res)
      er.total =
        'A capacidade não pode ser menor que ' +
        (x.sold + x.res) +
        ' (' +
        x.sold +
        ' vendidos + ' +
        x.res +
        ' em reserva).';
    const st = new Date(f.sd + 'T' + f.st).getTime(),
      en = new Date(f.ed + 'T' + f.et).getTime();
    if (!(en > st)) er.ed = 'O fim das vendas precisa ser depois do início.';
    if (Object.keys(er).length) {
      this.up('tf', { err: er });
      return;
    }
    this.mut(db => {
      const data: Loose = { name: f.name.trim(), price, total, start: st, end: en, active: !!f.active };
      if (f.id) Object.assign(this.typ(f.id), data);
      else db.types.push({ id: 'tn' + db.types.length, eventId: f.eventId, half: /meia/i.test(f.name), ...data });
      db.audit.push({
        t: this.now(),
        by: this.user().name,
        l: 'Tipo ' + data.name + (f.id ? ' editado' : ' criado'),
        ent: f.eventId,
      });
    });
    this.setState({ drawer: null });
    this.toast('Tipo de ingresso salvo.', 'ok');
  }
  toggleType(t) {
    if (t.active)
      this.setState({
        modal: {
          kind: 'confirm',
          title: 'Desativar ' + t.name + '?',
          text: 'Novas vendas deste tipo param imediatamente e ele aparece como indisponível no site. Ingressos já emitidos continuam válidos.',
          confirm: 'Desativar tipo',
          danger: true,
          onConfirm: () => {
            this.mut(db => {
              t.active = false;
              db.audit.push({
                t: this.now(),
                by: this.user().name,
                l: 'Tipo ' + t.name + ' desativado',
                ent: t.eventId,
              });
            });
            this.setState({ modal: null });
            this.toast('Tipo desativado.', 'ok');
          },
        },
      });
    else {
      this.mut(db => {
        t.active = true;
        db.audit.push({ t: this.now(), by: this.user().name, l: 'Tipo ' + t.name + ' ativado', ent: t.eventId });
      });
      this.toast('Tipo ativado. As vendas seguem o período configurado.', 'ok');
    }
  }
  openProm(id) {
    const p = id ? this.state.db.promoters.find(x => x.id === id) : null;
    this.setState({
      pf: p
        ? { id, name: p.name, phone: p.phone, code: p.code, active: p.active, err: {} }
        : { id: null, name: '', phone: '', code: '', active: true, err: {} },
      drawer: { kind: 'prom', id: 'ADM08' },
    });
  }
  saveProm() {
    const f = this.state.pf,
      db = this.state.db,
      er: Loose = {},
      code = String(f.code).toUpperCase().trim();
    if (f.name.trim().length < 3) er.name = 'Informe o nome do promoter.';
    if (f.phone.replace(/\D/g, '').length < 10) er.phone = 'Informe o telefone com DDD.';
    if (!/^[A-Z0-9]{3,20}$/.test(code)) er.code = 'Use de 3 a 20 letras sem acento ou números, sem espaços.';
    else if (db.promoters.some(p => p.code === code && p.id !== f.id))
      er.code = 'Este código já pertence a outro promoter. Escolha um código exclusivo.';
    if (Object.keys(er).length) {
      this.up('pf', { err: er });
      return;
    }
    this.mut(db => {
      if (f.id)
        Object.assign(
          db.promoters.find(p => p.id === f.id)!,
          { name: f.name.trim(), phone: f.phone, code, active: !!f.active },
        );
      else
        db.promoters.push({
          id: 'pn' + db.promoters.length,
          name: f.name.trim(),
          phone: f.phone,
          code,
          active: !!f.active,
          created: this.now(),
        });
      db.audit.push({
        t: this.now(),
        by: this.user().name,
        l: 'Promoter ' + code + (f.id ? ' editado' : ' cadastrado'),
        ent: f.id,
      });
    });
    this.setState({ drawer: null });
    this.toast('Promoter salvo. O código ' + code + ' já pode ser usado no checkout.', 'ok');
  }
  toggleProm(p) {
    this.mut(db => {
      p.active = !p.active;
      db.audit.push({
        t: this.now(),
        by: this.user().name,
        l: 'Promoter ' + p.code + (p.active ? ' ativado' : ' desativado'),
        ent: p.id,
      });
    });
    this.toast(
      p.active
        ? 'Promoter ativado.'
        : 'Promoter desativado. O código passa a ser recusado no checkout; vendas anteriores continuam atribuídas.',
      'ok',
    );
  }
  openStaff(id) {
    const u = id ? this.state.db.staff.find(x => x.id === id) : null;
    this.setState({
      sf: u
        ? { id, name: u.name, email: u.email, role: u.role, active: u.active, err: {} }
        : { id: null, name: '', email: '', role: 'validador', active: true, temp: '', err: {} },
      drawer: { kind: 'staff', id: 'ADM21' },
    });
  }
  saveStaff(confirmed) {
    const f = this.state.sf,
      db = this.state.db,
      er: Loose = {},
      email = norm(f.email),
      old = f.id ? db.staff.find(x => x.id === f.id) : null;
    if (f.name.trim().split(/\s+/).length < 2) er.name = 'Informe nome e sobrenome.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) er.email = 'Informe um e-mail válido.';
    else if (db.staff.some(x => x.email === email && x.id !== f.id) || db.customers.some(c => c.email === email))
      er.email = 'Este e-mail já está em uso.';
    if (!f.id && (!f.temp || f.temp.length < 8))
      er.temp = 'Gere ou informe uma senha temporária de pelo menos 8 caracteres.';
    if (old && old.id === this.state.uid && (!f.active || f.role !== 'admin'))
      er.role = 'Você não pode remover o próprio acesso de administrador.';
    if (Object.keys(er).length) {
      this.up('sf', { err: er });
      return;
    }
    const sensitive = old && (old.role !== f.role || old.active !== !!f.active);
    if (sensitive && !confirmed) {
      const lst: Loose[] = [];
      if (old.role !== f.role)
        lst.push(
          'Perfil muda de ' +
            (old.role === 'admin' ? 'Administrador' : 'Validador') +
            ' para ' +
            (f.role === 'admin' ? 'Administrador' : 'Validador') +
            '.',
        );
      if (old.active && !f.active) lst.push(old.name + ' não poderá mais entrar. Sessões abertas são encerradas.');
      if (!old.active && f.active) lst.push(old.name + ' volta a poder entrar.');
      lst.push('A alteração fica registrada em auditoria.');
      this.setState({
        modal: {
          kind: 'confirm',
          danger: old.active && !f.active,
          title: 'Confirmar alteração de acesso',
          text: 'Esta mudança altera o que a pessoa pode fazer no sistema.',
          list: lst,
          confirm: 'Confirmar alteração',
          onConfirm: () => {
            this.setState({ modal: null });
            this.saveStaff(true);
          },
        },
      });
      return;
    }
    this.mut(db => {
      if (old) Object.assign(old, { name: f.name.trim(), email, role: f.role, active: !!f.active });
      else
        db.staff.push({
          id: 'sn' + db.staff.length,
          name: f.name.trim(),
          email,
          role: f.role,
          active: !!f.active,
          pw: f.temp,
          temp: true,
          created: this.now(),
          last: null,
        });
      db.audit.push({
        t: this.now(),
        by: this.user().name,
        l: old
          ? 'Usuário ' +
            f.name +
            ' alterado (' +
            (f.role === 'admin' ? 'Administrador' : 'Validador') +
            ', ' +
            (f.active ? 'ativo' : 'inativo') +
            ')'
          : 'Usuário ' + f.name + ' criado com perfil ' + (f.role === 'admin' ? 'Administrador' : 'Validador'),
        ent: f.id,
      });
    });
    this.setState({ drawer: null });
    this.toast(
      old ? 'Acesso atualizado.' : 'Usuário criado. Ele deverá trocar a senha temporária no primeiro acesso.',
      'ok',
    );
  }
  toggleStaff(u) {
    this.setState({ sf: { id: u.id, name: u.name, email: u.email, role: u.role, active: !u.active, err: {} } }, () =>
      this.saveStaff(false),
    );
  }
  cancelTicket(k) {
    this.setState({ modal: { kind: 'cancel', id: 'ADM15', tid: k.id, reason: 'Solicitação do comprador', other: '' } });
  }
  doCancel() {
    const m = this.state.modal,
      k = this.tkt(m.tid),
      n = this.now(),
      by = this.user().name,
      why = m.reason === 'Outro' ? m.other || 'Outro' : m.reason,
      o = this.ord(k.orderId);
    this.mut(db => {
      k.status = 'cancelado';
      k.cancelAt = n;
      k.cancelBy = by;
      k.cancelReason = why;
      o.hist.push({
        t: n,
        l: 'Ingresso ' + k.code + ' cancelado por ' + by + '. Motivo: ' + why + '. Nenhum estorno automático',
      });
      db.audit.push({ t: n, by, l: 'Ingresso ' + k.code + ' cancelado. Motivo: ' + why, ent: k.id });
    });
    this.setState({ modal: null });
    this.toast('Ingresso cancelado. A portaria passa a recusar este código e o cliente vê o status Cancelado.', 'ok');
  }

  upG(patch) {
    this.setState(s => ({ g: { ...s.g, ...patch } }));
  }
  validate(k: Ticket | null | undefined, method: string, codeTyped?: string) {
    const s = this.state,
      db = s.db,
      n = this.now(),
      eid = s.g.eventId,
      by = s.uid,
      ev = this.ev(eid);
    const push = (result, tk?) =>
      db.checkins.push({
        ticketId: tk ? tk.id : null,
        code: tk ? tk.code : codeTyped,
        eventId: eid,
        by: by!,
        result,
        method,
        at: n,
      });
    const tp = k ? this.typ(k.typeId).name : '';
    if (!k) {
      push('invalido');
      return {
        id: 'V07',
        tone: 'red',
        icon: '×',
        title: 'Ingresso inválido',
        sub: 'Código não reconhecido pelo servidor. O QR pode estar adulterado, incompleto ou não ser da PartyX.',
        lines: [{ k: 'Código lido', v: codeTyped || 'ilegível' }],
        hint: 'Não libere a entrada. Peça o ingresso original ou use a busca manual pelo nome.',
        snd: 'err',
      };
    }
    const o = this.ord(k.orderId),
      oe = this.ev(k.eventId);
    if (k.eventId !== eid) {
      push('outro_evento', k);
      return {
        id: 'V08',
        tone: 'red',
        icon: '×',
        title: 'Outro evento',
        sub: 'Este ingresso pertence a outro evento.',
        lines: [
          { k: 'Evento do ingresso', v: oe.name + ' · ' + fD(oe.start) },
          { k: 'Evento selecionado', v: ev.name + ' · ' + fD(ev.start) },
          { k: 'Tipo', v: tp },
        ],
        hint: 'Confira se a pessoa está na entrada certa. Se o evento selecionado estiver errado, use Trocar evento.',
        snd: 'err',
      };
    }
    if (k.status === 'cancelado' || ['estornado', 'contestado'].includes(o.status)) {
      push('cancelado', k);
      return {
        id: 'V07',
        tone: 'red',
        icon: '×',
        title: 'Ingresso cancelado',
        sub:
          k.cancelReason === 'Estorno no gateway'
            ? 'Pagamento estornado. Este ingresso foi cancelado e não permite entrada.'
            : k.cancelReason === 'Contestação no cartão'
              ? 'Pagamento contestado. Este ingresso foi cancelado e não permite entrada.'
              : 'Cancelado pela PartyX em ' + fDT(k.cancelAt) + '. Não permite entrada.',
        lines: [
          { k: 'Tipo', v: tp },
          { k: 'Comprador', v: k.holder },
          { k: 'Código', v: k.code },
        ],
        hint: 'Não libere a entrada. Oriente a pessoa a procurar o atendimento da PartyX.',
        snd: 'err',
      };
    }
    if (k.status === 'utilizado') {
      push('ja_utilizado', k);
      return {
        id: 'V06',
        tone: 'yellow',
        icon: '!',
        title: 'Ingresso já utilizado',
        sub: 'Primeira entrada registrada às ' + fT(k.usedAt) + ' por ' + this.staffName(k.usedBy) + '.',
        big: tp,
        lines: [
          { k: 'Primeira entrada', v: fDTs(k.usedAt) },
          { k: 'Validador', v: this.staffName(k.usedBy) },
          { k: 'Comprador', v: k.holder },
          { k: 'Código', v: k.code },
        ],
        hint: 'Não libere nova entrada com este ingresso.',
        snd: 'used',
      };
    }
    k.status = 'utilizado';
    k.usedAt = n;
    k.usedBy = by;
    k.method = method;
    push('valido', k);
    o.hist.push({ t: n, l: 'Entrada registrada: ' + k.code + ' por ' + this.staffName(by) });
    return {
      id: 'V05',
      tone: 'green',
      icon: '✓',
      title: 'Entrada liberada',
      sub: k.holder,
      big: tp,
      lines: [
        { k: 'Horário', v: fTs(n) },
        { k: 'Código', v: k.code },
        { k: 'Método', v: method === 'manual' ? 'Busca manual' : 'Câmera' },
      ],
      hint: this.typ(k.typeId).half
        ? 'Meia-entrada: confira o documento que dá direito ao benefício. Direcione para a área ' +
          tp.split(' ')[0] +
          '.'
        : 'Direcione para a área ' + tp.split(' ')[0] + '.',
      snd: 'ok',
    };
  }
  showRes(r: Loose, t?: Loose) {
    if (this.state.g.sound && r.snd) beep(r.snd);
    this.upG({
      res: r,
      busy: false,
      cam: 'reading',
      cool: this.now() + 1400,
      last: t ? t.id : this.state.g.last,
      conf: null,
    });
    setTimeout(() => this.setState(s => ({ rev: s.rev + 1 })), 1450);
  }
  scan(kind) {
    const s = this.state,
      g = s.g,
      db = s.db,
      eid = g.eventId;
    if (kind === 'perm') {
      this.upG({ cam: 'denied', res: null });
      return;
    }
    if (kind === 'nocam') {
      this.upG({ cam: 'unavailable', res: null });
      return;
    }
    if (kind === 'offline') {
      this.upG({ online: !g.online });
      this.toast(g.online ? 'Simulado: sem internet.' : 'Conexão restabelecida.');
      return;
    }
    if (g.busy || g.res) return;
    if (g.cam !== 'reading') {
      this.toast('Ative a câmera antes de ler.');
      return;
    }
    if (kind === 'ilegivel') {
      this.showRes({
        id: 'V09',
        tone: 'gray',
        icon: '?',
        title: 'Não foi possível ler o QR',
        sub: 'A câmera não conseguiu ler o código. Nada foi consultado nem registrado.',
        lines: [],
        hint: 'Peça para aumentar o brilho da tela, afaste um pouco o celular ou use a busca manual.',
        snd: null,
        extra: 'manual',
      });
      return;
    }
    const mine = db.tickets.find(
      k =>
        k.eventId === eid &&
        k.status === 'valido' &&
        this.ord(k.orderId).userId === 'c1' &&
        this.ord(k.orderId).status === 'pago',
    );
    const pool = db.tickets.filter(
      k => k.eventId === eid && k.status === 'valido' && this.ord(k.orderId).status === 'pago',
    );
    let k: Ticket | null | undefined = null,
      code = '';
    if (kind === 'valido') k = mine || pool[Math.floor(Math.random() * pool.length)];
    if (kind === 'repetir')
      k = (g.last && this.tkt(g.last)) || db.tickets.find(x => x.eventId === eid && x.status === 'utilizado');
    if (kind === 'duplo') {
      k = pool.filter(x => x !== mine)[0];
      if (k) {
        const n = this.now();
        k.status = 'utilizado';
        k.usedAt = n - 1800;
        k.usedBy = 's3';
        k.method = 'câmera';
        db.checkins.push({
          ticketId: k.id,
          code: k.code,
          eventId: eid,
          by: 's3',
          result: 'valido',
          method: 'câmera',
          at: n - 1800,
        });
      }
    }
    if (kind === 'cancelado') k = db.tickets.find(x => x.eventId === eid && x.status === 'cancelado');
    if (kind === 'adulterado') {
      const b = pool[0] || db.tickets[0];
      code = b.code.slice(0, -1) + (b.code.slice(-1) === 'A' ? 'B' : 'A');
      k = null;
    }
    if (kind === 'outro') k = db.tickets.find(x => x.eventId !== eid && x.status === 'valido');
    if (!k && kind !== 'adulterado') {
      this.toast('Não há ingresso de exemplo para esta simulação neste evento.');
      return;
    }
    this.upG({ busy: true, cam: 'querying' });
    setTimeout(
      () => {
        if (!this.state.g.online) {
          this.showRes({
            id: 'V09',
            tone: 'gray',
            icon: '?',
            title: 'Não foi possível confirmar o ingresso',
            sub: 'O servidor não respondeu. Esta leitura não foi validada nem recusada.',
            lines: [],
            hint: 'Não libere a entrada por esta tela. Tente novamente. Sem internet, siga o procedimento de contingência da PartyX com a lista exportada antes do evento.',
            snd: null,
            extra: 'retry',
          });
          return;
        }
        const r = this.validate(k, 'câmera', code);
        this.mut(() => {});
        this.showRes(r, k);
      },
      this.state.g.online ? 700 : 2600,
    );
  }
  pwModalFields() {
    return [
      this.fld('pwf', 'cur', 'Senha atual', 'password'),
      this.fld('pwf', 'nw', 'Nova senha', 'password', { hint: 'Pelo menos 8 caracteres, com letras e números.' }),
      this.fld('pwf', 'nw2', 'Confirmar nova senha', 'password'),
    ];
  }
  savePw() {
    const f = this.state.pwf,
      u = this.user(),
      er: Loose = {};
    if (f.cur !== u.pw) er.cur = 'Senha atual incorreta.';
    if (f.nw.length < 8 || !/\d/.test(f.nw) || !/[a-zA-Z]/.test(f.nw))
      er.nw = 'Use pelo menos 8 caracteres, com letras e números.';
    else if (f.nw === f.cur) er.nw = 'A nova senha precisa ser diferente da atual.';
    if (f.nw !== f.nw2) er.nw2 = 'As senhas não são iguais.';
    if (Object.keys(er).length) {
      this.up('pwf', { err: er });
      return;
    }
    this.mut(() => {
      u.pw = f.nw;
    });
    this.setState({ modal: null });
    this.toast('Senha alterada.', 'ok');
  }
  saveCorr() {
    const f = this.state.corr,
      c = this.cust(this.state.buyer),
      db = this.state.db,
      er: Loose = {},
      email = norm(f.email),
      cpf = f.cpf.replace(/\D/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) er.email = 'Informe um e-mail válido.';
    else if (db.customers.some(x => x.email === email && x.id !== c.id))
      er.email = 'Este e-mail já pertence a outra conta.';
    if (!cpfOk(cpf)) er.cpf = 'CPF inválido.';
    else if (db.customers.some(x => x.cpf === cpf && x.id !== c.id)) er.cpf = 'Este CPF já pertence a outra conta.';
    if (f.why.trim().length < 5) er.why = 'Descreva o motivo da correção.';
    if (email === c.email && cpf === c.cpf) er.email = 'Nenhum dado foi alterado.';
    if (Object.keys(er).length) {
      this.up('corr', { err: er });
      return;
    }
    const ch: Loose[] = [];
    if (email !== c.email) ch.push('e-mail de ' + c.email + ' para ' + email);
    if (cpf !== c.cpf) ch.push('CPF de ' + maskCPF(c.cpf) + ' para ' + maskCPF(cpf));
    this.mut(db => {
      c.email = email;
      c.cpf = cpf;
      db.audit.push({
        t: this.now(),
        by: this.user().name,
        l: 'Correção: ' + ch.join('; ') + '. Motivo: ' + f.why.trim(),
        ent: c.id,
      });
    });
    this.setState({ modal: null });
    this.toast('Dados corrigidos e registrados em auditoria.', 'ok');
  }
  runExport() {
    const m = this.state.modal;
    this.setState({ modal: { ...m, st: 'busy' } });
    setTimeout(() => {
      const cur = this.state.modal;
      if (!cur || cur.kind !== 'export') return;
      const n = this.now(),
        stamp = fD(n).split('/').reverse().join('-') + '_' + fT(n).replace(':', '');
      this.setState({
        modal: {
          ...cur,
          st: cur.fail ? 'fail' : 'done',
          at: fDTs(n),
          fname: cur.base + '_' + stamp + '.' + (cur.fmt === 'pdf' ? 'pdf' : cur.fmt),
        },
      });
    }, 1400);
  }
  mo(eid: string, status?: string) {
    return this.state.db.orders.find(o => o.userId === 'c1' && o.eventId === eid && (!status || o.status === status));
  }
  mt(eid: string, st?: string) {
    const o = this.state.db.orders.filter(x => x.userId === 'c1' && x.eventId === eid).map(x => x.id);
    return this.state.db.tickets.find(k => o.includes(k.orderId) && (!st || k.status === st));
  }
  ckSetup(method: string | null, after?: (oid: string) => void) {
    const fresh: Loose = { promoIn: '', promo: null, promoMsg: null, outcome: 'aprovar', inst: false, orderId: null };
    this.jump('cliente', 'C02', {
      cart: { eventId: 'e1', q: { t12: 2, t14: 1 } },
      ck: fresh,
      ckAlert: null,
      after: () => {
        if (method) {
          this.startPayment(method);
          if (after) setTimeout(() => after(this.state.ck.orderId), 60);
        }
      },
    });
  }
}
