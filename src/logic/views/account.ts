import { brl, fD, fT, fDT, fDTs, fLong, maskCPF, mPhone } from '../../lib/format';
import { bd, ob, pb, kb } from '../../lib/badges';
import { pxQR } from '../../lib/qr';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function meV(app: PartyXLogic, { s, db, route, mob, desk, u }: ViewCtx): Loose {
  const U = ['U01', 'U02', 'U03', 'U04', 'U06'];
  const tabDef: [string, string, string[], string][] = [
    ['Meus ingressos', 'U01', ['U01', 'U04'], '▣'],
    ['Minhas compras', 'U02', ['U02', 'U03'], '≡'],
    ['Minha conta', 'U06', ['U06'], '○'],
  ];
  const me: Loose = {
    showTabs: !mob && U.includes(route),
    showBottom: mob && U.includes(route),
    padB: mob ? '96px' : '48px',
    tabs: tabDef.map(([l, r, m, i]) => ({
      label: l,
      icon: i,
      onClick: () => app.go(r),
      bc: m.includes(route) ? '#7C3AED' : 'transparent',
      fw: m.includes(route) ? 800 : 500,
      fg: m.includes(route) ? '#0B0B10' : '#5B5B6E',
    })),
  };
  const out: Loose = { me };
  if (![...U, 'U05'].includes(route) || !u) return out;
  const n = app.now(),
    myOrders = db.orders.filter(o => o.userId === u.id).sort((a, b) => b.created - a.created);
  const myTk = db.tickets.filter(k => myOrders.some(o => o.id === k.orderId));
  const tkIcon = k =>
    k.status === 'valido'
      ? ['QR', '#0B0B10', '#fff']
      : k.status === 'utilizado'
        ? ['✓', '#EEEEF3', '#3F3F50']
        : ['×', '#FEE2E2', '#991B1B'];
  if (route === 'U01') {
    const tab = s.v.meTab || 'prox';
    const evIds = [...new Set([...myTk.map(k => k.eventId), ...myOrders.filter(o => o.issuing).map(o => o.eventId)])];
    const groups = evIds
      .map(id => app.ev(id))
      .filter(e => (tab === 'prox') === e.start > n - 12 * 3600000)
      .sort((a, b) => (tab === 'prox' ? a.start - b.start : b.start - a.start))
      .map(e => {
        const ks = myTk.filter(k => k.eventId === e.id);
        return {
          name: e.name,
          date: fLong(e.start) + ' · ' + fT(e.start),
          venue: e.venue,
          c1: e.c1,
          c2: e.c2,
          count: ks.length + (ks.length === 1 ? ' ingresso' : ' ingressos'),
          issuing: myOrders.some(o => o.eventId === e.id && o.issuing),
          tickets: ks.map(k => {
            const [ic, ib, ifg] = tkIcon(k);
            return {
              type: app.typ(k.typeId).name,
              code: k.code,
              holder: k.holder,
              b: kb(k),
              icon: ic,
              iconBg: ib,
              iconFg: ifg,
              onClick: () => app.go('U04', { ticket: k.id }),
            };
          }),
        };
      });
    const loading = !!s.v.loadingMe,
      empty = !loading && (s.v.emptyMe || !groups.length);
    Object.assign(me, {
      segs: [
        ['prox', 'Próximos'],
        ['hist', 'Histórico'],
      ].map(([k, l]) => ({
        label: l,
        on: tab === k,
        onClick: () => app.setState({ v: { ...s.v, meTab: k } }),
        bg: tab === k ? '#fff' : 'transparent',
        sh: tab === k ? '0 1px 2px rgba(11,11,16,.12)' : 'none',
      })),
      loading,
      skel: [1, 2],
      empty,
      emptyTitle: tab === 'prox' ? 'Nenhum ingresso para os próximos eventos' : 'Nenhum ingresso no histórico',
      emptyText:
        tab === 'prox'
          ? 'Quando você comprar, seus ingressos aparecem aqui, um para cada unidade.'
          : 'Ingressos de eventos que já aconteceram ficam guardados aqui.',
      groups: loading || s.v.emptyMe ? [] : groups,
    });
  }
  if (route === 'U02')
    Object.assign(me, {
      noOrders: !myOrders.length,
      oCols: desk ? 'minmax(0,1.6fr) minmax(0,1fr) auto minmax(0,1.4fr)' : 'minmax(0,1fr)',
      orders: myOrders.map(o => ({
        num: o.num,
        date: fD(o.created),
        event: app.ev(o.eventId).name,
        qty: o.items.reduce((a, i) => a + i.qty, 0) + ' ingresso(s)',
        method: o.method === 'pix' ? 'Pix' : 'Cartão',
        total: brl(o.total),
        ob: ob(o),
        pb: pb(o),
        onClick: () => app.go('U03', { order: o.id }),
      })),
    });
  if (route === 'U03') {
    const o = app.ord();
    if (!o) return out;
    const ks = db.tickets.filter(k => k.orderId === o.id),
      e = app.ev(o.eventId),
      p = o.promoterId ? db.promoters.find(x => x.id === o.promoterId) : null;
    const tkStatus = ks.length
      ? ks.every(k => k.status === 'cancelado')
        ? bd('Cancelados', 'err')
        : bd(ks.filter(k => k.status !== 'cancelado').length + ' de ' + ks.length + ' ativos', 'ok')
      : o.issuing
        ? bd('Em emissão', 'info')
        : bd('Não emitidos', 'neu');
    const pend = o.status === 'pendente' && o.expiresAt > app.now();
    const cta = pend
      ? {
          show: true,
          bg: '#FFFBEB',
          fg: '#854D0E',
          text: 'Aguardando pagamento. A cobrança vale até ' + fT(o.expiresAt) + '.',
          label: 'Voltar ao pagamento',
          onClick: () => {
            app.setState(st => ({ ck: { ...st.ck, orderId: o.id } }));
            app.go(o.method === 'pix' ? 'C04' : 'C05');
          },
        }
      : o.status === 'expirado' || o.status === 'nao_concluido'
        ? {
            show: true,
            bg: '#F7F7FA',
            fg: '#3F3F50',
            text:
              o.status === 'expirado'
                ? 'Este pedido expirou e a reserva foi liberada.'
                : 'O pagamento deste pedido não foi aprovado.',
            label: 'Escolher ingressos novamente',
            onClick: () => app.openEvent(o.eventId),
          }
        : o.status === 'pago' && ks.length
          ? {
              show: true,
              bg: '#F0FDF4',
              fg: '#14532D',
              text: 'Pagamento aprovado. Seus ingressos estão disponíveis.',
              label: 'Ver ingressos',
              onClick: () => app.go('U04', { ticket: ks[0].id }),
            }
          : o.status === 'pago_sem_estoque'
            ? {
                show: true,
                bg: '#FFFBEB',
                fg: '#854D0E',
                text: 'Pagamento aprovado após o prazo, sem ingressos disponíveis. A PartyX vai entrar em contato para o estorno.',
                label: 'Entenda',
                onClick: () => app.go('C10', { order: o.id }),
              }
            : o.status === 'estornado' || o.status === 'contestado'
              ? {
                  show: true,
                  bg: '#EEF2FF',
                  fg: '#3730A3',
                  text:
                    o.status === 'estornado'
                      ? 'O pagamento foi estornado no gateway em ' + fD(o.refundAt) + '. Os ingressos foram cancelados.'
                      : 'O pagamento foi contestado junto ao cartão. Os ingressos foram cancelados.',
                  label: 'Ver eventos',
                  onClick: () => app.go('P02'),
                }
              : { show: false };
    out.od = {
      num: o.num,
      created: fDT(o.created),
      event: e.name,
      status: [
        { k: 'PEDIDO', ...ob(o) },
        { k: 'PAGAMENTO', ...pb(o) },
        { k: 'INGRESSOS', ...tkStatus },
      ],
      cta,
      cols: desk ? '1fr 1fr' : 'minmax(0,1fr)',
      lines: o.items.map(i => ({ qty: i.qty, name: app.typ(i.typeId).name, sub: brl(i.qty * i.unit) })),
      total: brl(o.total),
      method: o.method === 'pix' ? 'Pix' : 'Cartão de crédito' + (o.card4 ? ' final ' + o.card4 : ''),
      hasPromo: !!p,
      promo: p ? p.code : '',
      noTickets: !ks.length,
      noTicketsText: o.issuing
        ? 'Pagamento confirmado. Preparando seus ingressos.'
        : 'Ingressos são emitidos somente depois da confirmação do pagamento.',
      tickets: ks.map(k => ({
        type: app.typ(k.typeId).name,
        code: k.code,
        b: kb(k),
        onClick: () => app.go('U04', { ticket: k.id }),
      })),
      canDl: ks.some(k => k.status === 'valido'),
      dl: () => app.download('ingressos-' + o.num + '.pdf'),
      hist: o.hist
        .slice()
        .sort((a, b) => a.t - b.t)
        .map(h => ({ t: fDTs(h.t), l: h.l })),
    };
  }
  if (route === 'U04' || route === 'U05') {
    const k = app.tkt();
    if (!k) return out;
    const o = app.ord(k.orderId),
      e = app.ev(k.eventId),
      sib = db.tickets.filter(x => x.orderId === o.id),
      i = sib.indexOf(k),
      valid = k.status === 'valido';
    const stTitle = k.status === 'utilizado' ? 'Ingresso utilizado' : 'Ingresso cancelado';
    const stText =
      k.status === 'utilizado'
        ? 'Entrada registrada em ' + fDT(k.usedAt) + '. Este QR não permite nova entrada.'
        : 'Cancelado em ' +
          fDT(k.cancelAt) +
          '. Este ingresso não permite entrada. Dúvidas sobre reembolso: fale com a PartyX.';
    out.tk = {
      event: e.name,
      type: app.typ(k.typeId).name,
      code: k.code,
      holder: k.holder,
      b: kb(k),
      pos: 'Ingresso ' + (i + 1) + ' de ' + sib.length,
      valid,
      invalid: !valid,
      qr: pxQR(k.code),
      headBg: valid ? '#0B0B10' : '#EEEEF3',
      headFg: valid ? '#fff' : '#3F3F50',
      stBg: k.status === 'utilizado' ? '#EEEEF3' : '#FEE2E2',
      stFg: k.status === 'utilizado' ? '#3F3F50' : '#7F1D1D',
      stTitle,
      stText,
      date: fLong(e.start),
      time: fT(e.start),
      venue: e.venue,
      fields: [
        ['Data', fD(e.start), '1'],
        ['Horário', fT(e.start), '2'],
        ['Local', e.venue + ', ' + e.address, '1 / -1'],
        ['Tipo', app.typ(k.typeId).name, '1'],
        ['Comprador', k.holder, '2'],
        ['Código', k.code, '1'],
        ['Pedido', o.num, '2'],
      ].map(([a, b2, c]) => ({ k: a, v: b2, span: c })),
      full: () => app.go('U05'),
      close: () => app.go('U04'),
      dl: () => app.download('ingresso-' + k.code + '.pdf'),
      multi: sib.length > 1,
      prev: () => i > 0 && app.setState({ ticket: sib[i - 1].id }),
      next: () => i < sib.length - 1 && app.setState({ ticket: sib[i + 1].id }),
      prevOp: i > 0 ? 1 : 0.4,
      nextOp: i < sib.length - 1 ? 1 : 0.4,
    };
  }
  if (route === 'U06') {
    if (!s.acct || s.acct.uid !== u.id)
      setTimeout(() => app.setState({ acct: { uid: u.id, name: u.name, phone: u.phone || '', err: {} } }), 0);
    const a = s.acct && s.acct.uid === u.id ? s.acct : { name: u.name, phone: u.phone || '', err: {} },
      er = a.err || {};
    out.ac = {
      title: 'Minha conta',
      name: a.name,
      phone: a.phone,
      showPhone: true,
      showCpf: true,
      onName: e => app.up('acct', { name: e.target.value, err: {} }),
      onPhone: e => app.up('acct', { phone: mPhone(e.target.value), err: {} }),
      bName: er.name ? '2px solid #DC2626' : '1px solid #D4D4DE',
      bPhone: er.phone ? '2px solid #DC2626' : '1px solid #D4D4DE',
      eName: er.name || '',
      ePhone: er.phone || '',
      email: u.email,
      cpf: maskCPF(u.cpf),
      roNote: 'E-mail e CPF não podem ser alterados por aqui. Para corrigir, fale com o atendimento da PartyX.',
      save: () => {
        const x: Loose = {};
        if (a.name.trim().split(/\s+/).length < 2) x.name = 'Informe nome e sobrenome.';
        if (a.phone.replace(/\D/g, '').length < 10) x.phone = 'Informe o telefone com DDD.';
        if (Object.keys(x).length) {
          app.up('acct', { err: x });
          return;
        }
        app.mut(() => {
          u.name = a.name.trim();
          u.phone = a.phone;
        });
        app.toast('Dados atualizados.', 'ok');
      },
      openPw: () => app.setState({ modal: { kind: 'pw', id: 'U07' }, pwf: { cur: '', nw: '', nw2: '', err: {} } }),
      logout: () => app.logout(),
    };
  }
  return out;
}
// ---------- admin helpers ----------
