import { brl, fD, fT, fDT, fLong, norm } from '../../lib/format';
import { B } from '../../lib/badges';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function pubV(app: PartyXLogic, { s, db, route, mob, desk }: ViewCtx): Loose {
  const out: Loose = {};
  if (route === 'P01') {
    const list = app.pubEvents().filter(e => app.evSale(e).k !== 'closed'),
      feat = list.find(e => e.featured && app.evSale(e).k === 'open') || list[0];
    out.home = {
      hasFeat: !!feat,
      feat: feat
        ? { ...app.evCard(feat), cta: app.evSale(feat).k === 'open' ? 'Comprar ingressos' : 'Ver evento' }
        : {},
      heroH: mob ? '440px' : '520px',
      list: list.filter(e => e !== feat).map(e => app.evCard(e)),
      q: s.q,
      qDate: s.qDate,
      onQ: e => app.setState({ q: e.target.value }),
      onDate: e => app.setState({ qDate: e.target.value }),
      submit: e => {
        e.preventDefault();
        app.searchTo(s.q, s.qDate);
      },
    };
  }
  if (route === 'P02') {
    let all = app.pubEvents();
    const q = norm(s.lq),
      dd = s.lqDate;
    const filtering = !!(q || dd);
    let items = all.filter(
      e =>
        (filtering || app.evSale(e).k !== 'closed') &&
        (!q || norm(e.name).includes(q)) &&
        (!dd || fD(e.start) === dd.split('-').reverse().join('/')),
    );
    if (s.v.noSales) items = [];
    const chips: Loose[] = [];
    if (s.lq) chips.push({ label: 'Nome: ' + s.lq, onRemove: () => app.searchTo('', s.lqDate) });
    if (dd) chips.push({ label: 'Data: ' + dd.split('-').reverse().join('/'), onRemove: () => app.searchTo(s.lq, '') });
    const empty = !s.listLoading && !items.length;
    out.list = {
      q: s.lq,
      qDate: s.lqDate,
      onQ: e => app.setState({ lq: e.target.value }),
      onDate: e => app.setState({ lqDate: e.target.value }),
      submit: e => {
        e.preventDefault();
        app.searchTo(s.lq, s.lqDate);
      },
      chips,
      hasChips: chips.length > 0,
      clear: () => app.searchTo('', ''),
      loading: s.listLoading,
      skel: [1, 2, 3],
      showItems: !s.listLoading && items.length > 0,
      items: items.map(e => app.evCard(e)),
      showEmpty: empty,
      countText: s.listLoading
        ? 'Buscando eventos…'
        : items.length
          ? items.length + (items.length === 1 ? ' evento encontrado' : ' eventos encontrados')
          : '',
      emptyTitle: filtering ? 'Nenhum evento encontrado' : 'Nenhuma venda disponível no momento',
      emptyText: filtering
        ? 'Não há eventos com esse nome ou nessa data. Tente outra palavra ou limpe os filtros.'
        : 'Quando a PartyX abrir as vendas de um novo evento, ele aparece aqui.',
    };
  }
  if (route === 'P03') {
    const e = app.ev();
    const vis = e && (e.status !== 'rascunho' || s.preview);
    if (!vis) {
      out.evp = {};
      setTimeout(() => app.go('P07', {}, true), 0);
      return out;
    }
    const es = app.evSale(e),
      ended = es.k === 'ended',
      ts = db.types.filter(t => t.eventId === e.id);
    const items = app.sel(),
      units = items.reduce((a, i) => a + i.qty, 0),
      total = items.reduce((a, i) => a + i.sub, 0);
    const notice = ended
      ? {
          show: true,
          bg: '#E4E4EC',
          fg: '#0B0B10',
          title: 'Este evento já aconteceu',
          text:
            'Evento encerrado em ' +
            fD(e.start) +
            '. As vendas não estão mais disponíveis. Esta página continua acessível para consulta pelo link.',
        }
      : es.k === 'soon'
        ? {
            show: true,
            bg: '#EDE9FE',
            fg: '#4C1D95',
            title: 'Vendas ainda não iniciadas',
            text: 'Os ingressos estarão à venda a partir de ' + fDT(es.start) + '.',
          }
        : es.k === 'closed'
          ? {
              show: true,
              bg: '#EEEEF3',
              fg: '#0B0B10',
              title: 'Vendas encerradas',
              text: 'As vendas online deste evento foram encerradas. Em caso de dúvida, fale com a PartyX.',
            }
          : es.k === 'out'
            ? {
                show: true,
                bg: '#FEE2E2',
                fg: '#7F1D1D',
                title: 'Ingressos esgotados',
                text: 'Todos os ingressos disponíveis foram vendidos.',
              }
            : { show: false };
    const lim = e.limit,
      can = units > 0;
    out.evp = {
      name: e.name,
      dateLong: fLong(e.start),
      time: 'Início às ' + fT(e.start),
      venue: e.venue,
      address: e.address,
      age: e.age,
      desc: e.desc,
      attractions: e.attractions,
      c1: e.c1,
      c2: e.c2,
      ratio: mob ? '4 / 3' : '21 / 8',
      isEnded: ended,
      isPreview: s.preview,
      backToEditor: () => app.go('ADM03', { preview: false }),
      notice,
      cols: desk ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr)',
      asidePos: desk ? 'sticky' : 'static',
      share: () => app.setState({ modal: { kind: 'share', id: 'E05' } }),
      copy: () => {
        try {
          navigator.clipboard.writeText('https://dominio-partyx/eventos/' + e.slug);
        } catch (x) {}
        app.toast('Link copiado: dominio-partyx/eventos/' + e.slug);
      },
      showTickets: !ended && ts.some(t => t.active || true),
      limitText: 'Até ' + lim + ' por compra',
      hasAlert: !!s.ckAlert,
      alert: s.ckAlert || '',
      types: ts.map(t => {
        const sa = app.sale(t),
          q = s.cart.q[t.id] || 0;
        return {
          name: t.name,
          price: brl(t.price),
          note: sa.note,
          canBuy: sa.buy,
          noBuy: !sa.buy,
          badge: sa.label,
          bBg: B[sa.tone][0],
          bFg: B[sa.tone][1],
          op: sa.buy ? 1 : 0.72,
          qty: q,
          dec: () => app.qty(t.id, -1),
          inc: () => app.qty(t.id, 1),
          decC: q ? '#0B0B10' : '#C9C9D6',
          incC: units >= lim || q >= sa.avail ? '#C9C9D6' : '#0B0B10',
        };
      }),
      hasSel: can,
      lines: items.map(i => ({ l: i.qty + ' × ' + i.t.name, v: brl(i.sub) })),
      total: brl(total),
      selCount: can ? units + (units === 1 ? ' ingresso' : ' ingressos') : 'Nenhum ingresso selecionado',
      cont: () => app.contCheckout(),
      contDis: !can,
      contBg: can ? '#7C3AED' : '#E4E4EC',
      contFg: can ? '#fff' : '#8A8A9E',
      contLabel: 'Continuar',
      mobBar: mob && !ended && es.k === 'open',
      padBottom: mob && !ended && es.k === 'open' ? '96px' : '0',
    };
  }
  const L: Loose = {
    P04: [
      'Termos de Uso',
      'Os Termos de Uso serão publicados com o texto fornecido pela PartyX (Etapa 0, item 9). Este espaço não contém texto provisório com valor jurídico.',
      ['1. Objeto', '2. Cadastro e conta', '3. Compra de ingressos', '4. Responsabilidades'],
    ],
    P05: [
      'Política de Privacidade',
      'A Política de Privacidade será publicada com o texto fornecido pela PartyX, controladora dos dados (Etapa 0, item 10).',
      ['1. Dados coletados', '2. Finalidades', '3. Compartilhamento', '4. Direitos do titular'],
    ],
    P06: [
      'Política de Cancelamento, Troca e Reembolso',
      'A política de cancelamento, troca e reembolso será publicada com o texto fornecido pela PartyX (Etapa 0, item 11). Solicitações de cancelamento ou reembolso são atendidas pela PartyX.',
      ['1. Cancelamento pelo comprador', '2. Alteração ou cancelamento do evento', '3. Reembolso', '4. Como solicitar'],
    ],
  };
  if (L[route])
    out.legal = {
      show: true,
      label: route + ' ' + L[route][0],
      title: L[route][0],
      pending: L[route][1],
      skeleton: L[route][2],
      cols: desk ? '240px minmax(0,1fr)' : 'minmax(0,1fr)',
      navPos: desk ? 'sticky' : 'static',
      docs: ['P04', 'P05', 'P06'].map(k => ({
        label: L[k][0],
        onClick: () => app.go(k),
        bg: k === route ? '#EDE9FE' : 'transparent',
        fw: k === route ? 700 : 500,
      })),
    };
  else out.legal = { show: false };
  return out;
}
