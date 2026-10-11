import { brl, pad, fT, fShort, maskCPF, maskEmail } from '../../lib/format';
import { MIN, RES_MIN } from '../../lib/constants';
import { ob, pb } from '../../lib/badges';
import { pxQR } from '../../lib/qr';
import { R } from '../routes';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function ckV(app: PartyXLogic, { s, db, route, mob, desk, u }: ViewCtx): Loose {
  const R2 = ['C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10'];
  if (!R2.includes(route)) return { ck: { show: false, res: { show: false }, timer: { show: false } } };
  const n = app.now(),
    o = route === 'C02' || route === 'C03' ? (s.ck.orderId ? app.ord(s.ck.orderId) : null) : app.ord();
  const useOrder = o && route !== 'C02' && route !== 'C03';
  const ev = app.ev(useOrder ? o.eventId : s.cart.eventId);
  const lines = useOrder
    ? o.items.map(i => {
        const t = app.typ(i.typeId);
        return { qty: i.qty, name: t.name, unit: brl(i.unit), sub: brl(i.qty * i.unit) };
      })
    : app.sel().map(i => ({ qty: i.qty, name: i.t.name, unit: brl(i.t.price), sub: brl(i.sub) }));
  const total = useOrder ? o.total : app.sel().reduce((a, i) => a + i.sub, 0);
  const promoId = useOrder ? o.promoterId : s.ck.promo,
    promo = promoId ? db.promoters.find(p => p.id === promoId) : null;
  const buyer = app.cust(useOrder ? o.userId : s.uid) || u || { name: '', email: '', cpf: '00000000000', phone: '' };
  const step = route === 'C02' ? 0 : ['C03', 'C04', 'C05', 'C06'].includes(route) ? 1 : 2;
  const A = (label, onClick, primary = true) => ({
    label,
    onClick,
    bg: primary ? '#7C3AED' : '#fff',
    fg: primary ? '#fff' : '#0B0B10',
    bd: primary ? '0' : '1px solid #D4D4DE',
    flex: mob ? '1 1 100%' : '0 0 auto',
  });
  const ck: Loose = {
    show: true,
    label: route + ' ' + R[route][0],
    cols: desk ? 'minmax(0,1fr) 360px' : 'minmax(0,1fr)',
    asidePos: desk ? 'sticky' : 'static',
    btnFlex: mob ? '1 1 100%' : '0 0 auto',
    padB: mob && route === 'C02' ? '104px' : '48px',
    steps: ['Revisão', 'Pagamento', 'Confirmação'].map((l, i) => ({
      label: l,
      n: i < step ? '✓' : i + 1,
      bg: i <= step ? '#0B0B10' : '#E4E4EC',
      nfg: i <= step ? '#fff' : '#5B5B6E',
      fg: i <= step ? '#0B0B10' : '#5B5B6E',
      fw: i === step ? 800 : 500,
      sep: i < 2 ? 'inline' : 'none',
    })),
    sum: {
      event: ev.name,
      date: fShort(ev.start),
      venue: ev.venue,
      c1: ev.c1,
      c2: ev.c2,
      lines,
      total: brl(total),
      hasPromo: !!promo,
      promo: promo ? promo.code + ' · sem alteração de valor' : '',
      hasBadges: !!useOrder,
      badges: useOrder
        ? [
            { ...ob(o), label: 'Pedido: ' + ob(o).label },
            { ...pb(o), label: 'Pagamento: ' + pb(o).label },
          ]
        : [],
    },
    buyer: { name: buyer.name, email: buyer.email, cpf: maskCPF(buyer.cpf), phone: buyer.phone },
    num: o ? o.num : '',
    mEmail: maskEmail(buyer.email),
    res: { show: false },
    timer: { show: false },
    mobBar: mob && route === 'C02',
  };
  if (o && o.status === 'pendente' && ['C04', 'C05'].includes(route)) {
    const left = Math.max(0, o.expiresAt - n),
      warn = left < 2 * MIN;
    ck.timer = {
      show: true,
      text: pad(Math.floor(left / MIN)) + ':' + pad(Math.floor((left % MIN) / 1000)),
      pct: Math.min(100, (left / (RES_MIN * MIN)) * 100) + '%',
      mins: RES_MIN,
      bg: warn ? '#FFFBEB' : '#F5F3FF',
      bd: warn ? '#FDE68A' : '#DDD6FE',
      fg: warn ? '#854D0E' : '#4C1D95',
      bar: warn ? '#EAB308' : '#7C3AED',
    };
  }
  if (route === 'C02') {
    const m = s.ck.promoMsg;
    Object.assign(ck, {
      hasAlert: !!s.ckAlert,
      alert: s.ckAlert || '',
      editSel: () => app.openEvent(ev.id),
      toPay: () => app.go('C03'),
      promoApplied: !!promo,
      promoCode: promo ? promo.code : '',
      promoForm: !promo,
      promoIn: s.ck.promoIn,
      onPromo: e => app.up('ck', { promoIn: e.target.value.toUpperCase(), promoMsg: null }),
      promoErr: m && m.tone === 'err' ? m.text : '',
      promoBd: m && m.tone === 'err' ? '2px solid #DC2626' : '1px solid #D4D4DE',
      applyPromo: e => {
        e.preventDefault();
        app.applyPromo();
      },
      removePromo: () => {
        app.up('ck', { promo: null, promoIn: '', promoMsg: null });
        app.toast('Código removido. O total continua o mesmo.');
      },
      fillPromoBad: () =>
        app.setState(
          st => ({ ck: { ...st.ck, promoIn: 'FESTA', promo: null, promoMsg: null } }),
          () => app.applyPromo(),
        ),
      fillPromoOff: () =>
        app.setState(
          st => ({ ck: { ...st.ck, promoIn: 'THIAGO', promo: null, promoMsg: null } }),
          () => app.applyPromo(),
        ),
      fillPromoOk: () =>
        app.setState(
          st => ({ ck: { ...st.ck, promoIn: 'DUDA', promo: null, promoMsg: null } }),
          () => app.applyPromo(),
        ),
      simTaken: () => {
        const it = app.sel()[0];
        if (!it) return;
        const sa = app.sale(it.t);
        app.mut(() => {
          it.t.taken = (it.t.taken || 0) + Math.max(0, (sa.avail || 0) - (it.qty - 1));
        });
        app.toast('Simulado: outro comprador reservou as últimas unidades de ' + it.t.name + '.');
      },
    });
  }
  if (route === 'C03') {
    const m = s.ck.method || 'pix';
    ck.methods = [
      ['pix', 'Pix', 'Aprovação em instantes. O QR Code e o código copia e cola valem até o fim da reserva.'],
      [
        'card',
        'Cartão de crédito',
        'Pagamento em campos seguros do gateway. Parcelamento aparece somente se estiver habilitado e aprovado no gateway escolhido.',
      ],
    ].map(([k, l, t]) => ({
      label: l,
      text: t,
      on: m === k,
      onClick: () => app.up('ck', { method: k }),
      bd: m === k ? '#7C3AED' : '#E4E4EC',
      rb: m === k ? '#7C3AED' : '#8A8A9E',
      dot: m === k ? '#7C3AED' : 'transparent',
    }));
    ck.startLabel = m === 'pix' ? 'Gerar Pix de ' + brl(total) : 'Continuar para o cartão';
    ck.startPay = () => app.startPayment(m);
  }
  if (route === 'C04' && o)
    Object.assign(ck, {
      pixCols: mob ? 'minmax(0,1fr)' : '260px minmax(0,1fr)',
      pixQR: pxQR('pix' + o.num + o.attempts, true),
      pixCode:
        '00020126BR.GOV.BCB.PIX0136' +
        o.gw.toLowerCase() +
        '-demo5204000053039865406' +
        (o.total / 100).toFixed(2) +
        '5802BR5906PARTYX6010SAOGABRIEL62070503***6304DEMO',
      copyPix: () => {
        try {
          navigator.clipboard.writeText('pix-demo-' + o.num);
        } catch (x) {}
        app.toast('Código Pix copiado.');
      },
      simApprove: () => app.approve(o.id),
      simExpire: () => app.expireOrder(o.id),
      simLateNo: () => app.lateApprove(o.id, false),
      simLateYes: () => app.lateApprove(o.id, true),
    });
  if (route === 'C05' && o) {
    const oc = s.ck.outcome || 'aprovar',
      busy = s.ck.card === 'busy';
    Object.assign(ck, {
      inst: !!s.ck.inst,
      instLabel: s.ck.inst ? 'Parcelamento habilitado no gateway: sim' : 'Parcelamento habilitado no gateway: não',
      toggleInst: () => app.up('ck', { inst: !s.ck.inst }),
      cardErr: s.ck.cardErr || '',
      cardBd: s.ck.cardErr ? '2px solid #DC2626' : '1px solid #D4D4DE',
      payCard: () => app.payCard(),
      payBg: busy ? '#6D28D9' : '#7C3AED',
      payLabel: busy ? 'Processando…' : 'Pagar ' + brl(o.total),
      outcomes: [
        ['aprovar', 'Aprovar'],
        ['recusar', 'Recusar'],
        ['erro', 'Falha de comunicação'],
        ['dados', 'Dados inválidos'],
      ].map(([k, l]) => ({
        label: l,
        onClick: () => app.up('ck', { outcome: k, cardErr: null }),
        bg: oc === k ? '#0B0B10' : '#fff',
        fg: oc === k ? '#fff' : '#3F3F50',
      })),
    });
  }
  if (route === 'C06' && o) ck.viewOrder = () => app.go('U03', { order: o.id });
  if (route === 'C07' && o) {
    const ks = db.tickets.filter(k => k.orderId === o.id),
      units = o.items.reduce((a, i) => a + i.qty, 0);
    Object.assign(ck, {
      issuing: !!o.issuing || !ks.length,
      issued: !o.issuing && ks.length > 0,
      skel: Array.from({ length: Math.min(units, 4) }, (_, i) => i),
      units: units + (units === 1 ? ' ingresso' : ' ingressos'),
      tickets: ks.map((k, i) => ({
        type: app.typ(k.typeId).name,
        code: k.code,
        pos: i + 1 + ' de ' + ks.length,
        onClick: () => app.go('U04', { ticket: k.id }),
      })),
      dl: () => app.download('ingressos-' + o.num + '.pdf'),
      simRepeat: () => app.approve(o.id),
    });
  }
  if (route === 'C08' && o)
    ck.res = {
      show: true,
      iBg: '#EEEEF3',
      iFg: '#3F3F50',
      icon: '◷',
      title: 'O prazo para pagamento terminou',
      body: 'A reserva foi liberada e este Pix não pode mais ser pago. Se ainda houver ingressos, você pode fazer um novo pedido. As quantidades são conferidas de novo.',
      hasBox: false,
      actions: [
        A('Voltar à seleção', () =>
          app.openEvent(o.eventId, {
            ckAlert: 'Seu pedido anterior expirou. Confira a disponibilidade atual antes de continuar.',
            ck: { ...s.ck, orderId: null },
          }),
        ),
        A('Ver pedido', () => app.go('U03', { order: o.id }), false),
      ],
    };
  if (route === 'C09' && o) {
    const comm = s.v.fail === 'comunicacao';
    ck.res = comm
      ? {
          show: true,
          iBg: '#FEF3C7',
          iFg: '#854D0E',
          icon: '?',
          title: 'Não conseguimos confirmar o pagamento',
          body: 'A comunicação com o gateway foi interrompida. Isso não significa que o pagamento foi aprovado ou recusado. Não faça um novo pagamento agora: vamos consultar o gateway novamente.',
          hasBox: true,
          boxBg: '#F7F7FA',
          boxFg: '#3F3F50',
          boxTitle: 'Sua reserva continua ativa até ' + fT(o.expiresAt) + '.',
          box: 'Se o pagamento for confirmado, os ingressos aparecem em Meus ingressos e você recebe um e-mail.',
          actions: [
            A('Verificar novamente', () => app.recheck(o.id)),
            A('Ver pedido', () => app.go('U03', { order: o.id }), false),
          ],
        }
      : {
          show: true,
          iBg: '#FEE2E2',
          iFg: '#991B1B',
          icon: '×',
          title: 'Pagamento não aprovado',
          body: 'A operadora do cartão não aprovou este pagamento. Nenhum ingresso foi emitido e a reserva foi liberada. Você pode tentar de novo no mesmo pedido, com outro cartão ou com Pix.',
          hasBox: true,
          boxBg: '#F7F7FA',
          boxFg: '#3F3F50',
          boxTitle: 'A disponibilidade é conferida de novo.',
          box:
            'Uma nova tentativa cria uma nova reserva no mesmo pedido ' +
            o.num +
            '. Não há pedido nem ingresso duplicado.',
          actions: [
            A('Tentar novamente', () => {
              app.setState(st => ({
                ck: { ...st.ck, orderId: o.id, method: 'card' },
                cart: { eventId: o.eventId, q: Object.fromEntries(o.items.map(i => [i.typeId, i.qty])) },
              }));
              app.go('C03');
            }),
            A(
              'Pagar com Pix',
              () =>
                app.setState(
                  st => ({
                    ck: { ...st.ck, orderId: o.id },
                    cart: { eventId: o.eventId, q: Object.fromEntries(o.items.map(i => [i.typeId, i.qty])) },
                  }),
                  () => app.startPayment('pix'),
                ),
              false,
            ),
          ],
        };
  }
  if (route === 'C10' && o)
    ck.res = {
      show: true,
      iBg: '#FEF3C7',
      iFg: '#854D0E',
      icon: '!',
      title: 'Pagamento confirmado, mas os ingressos esgotaram',
      body: 'Seu pagamento foi aprovado depois do fim da reserva e, nesse intervalo, as unidades foram vendidas. Nenhum ingresso foi emitido para este pedido.',
      hasBox: true,
      boxBg: '#FFFBEB',
      boxFg: '#854D0E',
      boxTitle: 'A PartyX foi avisada e vai resolver com você.',
      box: 'O atendimento da PartyX entra em contato pelo e-mail ou telefone do seu cadastro. O estorno é feito pela PartyX no gateway de pagamento; o prazo depende do meio de pagamento. Contato de atendimento: a fornecer pela PartyX.',
      actions: [
        A('Ver pedido', () => app.go('U03', { order: o.id })),
        A('Ver outros eventos', () => app.go('P02'), false),
      ],
    };
  return { ck };
}
