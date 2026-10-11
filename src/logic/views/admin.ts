import { T, brl, fD, fT, fTs, fDT, fDTs, MOL, fLong, norm, fmtCPF, maskCPF } from '../../lib/format';
import { DAY, PERIODS } from '../../lib/constants';
import { bd, OST, KST, ob, pb, kb, eb } from '../../lib/badges';
import { R } from '../routes';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function admV(app: PartyXLogic, { s, db, route, mob, desk, fw, u }: ViewCtx): Loose {
  if ((R[route] || [])[2] !== 'adm') return {};
  app._mob = mob;
  const n = app.now(),
    st = app.stats(),
    f = s.f,
    B2 = (label, onClick, kind?) => app.btn(label, onClick, kind);
  const ap: Loose = {
    label: route + ' ' + R[route][0],
    section: R[route][0],
    pad: mob ? '16px 12px 40px' : '24px 24px 48px',
    back: { show: false },
    eyebrow: '',
    title: R[route][0],
    badges: [],
    sub: '',
    actions: [],
    alerts: [],
    hasTabs: false,
    tabs: [],
    filters: { has: false },
    grid: desk ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)',
    blocks: [],
    hasDemo: false,
    demo: [],
  };
  const half = desk ? 'span 1' : '1 / -1';
  const paid = db.orders.filter(o => o.status === 'pago');
  const late = db.orders.filter(o => o.status === 'pago_sem_estoque');
  const lateAlerts = late.map(o => ({
    bg: '#FEF2F2',
    fg: '#991B1B',
    bd: '#FECACA',
    title: 'Pagamento aprovado sem estoque · ' + o.num + '.',
    text:
      app.cust(o.userId).name +
      ' pagou ' +
      brl(o.total) +
      ' após o fim da reserva e não havia unidades. Nenhum ingresso foi emitido. Entre em contato com o comprador e faça o estorno no painel do gateway; o status atualiza quando o gateway informar.',
    hasAct: route !== 'ADM11' || s.order !== o.id,
    act: { label: 'Ver pedido', onClick: () => app.go('ADM11', { order: o.id }) },
  }));
  const typeRowsFor = e => db.types.filter(t => t.eventId === e.id);
  const evTotals = e => {
    const ts = typeRowsFor(e);
    const cap = ts.reduce((a, t) => a + t.total, 0),
      sold = ts.reduce((a, t) => a + st[t.id].sold, 0),
      res = ts.reduce((a, t) => a + st[t.id].res, 0),
      avail = ts.filter(t => app.sale(t).buy).reduce((a, t) => a + st[t.id].avail, 0),
      val = paid.filter(o => o.eventId === e.id).reduce((a, o) => a + o.total, 0),
      used = ts.reduce((a, t) => a + st[t.id].used, 0);
    return { cap, sold, res, avail, val, used };
  };

  if (route === 'ADM01') {
    const [d0] = app.range('hoje'),
      today = paid.filter(o => o.paidAt! >= d0),
      month = paid.filter(o => app.inR(o.paidAt!, 'mes'));
    const live = db.events.filter(e => e.status === 'publicado' && e.start > n - 8 * 3600000);
    const remaining = live.reduce((a, e) => a + evTotals(e).avail, 0),
      reserved = db.types.reduce((a, t) => a + st[t.id].res, 0);
    const entToday = db.checkins.filter(c => c.result === 'valido' && c.at >= d0).length;
    ap.sub = 'Dados de ' + fD(n) + ' às ' + fT(n) + '. Valores consideram somente pedidos com pagamento aprovado.';
    ap.alerts = lateAlerts;
    const days = Array.from({ length: 14 }, (_, i) => d0 - (13 - i) * DAY);
    ap.blocks = [
      app.kpis(
        [
          [
            'Vendas hoje',
            brl(today.reduce((a, o) => a + o.total, 0)),
            today.length + ' pedidos pagos hoje. Não inclui reservas.',
          ],
          [
            'Vendas no mês',
            brl(month.reduce((a, o) => a + o.total, 0)),
            'Pedidos pagos em outubro. Estornos e contestações ficam fora.',
          ],
          [
            'Ingressos vendidos no mês',
            month.reduce((a, o) => a + app.units(o), 0),
            'Unidades em pedidos pagos no mês.',
          ],
          ['Eventos em andamento', live.length, 'Publicados, de hoje em diante.'],
          ['Ingressos restantes', remaining, 'Capacidade menos vendidos e reservados, só tipos à venda.'],
          ['Reservas ativas', reserved, 'Unidades em checkout com prazo aberto. Ainda não são vendas.', '#5B21B6'],
          ['Entradas hoje', entToday, 'Leituras válidas na portaria. Repetidas não contam.'],
        ],
        '160px',
      ),
      app.chart(
        'Vendas por dia',
        days.map(d => {
          const v = paid.filter(o => o.paidAt! >= d && o.paidAt! < d + DAY).reduce((a, o) => a + o.total, 0);
          return { v, label: fD(d).slice(0, 5), tip: brl(v), hl: d === d0 };
        }),
        'Valor de pedidos pagos por dia de aprovação, últimos 14 dias. Barra escura: hoje.',
      ),
      app.tbl(
        'ov-ev',
        'Resumo por evento',
        [
          { label: 'Evento', w: '1.4fr' },
          { label: 'Vendidos / capacidade', w: '1.6fr' },
          { label: 'Reservados', w: '.8fr', align: 'right' },
          { label: 'Restantes', w: '.8fr', align: 'right' },
          { label: 'Valor vendido', w: '1fr', align: 'right' },
          { label: 'Entradas', w: '.8fr', align: 'right' },
        ],
        live.map(e => {
          const x = evTotals(e);
          return {
            onClick: () => app.go('ADM04', { ev: e.id, admTab: 'vendas' }),
            cells: [
              { t: e.name, strong: true, sub: fD(e.start) },
              {
                k: 'bar',
                w: (x.sold / Math.max(1, x.cap)) * 100 + '%',
                w2: (x.res / Math.max(1, x.cap)) * 100 + '%',
                t: x.sold + ' / ' + x.cap,
              },
              { t: x.res },
              { t: x.avail },
              { t: brl(x.val), strong: true },
              { t: x.used },
            ],
          };
        }),
        { all: true, minW: '760px' },
      ),
      app.tbl(
        'ov-rec',
        'Pedidos recentes',
        app.orderCols(),
        db.orders
          .slice()
          .sort((a, b) => b.created - a.created)
          .slice(0, 8)
          .map(o => app.orderRow(o)),
        { all: true, minW: '900px', actions: [B2('Ver todos', () => app.go('ADM10'))] },
      ),
    ];
  }
  if (route === 'ADM02') {
    const cnt = k => db.events.filter(e => k === 'todos' || e.status === k).length;
    ap.actions = [B2('Criar evento', () => app.openEventForm(null), 'pri')];
    ap.hasTabs = true;
    ap.tabs = [
      ['todos', 'Todos'],
      ['rascunho', 'Rascunho'],
      ['publicado', 'Publicado'],
      ['encerrado', 'Encerrado'],
    ].map(([k, l]) => ({
      label: l + ' ' + cnt(k),
      onClick: () => app.setF('evStatus', k),
      bc: f.evStatus === k ? '#7C3AED' : 'transparent',
      fw: f.evStatus === k ? 800 : 500,
      fg: f.evStatus === k ? '#0B0B10' : '#5B5B6E',
    }));
    ap.filters = app.filt({ search: { key: 'evQ', ph: 'Nome do evento' } });
    const evs = db.events
      .filter(
        e => (f.evStatus === 'todos' || e.status === f.evStatus) && (!f.evQ || norm(e.name).includes(norm(f.evQ))),
      )
      .sort((a, b) => b.start - a.start);
    ap.blocks = [
      app.tbl(
        'evs',
        '',
        [
          { label: 'Evento', w: '1.6fr' },
          { label: 'Data', w: '1fr' },
          { label: 'Status', w: '.9fr' },
          { label: 'Vendidos', w: '1.3fr' },
          { label: 'Valor vendido', w: '1fr', align: 'right' },
          { label: '', w: '1.5fr', align: 'right' },
        ],
        evs.map(e => {
          const x = evTotals(e),
            es = app.evSale(e);
          return {
            onClick: () => app.go('ADM04', { ev: e.id, admTab: 'info' }),
            cells: [
              { t: e.name, strong: true, sub: e.venue + (e.featured ? ' · Destaque' : '') },
              { t: fD(e.start), sub: fT(e.start) },
              { k: 'b', badge: eb(e), sub: e.status === 'publicado' ? es.label : '' },
              {
                k: 'bar',
                w: (x.sold / Math.max(1, x.cap)) * 100 + '%',
                w2: (x.res / Math.max(1, x.cap)) * 100 + '%',
                t: x.sold + ' / ' + x.cap,
              },
              { t: brl(x.val) },
              {
                k: 'a',
                acts: [
                  { label: 'Editar', onClick: () => app.openEventForm(e.id) },
                  { label: 'Ingressos', onClick: () => app.go('ADM04', { ev: e.id, admTab: 'tipos' }) },
                  {
                    label: e.status === 'rascunho' ? 'Pré-visualizar' : 'Ver página',
                    onClick: () =>
                      app.go('P03', { ev: e.id, preview: e.status === 'rascunho', cart: { eventId: e.id, q: {} } }),
                  },
                ],
              },
            ],
          };
        }),
        {
          minW: '980px',
          empty: {
            title: 'Nenhum evento encontrado',
            text:
              f.evQ || f.evStatus !== 'todos'
                ? 'Nenhum evento corresponde aos filtros.'
                : 'Crie o primeiro evento para começar a vender.',
            act: { label: 'Criar evento', onClick: () => app.openEventForm(null) },
          },
        },
      ),
    ];
  }
  if (route === 'ADM03') {
    const F = s.evf || {},
      isNew = !F.id,
      e = F.id ? app.ev(F.id) : null;
    ap.back = {
      show: true,
      label: isNew ? 'Eventos' : e!.name,
      onClick: () => (isNew ? app.go('ADM02') : app.go('ADM04', { ev: F.id })),
    };
    ap.title = isNew ? 'Criar evento' : 'Editar evento';
    ap.badges = e ? [eb(e)] : [bd('Novo rascunho', 'neu')];
    ap.sub = isNew
      ? 'O evento é salvo como rascunho e só aparece no site depois de publicado.'
      : 'Alterações em eventos publicados aparecem no site ao salvar.';
    ap.actions = [
      B2('Cancelar', () => (isNew ? app.go('ADM02') : app.go('ADM04', { ev: F.id }))),
      B2(isNew ? 'Salvar e pré-visualizar' : 'Pré-visualizar', () => app.saveEvent('preview')),
      B2(isNew || e!.status === 'rascunho' ? 'Salvar rascunho' : 'Salvar alterações', () => app.saveEvent(), 'pri'),
    ];
    if (s.dirty)
      ap.alerts = [
        {
          bg: '#FFFBEB',
          fg: '#854D0E',
          bd: '#FDE68A',
          title: 'Alterações não salvas.',
          text: 'Salve antes de sair desta página para não perder o que foi preenchido.',
          hasAct: false,
          act: {},
        },
      ];
    const up: Loose = {
      hasPreview: F.banner === 'ok',
      busy: F.banner === 'up',
      empty: !F.banner || F.banner === 'err',
      err: F.banner === 'err',
      pct: (F.pct || 0) + '%',
      name: 'banner-' + (norm(F.name).replace(/[^a-z0-9]+/g, '-') || 'evento') + '.jpg',
      bd: F.banner === 'err' ? '#FCA5A5' : '#C9C9D6',
      pick: () => app.fakeUpload(false),
      pickBad: () => app.fakeUpload(true),
      remove: () => app.setState(st2 => ({ evf: { ...st2.evf, banner: null }, dirty: true })),
    };
    const ages = ['Livre', '10 anos', '12 anos', '14 anos', '16 anos', '18 anos'].map(x => ({ v: x, l: x }));
    ap.blocks = [
      app.form(
        'Informações',
        [
          app.fld('evf', 'name', 'Nome do evento'),
          app.fld('evf', 'date', 'Data', 'date', { half: true }),
          app.fld('evf', 'time', 'Horário de início', 'time', { half: true }),
          app.fld('evf', 'venue', 'Local', 'text', { half: true, ph: 'Ex.: Galpão Aurora' }),
          app.fld('evf', 'address', 'Endereço', 'text', { half: true, ph: 'Rua, número, bairro, cidade/UF' }),
          app.fld('evf', 'age', 'Classificação etária', 'select', { half: true, options: ages }),
          app.fld('evf', 'limit', 'Limite de ingressos por compra', 'number', {
            half: true,
            hint: 'Premissa: limite por pedido, somando todos os tipos. Valor a definir pela PartyX (Etapa 0, item 15).',
          }),
          app.fld('evf', 'featured', 'Destaque na página inicial', 'toggle', {
            onLabel: 'Em destaque (substitui o destaque atual)',
            offLabel: 'Sem destaque',
            hint: 'Apenas um evento fica em destaque por vez.',
          }),
        ],
        { span: '1 / -1' },
      ),
      app.form(
        'Descrição e atrações',
        [
          app.fld('evf', 'desc', 'Descrição', 'area'),
          app.fld('evf', 'attractions', 'Atrações', 'area', { hint: 'Uma atração por linha.' }),
        ],
        { span: half },
      ),
      app.form(
        'Banner',
        [
          app.fld('evf', 'banner', 'Imagem de divulgação', 'upload', {
            up,
            hint: 'Também é usada na pré-visualização de compartilhamento (Open Graph).',
          }),
        ],
        { span: half },
      ),
      app.note(
        'info',
        'Tipos de ingresso.',
        isNew
          ? 'Depois de salvar o rascunho, cadastre os tipos na aba Tipos de ingresso. Publicar exige pelo menos um tipo ativo e o banner.'
          : 'Gerencie os tipos na aba Tipos de ingresso do evento.',
      ),
    ];
  }
  if (route === 'ADM04') {
    const e = app.ev();
    if (!e) return { ap };
    const x = evTotals(e),
      tab = s.admTab || 'info',
      ts = typeRowsFor(e);
    ap.back = { show: true, label: 'Eventos', onClick: () => app.go('ADM02') };
    ap.title = e.name;
    ap.badges = [eb(e), ...(e.featured ? [bd('Destaque', 'info')] : [])];
    ap.sub = fLong(e.start) + ' · ' + fT(e.start) + ' · ' + e.venue;
    ap.section = e.name;
    ap.actions =
      e.status === 'rascunho'
        ? [
            B2('Editar', () => app.openEventForm(e.id)),
            B2('Pré-visualizar', () => app.go('P03', { ev: e.id, preview: true, cart: { eventId: e.id, q: {} } })),
            B2('Publicar', () => app.publishEvent(e), 'pri'),
          ]
        : e.status === 'publicado'
          ? [
              B2('Editar', () => app.openEventForm(e.id)),
              B2('Ver página pública', () => app.go('P03', { ev: e.id, cart: { eventId: e.id, q: {} } })),
              B2('Encerrar evento', () => app.closeEvent(e), 'dan'),
            ]
          : [B2('Ver página', () => app.go('P03', { ev: e.id, cart: { eventId: e.id, q: {} } }))];
    if (e.status === 'encerrado')
      ap.alerts = [
        {
          bg: '#F7F7FA',
          fg: '#3F3F50',
          bd: '#E4E4EC',
          title: 'Evento encerrado.',
          text: 'Não aparece na listagem e não aceita novas vendas. Ingressos emitidos continuam com o status atual.',
          hasAct: false,
          act: {},
        },
      ];
    const orders = db.orders.filter(o => o.eventId === e.id).sort((a, b) => b.created - a.created);
    ap.hasTabs = true;
    ap.tabs = [
      ['info', 'Informações'],
      ['tipos', 'Tipos de ingresso (' + ts.length + ')'],
      ['pedidos', 'Pedidos e compradores'],
      ['vendas', 'Vendas'],
      ['entradas', 'Entradas'],
    ].map(([k, l]) => ({
      label: l,
      onClick: () => app.setState({ admTab: k }),
      bc: tab === k ? '#7C3AED' : 'transparent',
      fw: tab === k ? 800 : 500,
      fg: tab === k ? '#0B0B10' : '#5B5B6E',
    }));
    if (tab === 'info')
      ap.blocks = [
        app.kv(
          'Dados do evento',
          [
            { k: 'Nome', v: e.name },
            { k: 'Data', v: fD(e.start) },
            { k: 'Horário', v: fT(e.start) },
            { k: 'Local', v: e.venue },
            { k: 'Endereço', v: e.address || 'Não informado', span: '1 / -1' },
            { k: 'Classificação etária', v: e.age },
            { k: 'Limite por compra', v: e.limit + ' ingressos' },
            { k: 'Destaque', v: e.featured ? 'Sim' : 'Não' },
            { k: 'Endereço público', v: '/eventos/' + e.slug, mono: true },
            { k: 'Atrações', v: e.attractions.join(', '), span: '1 / -1' },
            { k: 'Descrição', v: e.desc || 'Não informada', span: '1 / -1' },
            {
              k: 'Banner',
              v: e.banner === false ? 'Não enviado' : 'Enviado',
              badge: e.banner === false ? bd('Pendente', 'warn') : null,
            },
          ],
          { actions: [B2('Editar', () => app.openEventForm(e.id))] },
        ),
      ];
    if (tab === 'tipos')
      ap.blocks = [
        app.prog(
          'Disponibilidade',
          ts.map(t => {
            const y = st[t.id];
            return {
              label: t.name,
              right: y.sold + ' vendidos · ' + y.res + ' reservados · ' + y.avail + ' disponíveis de ' + t.total,
              segs: [
                { w: (y.sold / t.total) * 100 + '%', c: '#7C3AED' },
                { w: (y.res / t.total) * 100 + '%', c: '#C4B5FD' },
              ],
            };
          }),
          [
            { label: 'Vendidos (emitidos)', c: '#7C3AED' },
            { label: 'Reservados em checkout', c: '#C4B5FD' },
            { label: 'Disponíveis', c: '#EEEEF3' },
          ],
          { sub: 'Reservas são temporárias e voltam ao estoque quando expiram.' },
        ),
        app.tbl(
          'types',
          'Tipos de ingresso',
          [
            { label: 'Tipo', w: '1.5fr' },
            { label: 'Preço', w: '.8fr', align: 'right' },
            { label: 'Capacidade', w: '.8fr', align: 'right' },
            { label: 'Vendidos', w: '.7fr', align: 'right' },
            { label: 'Reservados', w: '.8fr', align: 'right' },
            { label: 'Disponíveis', w: '.8fr', align: 'right' },
            { label: 'Período de vendas', w: '1.4fr' },
            { label: 'Situação', w: '1fr' },
            { label: '', w: '1.3fr', align: 'right' },
          ],
          ts.map(t => {
            const y = st[t.id],
              sa = app.sale(t);
            return {
              cells: [
                { t: t.name, strong: true, sub: t.half ? 'Meia-entrada · conferência na portaria' : '' },
                { t: brl(t.price) },
                { t: t.total },
                { t: y.sold },
                { t: y.res },
                { t: y.avail },
                { t: fDTs(t.start), sub: 'até ' + fDTs(t.end) },
                { k: 'b', badge: bd(sa.label, sa.tone) },
                {
                  k: 'a',
                  acts: [
                    { label: 'Editar', onClick: () => app.openType(e.id, t.id) },
                    { label: t.active ? 'Desativar' : 'Ativar', onClick: () => app.toggleType(t), danger: t.active },
                  ],
                },
              ],
            };
          }),
          {
            all: true,
            minW: '1120px',
            actions: [B2('Novo tipo de ingresso', () => app.openType(e.id, null), 'pri')],
            empty: {
              title: 'Nenhum tipo de ingresso',
              text: 'Cadastre pelo menos um tipo ativo para publicar o evento.',
              act: { label: 'Novo tipo de ingresso', onClick: () => app.openType(e.id, null) },
            },
          },
        ),
        app.note(
          'neu',
          'Lotes e meia-entrada.',
          'Lotes são tipos com nomes e períodos próprios (ex.: Pista 1º lote, Pista 2º lote), ativados manualmente; não há virada automática. Meia-entrada é um tipo comum; a conferência do documento é feita na portaria, sem envio de comprovante. Cancelamentos não devolvem unidades ao estoque automaticamente (premissa a confirmar).',
        ),
      ];
    if (tab === 'pedidos')
      ap.blocks = [
        app.tbl(
          'ev-ord',
          'Pedidos do evento',
          app.orderCols(false),
          orders.map(o => app.orderRow(o, false)),
          {
            minW: '860px',
            actions: [
              B2('Compradores', () => app.go('ADM12', { f: { ...f, buyEv: e.id } })),
              B2('Lista de ingressos', () => app.go('ADM14', { f: { ...f, tkEv: e.id } })),
            ],
            empty: { title: 'Nenhum pedido ainda', text: 'Os pedidos aparecem aqui quando alguém iniciar uma compra.' },
          },
        ),
      ];
    if (tab === 'vendas') {
      const po = paid.filter(o => o.eventId === e.id);
      ap.blocks = [
        app.kpis([
          ['Valor vendido', brl(x.val), 'Soma dos pedidos pagos.'],
          ['Ingressos vendidos', po.reduce((a, o) => a + app.units(o), 0), 'Unidades em pedidos pagos.'],
          ['Reservas ativas', x.res, 'Não são vendas.', '#5B21B6'],
          ['Pedidos pagos', po.length, ''],
        ]),
        app.tbl(
          'ev-type',
          'Por tipo de ingresso',
          [
            { label: 'Tipo', w: '1.6fr' },
            { label: 'Preço', w: '1fr', align: 'right' },
            { label: 'Unidades', w: '1fr', align: 'right' },
            { label: 'Valor', w: '1fr', align: 'right' },
          ],
          ts.map(t => {
            const q = po.reduce((a, o) => a + o.items.filter(i => i.typeId === t.id).reduce((b, i) => b + i.qty, 0), 0);
            return {
              cells: [
                { t: t.name, strong: true },
                { t: brl(t.price) },
                { t: q },
                {
                  t: brl(
                    po.reduce(
                      (a, o) => a + o.items.filter(i => i.typeId === t.id).reduce((b, i) => b + i.qty * i.unit, 0),
                      0,
                    ),
                  ),
                  strong: true,
                },
              ],
            };
          }),
          {
            all: true,
            actions: [
              B2('Relatório completo', () =>
                app.go('ADM16', { f: { ...f, repEv: e.id, repType: 'todos', repPer: 'tudo' } }),
              ),
            ],
          },
        ),
      ];
    }
    if (tab === 'entradas')
      ap.blocks = [
        app.kpis([
          ['Entradas registradas', x.used, 'Leituras válidas únicas.'],
          [
            'Ingressos válidos emitidos',
            ts.reduce((a, t) => a + st[t.id].used + st[t.id].valid, 0),
            'Exclui cancelados.',
          ],
          ['Ainda não entraram', ts.reduce((a, t) => a + st[t.id].valid, 0), ''],
        ]),
        app.note(
          'info',
          'Acompanhamento em tempo real.',
          'A tela de Entradas atualiza automaticamente durante o evento.',
          '1 / -1',
        ),
        app.blk({
          isCard: true,
          hasHead: true,
          title: 'Abrir acompanhamento',
          actions: [B2('Ir para Entradas', () => app.go('ADM19', { f: { ...f, entEv: e.id } }), 'pri')],
        }),
      ];
  }
  if (route === 'ADM07') {
    const ps = db.promoters.filter(p => !f.promQ || norm(p.name + ' ' + p.code).includes(norm(f.promQ)));
    ap.sub = 'O código do promoter vincula a venda a quem indicou. Não dá desconto e não calcula comissão.';
    ap.actions = [B2('Cadastrar promoter', () => app.openProm(null), 'pri')];
    ap.filters = app.filt({ search: { key: 'promQ', ph: 'Nome ou código' } });
    const rows = s.v.emptyProm
      ? []
      : ps.map(p => {
          const po = paid.filter(o => o.promoterId === p.id);
          return {
            onClick: () => app.go('ADM09', { prom: p.id }),
            cells: [
              { t: p.name, strong: true },
              { t: p.code, mono: true, strong: true },
              { t: p.phone },
              { t: po.reduce((a, o) => a + app.units(o), 0), sub: po.length + ' pedidos' },
              { k: 'b', badge: p.active ? bd('Ativo', 'ok') : bd('Inativo', 'neu') },
              {
                k: 'a',
                acts: [
                  { label: 'Editar', onClick: () => app.openProm(p.id) },
                  { label: p.active ? 'Desativar' : 'Ativar', onClick: () => app.toggleProm(p), danger: p.active },
                ],
              },
            ],
          };
        });
    ap.blocks = [
      app.tbl(
        'proms',
        '',
        [
          { label: 'Nome', w: '1.4fr' },
          { label: 'Código', w: '1fr' },
          { label: 'Telefone', w: '1.1fr' },
          { label: 'Ingressos atribuídos', w: '1fr', align: 'right' },
          { label: 'Situação', w: '.8fr' },
          { label: '', w: '1.3fr', align: 'right' },
        ],
        rows,
        {
          minW: '860px',
          empty: {
            title: s.v.emptyProm ? 'Nenhum promoter cadastrado' : 'Nenhum promoter encontrado',
            text: 'Cadastre um promoter para rastrear vendas por código.',
            act: { label: 'Cadastrar promoter', onClick: () => app.openProm(null) },
          },
        },
      ),
    ];
  }
  if (route === 'ADM09') {
    const p = db.promoters.find(x => x.id === s.prom);
    if (!p) return { ap };
    const po = paid
      .filter(o => o.promoterId === p.id && (f.prEv === 'todos' || o.eventId === f.prEv) && app.inR(o.paidAt!, f.prPer))
      .sort((a, b) => b.paidAt! - a.paidAt!);
    ap.back = { show: true, label: 'Promoters', onClick: () => app.go('ADM07') };
    ap.eyebrow = 'Código ' + p.code;
    ap.title = p.name;
    ap.badges = [p.active ? bd('Ativo', 'ok') : bd('Inativo', 'neu')];
    ap.sub = p.phone;
    ap.actions = [
      B2('Editar', () => app.openProm(p.id)),
      B2('Exportar', () =>
        app.openExport(
          'Vendas atribuídas a ' + p.code,
          [app.evOpts().find(o => o.v === f.prEv)!.l, PERIODS.find(x => x.v === f.prPer)!.l],
          { base: 'promoter-' + p.code.toLowerCase() },
        ),
      ),
    ];
    ap.filters = app.filt({
      selects: [app.fsel('Evento', 'prEv', app.evOpts()), app.fsel('Período', 'prPer', PERIODS)],
      defaults: { prEv: 'todos', prPer: 'tudo' },
    });
    ap.blocks = [
      app.kpis([
        ['Ingressos atribuídos', po.reduce((a, o) => a + app.units(o), 0), 'Unidades em pedidos pagos com o código.'],
        [
          'Valor das vendas',
          brl(po.reduce((a, o) => a + o.total, 0)),
          'Soma dos pedidos pagos. Sem cálculo de comissão.',
        ],
        ['Pedidos', po.length, ''],
      ]),
      app.tbl(
        'prom-o',
        'Vendas atribuídas',
        [
          { label: 'Pedido', w: '1fr' },
          { label: 'Aprovado em', w: '1.1fr' },
          { label: 'Evento', w: '1.2fr' },
          { label: 'Comprador', w: '1.3fr' },
          { label: 'Qtd.', w: '.5fr', align: 'right' },
          { label: 'Valor', w: '.9fr', align: 'right' },
        ],
        po.map(o => ({
          onClick: () => app.go('ADM11', { order: o.id }),
          cells: [
            { t: o.num, mono: true, strong: true },
            { t: fDTs(o.paidAt!) },
            { t: app.ev(o.eventId).name },
            { t: app.cust(o.userId).name },
            { t: app.units(o) },
            { t: brl(o.total), strong: true },
          ],
        })),
        {
          minW: '820px',
          empty: { title: 'Sem vendas no período', text: 'Nenhum pedido pago com este código nos filtros escolhidos.' },
        },
      ),
      app.note(
        'neu',
        'Somente contagem.',
        'Cálculo e pagamento de comissões são feitos fora da plataforma. O promoter não tem acesso a este painel.',
      ),
    ];
  }
  if (route === 'ADM10') {
    const q = norm(f.ordQ),
      os = db.orders
        .filter(
          o =>
            (f.ordEv === 'todos' || o.eventId === f.ordEv) &&
            (f.ordSt === 'todos' || o.status === f.ordSt) &&
            app.inR(o.created, f.ordPer) &&
            (!q || norm(o.num + ' ' + app.cust(o.userId).name + ' ' + app.cust(o.userId).email).includes(q)),
        )
        .sort((a, b) => b.created - a.created);
    ap.alerts = lateAlerts;
    ap.sub = 'Situação do pedido, do pagamento e da emissão aparecem separadas.';
    ap.actions = [
      B2('Exportar', () =>
        app.openExport(
          'Pedidos',
          [
            app.evOpts().find(o => o.v === f.ordEv)!.l,
            f.ordSt === 'todos' ? 'Todos os status' : OST[f.ordSt][0],
            PERIODS.find(x => x.v === f.ordPer)!.l,
          ],
          { base: 'pedidos' },
        ),
      ),
    ];
    ap.filters = app.filt({
      search: { key: 'ordQ', ph: 'Número, nome ou e-mail' },
      selects: [
        app.fsel('Evento', 'ordEv', app.evOpts()),
        app.fsel('Status do pedido', 'ordSt', [
          { v: 'todos', l: 'Todos os status' },
          ...Object.entries(OST).map(([k, v]) => ({ v: k, l: v[0] })),
        ]),
        app.fsel('Período', 'ordPer', PERIODS),
      ],
      defaults: { ordEv: 'todos', ordSt: 'todos', ordPer: 'tudo' },
    });
    ap.blocks = [
      app.tbl(
        'ords',
        '',
        app.orderCols(),
        os.map(o => app.orderRow(o)),
        {
          per: 12,
          minW: '1000px',
          loading: !!s.v.loadOrd,
          error: !!s.v.errOrd,
          retry: () => app.setState({ v: { ...s.v, errOrd: false } }),
          empty: { title: 'Nenhum pedido no período', text: 'Ajuste os filtros para ver outros pedidos.' },
        },
      ),
    ];
    ap.hasDemo = true;
    ap.demo = [
      {
        label: 'Simular carregamento (G01)',
        onClick: () => {
          app.setState({ v: { ...s.v, loadOrd: true } });
          setTimeout(() => app.setState(st2 => ({ v: { ...st2.v, loadOrd: false } })), 1400);
        },
      },
      { label: 'Simular erro de carregamento (G03)', onClick: () => app.setState({ v: { ...s.v, errOrd: true } }) },
    ];
  }
  if (route === 'ADM11') {
    const o = app.ord();
    if (!o) return { ap };
    const c = app.cust(o.userId),
      e = app.ev(o.eventId),
      ks = db.tickets.filter(k => k.orderId === o.id),
      p = o.promoterId ? db.promoters.find(x => x.id === o.promoterId) : null;
    ap.back = { show: true, label: 'Pedidos', onClick: () => app.go('ADM10') };
    ap.eyebrow = 'Pedido ' + o.num;
    ap.title = e.name;
    ap.section = o.num;
    ap.badges = [
      { ...ob(o), label: 'Pedido: ' + ob(o).label },
      { ...pb(o), label: 'Pagamento: ' + pb(o).label },
      { ...app.emis(o), label: 'Emissão: ' + app.emis(o).label },
    ];
    ap.sub = 'Criado em ' + fDT(o.created);
    ap.alerts =
      o.status === 'pago_sem_estoque'
        ? lateAlerts.filter(a => a.title.includes(o.num))
        : o.status === 'contestado'
          ? [
              {
                bg: '#FFF1F2',
                fg: '#9F1239',
                bd: '#FECDD3',
                title: 'Pagamento contestado.',
                text: 'O gateway informou uma contestação (chargeback) e os ingressos foram cancelados automaticamente. Acompanhe a disputa no painel do gateway.',
                hasAct: false,
                act: {},
              },
            ]
          : o.status === 'estornado'
            ? [
                {
                  bg: '#EEF2FF',
                  fg: '#3730A3',
                  bd: '#C7D2FE',
                  title: 'Pagamento estornado.',
                  text:
                    'Estorno informado pelo gateway em ' + fDT(o.refundAt) + '. Ingressos cancelados automaticamente.',
                  hasAct: false,
                  act: {},
                },
              ]
            : [];
    const tlItems = [
      ...o.hist.map(h => ({
        t: h.t,
        l: h.l,
        tone: /aprovado/.test(h.l)
          ? 'ok'
          : /cancel|recus|Sem estoque|Estorno|Contesta/.test(h.l)
            ? 'err'
            : /expir|Prazo/.test(h.l)
              ? 'warn'
              : 'info',
      })),
      ...ks
        .filter(k => k.usedAt)
        .map(k => ({
          t: k.usedAt,
          l: 'Entrada registrada: ' + k.code + ' por ' + app.staffName(k.usedBy) + ' (' + (k.method || 'câmera') + ')',
          tone: 'ok',
        })),
    ]
      .sort((a, b) => a.t! - b.t!)
      .map(i => ({ ...i, t: fDTs(i.t!) }));
    ap.blocks = [
      app.kv(
        'Comprador',
        [
          { k: 'Nome', v: c.name, link: { label: 'Ver comprador', onClick: () => app.go('ADM13', { buyer: c.id }) } },
          { k: 'E-mail', v: c.email },
          { k: 'Telefone', v: c.phone },
          { k: 'CPF', v: maskCPF(c.cpf) },
        ],
        { span: half },
      ),
      app.kv(
        'Pagamento',
        [
          { k: 'Forma', v: o.method === 'pix' ? 'Pix' : 'Cartão de crédito' + (o.card4 ? ' · final ' + o.card4 : '') },
          { k: 'Referência no gateway', v: o.gw.slice(0, 4) + '••••' + o.gw.slice(-4), mono: true },
          { k: 'Aprovado em', v: o.paidAt! ? fDT(o.paidAt!) : 'Não aprovado' },
          { k: 'Tentativas de pagamento', v: String(o.attempts || 1) },
          { k: 'Promoter', v: p ? p.name + ' (' + p.code + ')' : 'Sem código' },
          { k: 'Total', v: brl(o.total) },
        ],
        { span: half },
      ),
      app.tbl(
        'ord-it',
        'Itens',
        [
          { label: 'Tipo', w: '2fr' },
          { label: 'Qtd.', w: '.6fr', align: 'right' },
          { label: 'Preço unitário', w: '1fr', align: 'right' },
          { label: 'Subtotal', w: '1fr', align: 'right' },
        ],
        o.items.map(i => ({
          cells: [
            { t: app.typ(i.typeId).name, strong: true },
            { t: i.qty },
            { t: brl(i.unit) },
            { t: brl(i.qty * i.unit), strong: true },
          ],
        })),
        { all: true, foot: ['Total', String(app.units(o)), '', brl(o.total)], footText: brl(o.total) },
      ),
      app.tbl(
        'ord-tk',
        'Ingressos por unidade',
        [
          { label: 'Código', w: '1.3fr' },
          { label: 'Tipo', w: '1.3fr' },
          { label: 'Status', w: '.9fr' },
          { label: 'Entrada', w: '1.3fr' },
          { label: '', w: '1.4fr', align: 'right' },
        ],
        ks.map(k => ({
          onClick: () => app.setState({ ticket: k.id, drawer: { kind: 'ticket', id: 'ADM15' } }),
          cells: [
            { t: k.code, mono: true, strong: true, sub: 'Emitido em ' + fDTs(k.issued) },
            { t: app.typ(k.typeId).name, sub: k.holder },
            { k: 'b', badge: kb(k) },
            {
              t: k.usedAt ? fDTs(k.usedAt) : k.cancelAt ? 'Cancelado ' + fDTs(k.cancelAt) : '',
              sub: k.usedAt ? app.staffName(k.usedBy) : k.cancelBy || '',
            },
            {
              k: 'a',
              acts: [
                {
                  label: 'Detalhes',
                  onClick: () => app.setState({ ticket: k.id, drawer: { kind: 'ticket', id: 'ADM15' } }),
                },
                ...(k.status === 'valido'
                  ? [{ label: 'Cancelar', danger: true, onClick: () => app.cancelTicket(k) }]
                  : []),
              ],
            },
          ],
        })),
        {
          all: true,
          minW: '820px',
          empty: {
            title: 'Nenhum ingresso emitido',
            text:
              o.status === 'pago_sem_estoque'
                ? 'Não havia estoque quando o pagamento foi aprovado.'
                : 'Ingressos são emitidos somente após a aprovação do pagamento.',
          },
        },
      ),
      app.tl('Linha do tempo', tlItems),
    ];
  }
  if (route === 'ADM12') {
    const e = app.ev(f.buyEv),
      q = norm(f.buyQ),
      os = db.orders.filter(o => o.eventId === f.buyEv);
    const ids = [...new Set(os.map(o => o.userId))]
      .map(id => app.cust(id))
      .filter(c => !q || norm(c.name + ' ' + c.email + ' ' + c.phone).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    ap.sub = 'Compradores com pedidos no evento selecionado.';
    ap.actions = [
      B2('Exportar', () =>
        app.openExport('Compradores · ' + e.name, [e.name, f.buyQ ? 'Busca: ' + f.buyQ : 'Sem busca'], {
          base: 'compradores-' + e.slug,
        }),
      ),
    ];
    ap.filters = app.filt({
      search: { key: 'buyQ', ph: 'Nome, e-mail ou telefone' },
      selects: [app.fsel('Evento', 'buyEv', app.evOpts(false))],
      defaults: {},
    });
    ap.blocks = [
      app.tbl(
        'buyers',
        e.name,
        [
          { label: 'Nome', w: '1.4fr' },
          { label: 'E-mail', w: '1.6fr' },
          { label: 'Telefone', w: '1.1fr' },
          { label: 'Pedidos pagos', w: '.8fr', align: 'right' },
          { label: 'Ingressos', w: '.8fr', align: 'right' },
        ],
        ids.map(c => {
          const mine = os.filter(o => o.userId === c.id);
          return {
            onClick: () => app.go('ADM13', { buyer: c.id }),
            cells: [
              { t: c.name, strong: true },
              { t: c.email },
              { t: c.phone },
              {
                t: mine.filter(o => o.status === 'pago').length,
                sub: mine.length !== mine.filter(o => o.status === 'pago').length ? mine.length + ' no total' : '',
              },
              { t: db.tickets.filter(k => mine.some(o => o.id === k.orderId)).length },
            ],
          };
        }),
        {
          per: 12,
          minW: '860px',
          empty: { title: 'Nenhum comprador encontrado', text: 'Não há compradores com esse filtro neste evento.' },
        },
      ),
    ];
  }
  if (route === 'ADM13') {
    const c = app.cust(s.buyer);
    if (!c) return { ap };
    const os = db.orders.filter(o => o.userId === c.id).sort((a, b) => b.created - a.created),
      ks = db.tickets.filter(k => os.some(o => o.id === k.orderId)),
      au = db.audit.filter(a => a.ent === c.id);
    ap.back = { show: true, label: 'Compradores', onClick: () => app.go('ADM12') };
    ap.title = c.name;
    ap.sub = 'Cliente desde ' + fD(c.created);
    ap.actions = [
      B2('Corrigir e-mail ou CPF', () =>
        app.setState({
          modal: { kind: 'corr', id: 'ADM13 › correção' },
          corr: { email: c.email, cpf: fmtCPF(c.cpf), why: '', err: {} },
        }),
      ),
    ];
    ap.blocks = [
      app.kv('Dados', [
        { k: 'Nome', v: c.name },
        { k: 'E-mail', v: c.email },
        {
          k: 'CPF',
          v: s.reveal ? fmtCPF(c.cpf) : maskCPF(c.cpf),
          link: {
            label: s.reveal ? 'Ocultar' : 'Mostrar completo',
            onClick: () => app.setState({ reveal: !s.reveal }),
          },
        },
        { k: 'Telefone', v: c.phone },
      ]),
      app.tbl(
        'b-ord',
        'Pedidos',
        app.orderCols(),
        os.map(o => app.orderRow(o)),
        { all: true, minW: '900px', empty: { title: 'Sem pedidos', text: '' } },
      ),
      app.tbl(
        'b-tk',
        'Ingressos',
        [
          { label: 'Código', w: '1.2fr' },
          { label: 'Evento', w: '1.2fr' },
          { label: 'Tipo', w: '1.2fr' },
          { label: 'Status', w: '.8fr' },
        ],
        ks.map(k => ({
          onClick: () => app.setState({ ticket: k.id, drawer: { kind: 'ticket', id: 'ADM15' } }),
          cells: [
            { t: k.code, mono: true, strong: true },
            { t: app.ev(k.eventId).name },
            { t: app.typ(k.typeId).name },
            { k: 'b', badge: kb(k) },
          ],
        })),
        { all: true, minW: '640px', empty: { title: 'Sem ingressos', text: '' } },
      ),
      app.tl(
        'Correções registradas',
        au.length
          ? au.map(a => ({ t: fDTs(a.t) + ' · ' + a.by, l: a.l, tone: 'info' }))
          : [{ t: '', l: 'Nenhuma correção registrada.', tone: 'neu' }],
      ),
      app.note(
        'neu',
        'Histórico preservado.',
        'Contas com pedidos não são excluídas por aqui; correções mantêm o histórico e ficam registradas.',
      ),
    ];
  }
  if (route === 'ADM14') {
    const e = app.ev(f.tkEv),
      q = norm(f.tkQ),
      tsE = typeRowsFor(e);
    const ks = db.tickets
      .filter(
        k =>
          k.eventId === f.tkEv &&
          (f.tkType === 'todos' || k.typeId === f.tkType) &&
          (f.tkSt === 'todos' || k.status === f.tkSt) &&
          (!q || norm(k.code + ' ' + k.holder).includes(q)),
      )
      .sort((a, b) => b.issued - a.issued);
    ap.sub = 'Um registro por unidade emitida. Use a exportação como lista de contingência antes do evento.';
    ap.actions = [
      B2(
        'Exportar lista',
        () =>
          app.openExport(
            'Ingressos · ' + e.name,
            [
              e.name,
              f.tkType === 'todos' ? 'Todos os tipos' : app.typ(f.tkType).name,
              f.tkSt === 'todos' ? 'Todos os status' : KST[f.tkSt][0],
            ],
            { pdf: true, base: 'ingressos-' + e.slug },
          ),
        'pri',
      ),
    ];
    ap.filters = app.filt({
      search: { key: 'tkQ', ph: 'Código ou nome do comprador' },
      selects: [
        app.fsel('Evento', 'tkEv', app.evOpts(false)),
        app.fsel('Tipo', 'tkType', [{ v: 'todos', l: 'Todos os tipos' }, ...tsE.map(t => ({ v: t.id, l: t.name }))]),
        app.fsel('Status', 'tkSt', [
          { v: 'todos', l: 'Todos os status' },
          ...Object.entries(KST).map(([k, v]) => ({ v: k, l: v[0] })),
        ]),
      ],
      defaults: { tkType: 'todos', tkSt: 'todos' },
    });
    ap.blocks = [
      app.tbl(
        'tks',
        ks.length + ' ingressos',
        [
          { label: 'Código', w: '1.2fr' },
          { label: 'Tipo', w: '1.3fr' },
          { label: 'Comprador', w: '1.3fr' },
          { label: 'Status', w: '.8fr' },
          { label: 'Emitido em', w: '1.1fr' },
          { label: 'Entrada', w: '1.2fr' },
        ],
        ks.map(k => ({
          onClick: () => app.setState({ ticket: k.id, drawer: { kind: 'ticket', id: 'ADM15' } }),
          cells: [
            { t: k.code, mono: true, strong: true },
            { t: app.typ(k.typeId).name },
            { t: k.holder, sub: app.ord(k.orderId).num },
            { k: 'b', badge: kb(k) },
            { t: fDTs(k.issued) },
            { t: k.usedAt ? fDTs(k.usedAt) : '', sub: k.usedAt ? app.staffName(k.usedBy) : '' },
          ],
        })),
        {
          per: 12,
          minW: '980px',
          empty: { title: 'Nenhum ingresso encontrado', text: 'Ajuste os filtros ou escolha outro evento.' },
        },
      ),
    ];
  }
  if (route === 'ADM16') {
    const po = paid.filter(o => (f.repEv === 'todos' || o.eventId === f.repEv) && app.inR(o.paidAt!, f.repPer));
    const ref = db.orders.filter(
      o =>
        ['estornado', 'contestado'].includes(o.status) &&
        (f.repEv === 'todos' || o.eventId === f.repEv) &&
        app.inR(o.paidAt!, f.repPer),
    );
    const typeF = i => f.repType === 'todos' || i.typeId === f.repType;
    const items = po.flatMap(o => o.items.filter(typeF).map(i => ({ ...i, o })));
    const byType: Record<string, any> = {};
    items.forEach(i => {
      const k = i.typeId;
      byType[k] = byType[k] || { q: 0, v: 0 };
      byType[k].q += i.qty;
      byType[k].v += i.qty * i.unit;
    });
    const totQ = items.reduce((a, i) => a + i.qty, 0),
      totV = items.reduce((a, i) => a + i.qty * i.unit, 0);
    const [r0, r1] = app.range(f.repPer),
      end = Math.min(r1, app.range('hoje')[1]),
      startD = r0 === 0 ? end - 30 * DAY : r0,
      days: Loose[] = [];
    for (let d = startD; d < end && days.length < 31; d += DAY) days.push(d);
    const tOpts = [
      { v: 'todos', l: 'Todos os tipos' },
      ...(f.repEv === 'todos' ? [] : typeRowsFor(app.ev(f.repEv)).map(t => ({ v: t.id, l: t.name }))),
    ];
    ap.sub = 'Base: pedidos com status Pago, pela data de aprovação do pagamento.';
    ap.actions = [
      B2('Exportar', () =>
        app.openExport(
          'Relatório de vendas',
          [
            app.evOpts().find(o => o.v === f.repEv)!.l,
            tOpts.find(o => o.v === f.repType) ? tOpts.find(o => o.v === f.repType)!.l : 'Todos os tipos',
            PERIODS.find(x => x.v === f.repPer)!.l,
          ],
          { base: 'relatorio-vendas' },
        ),
      ),
    ];
    ap.filters = app.filt({
      selects: [
        app.fsel('Evento', 'repEv', app.evOpts()),
        app.fsel('Tipo de ingresso', 'repType', tOpts),
        app.fsel('Período', 'repPer', PERIODS),
      ],
      defaults: { repEv: 'todos', repType: 'todos', repPer: 'mes' },
    });
    ap.blocks = [
      app.kpis([
        ['Valor vendido', brl(totV), 'Soma dos itens em pedidos pagos.'],
        ['Ingressos vendidos', totQ, 'Unidades em pedidos pagos.'],
        ['Pedidos pagos', new Set(items.map(i => i.o.id)).size, ''],
        [
          'Estornados ou contestados',
          brl(ref.reduce((a, o) => a + o.total, 0)),
          ref.length + ' pedidos. Fora do valor vendido.',
          '#3730A3',
        ],
      ]),
      app.chart(
        'Vendas por dia',
        days.map(d => {
          const v = items
            .filter(i => i.o.paidAt! >= d && i.o.paidAt! < d + DAY)
            .reduce((a, i) => a + i.qty * i.unit, 0);
          return { v, label: fD(d).slice(0, 5), tip: brl(v) };
        }),
        'Valor por dia de aprovação.',
      ),
      app.tbl(
        'rep',
        'Por evento e tipo',
        [
          { label: 'Evento', w: '1.3fr' },
          { label: 'Tipo', w: '1.4fr' },
          { label: 'Preço', w: '.8fr', align: 'right' },
          { label: 'Unidades', w: '.8fr', align: 'right' },
          { label: 'Valor', w: '1fr', align: 'right' },
        ],
        Object.entries(byType)
          .sort((a, b) => b[1].v - a[1].v)
          .map(([tid, x]) => {
            const t = app.typ(tid);
            return {
              cells: [
                { t: app.ev(t.eventId).name },
                { t: t.name, strong: true },
                { t: brl(t.price) },
                { t: x.q },
                { t: brl(x.v), strong: true },
              ],
            };
          }),
        {
          all: true,
          minW: '760px',
          foot: ['Total', '', '', String(totQ), brl(totV)],
          footText: totQ + ' ingressos · ' + brl(totV),
          empty: { title: 'Sem vendas no período', text: 'Nenhum pedido pago corresponde aos filtros.' },
        },
      ),
      app.note(
        'neu',
        'Como os totais são calculados.',
        'O valor vendido soma os pedidos com pagamento aprovado e status Pago. Pedidos estornados ou contestados saem do total e aparecem no indicador separado. Ingressos cancelados pela PartyX sem estorno registrado continuam no pedido pago. Este relatório não é a base da taxa contratual: veja Relatórios › Taxa mensal.',
      ),
    ];
  }
  if (route === 'ADM17') {
    const po = paid.filter(o => (f.rkEv === 'todos' || o.eventId === f.rkEv) && app.inR(o.paidAt!, f.rkPer));
    const rows = db.promoters
      .map(p => {
        const mine = po.filter(o => o.promoterId === p.id);
        return {
          p,
          q: mine.reduce((a, o) => a + app.units(o), 0),
          v: mine.reduce((a, o) => a + o.total, 0),
          n: mine.length,
        };
      })
      .sort((a, b) => (f.rkMetric === 'qtd' ? b.q - a.q || b.v - a.v : b.v - a.v || b.q - a.q));
    const none = po.filter(o => !o.promoterId),
      mx = Math.max(1, ...rows.map(r => (f.rkMetric === 'qtd' ? r.q : r.v)));
    ap.sub =
      f.rkMetric === 'qtd'
        ? 'Ordenado por quantidade de ingressos, do maior para o menor. Empate: maior valor.'
        : 'Ordenado por valor atribuído, do maior para o menor. Empate: mais ingressos.';
    ap.actions = [
      B2('Exportar', () =>
        app.openExport(
          'Ranking de promoters',
          [app.evOpts().find(o => o.v === f.rkEv)!.l, PERIODS.find(x => x.v === f.rkPer)!.l],
          { base: 'ranking-promoters' },
        ),
      ),
    ];
    ap.filters = app.filt({
      selects: [
        app.fsel('Evento', 'rkEv', app.evOpts()),
        app.fsel('Período', 'rkPer', PERIODS),
        app.fsel('Ordenar por', 'rkMetric', [
          { v: 'qtd', l: 'Quantidade de ingressos' },
          { v: 'valor', l: 'Valor atribuído' },
        ]),
      ],
      defaults: { rkEv: 'todos', rkPer: 'tudo', rkMetric: 'qtd' },
    });
    ap.blocks = [
      app.tbl(
        'rank',
        'Ranking',
        [
          { label: '#', w: '.4fr' },
          { label: 'Promoter', w: '1.4fr' },
          { label: 'Participação', w: '1.6fr' },
          { label: 'Ingressos', w: '.8fr', align: 'right' },
          { label: 'Valor atribuído', w: '1fr', align: 'right' },
          { label: 'Pedidos', w: '.7fr', align: 'right' },
        ],
        rows.map((r, i) => ({
          onClick: () => app.go('ADM09', { prom: r.p.id, f: { ...f, prEv: f.rkEv, prPer: f.rkPer } }),
          cells: [
            { t: i + 1 + 'º', strong: true },
            { t: r.p.name, strong: true, sub: r.p.code + (r.p.active ? '' : ' · inativo') },
            { k: 'bar', w: ((f.rkMetric === 'qtd' ? r.q : r.v) / mx) * 100 + '%', t: '' },
            { t: r.q, strong: f.rkMetric === 'qtd' },
            { t: brl(r.v), strong: f.rkMetric === 'valor' },
            { t: r.n },
          ],
        })),
        { all: true, minW: '820px' },
      ),
      app.note(
        'neu',
        'Vendas sem código de promoter:',
        none.reduce((a, o) => a + app.units(o), 0) +
          ' ingressos · ' +
          brl(none.reduce((a, o) => a + o.total, 0)) +
          '. Fora do ranking. Base: pedidos pagos. Sem cálculo ou pagamento de comissão.',
      ),
    ];
  }
  if (route === 'ADM18') {
    const [y, m] = f.txMonth.split('-').map(Number),
      m0 = T(y, m, 1),
      m1 = T(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);
    const ords = db.orders.filter(o => o.paidAt! && o.paidAt! >= m0 && o.paidAt! < m1),
      ks = db.tickets.filter(k => ords.some(o => o.id === k.orderId));
    const cur = k => {
      const o = app.ord(k.orderId);
      return o.status === 'estornado'
        ? 'Cancelado (estorno)'
        : o.status === 'contestado'
          ? 'Cancelado (contestação)'
          : KST[k.status][0];
    };
    const grp: Record<string, any> = {};
    ks.forEach(k => {
      const c = cur(k);
      grp[c] = (grp[c] || 0) + 1;
    });
    const byEv: Record<string, any> = {};
    ks.forEach(k => {
      byEv[k.eventId] = (byEv[k.eventId] || 0) + 1;
    });
    const noStock = ords.filter(o => o.status === 'pago_sem_estoque');
    ap.sub = 'Unidades de ingresso cuja aprovação de pagamento ocorreu no mês escolhido.';
    ap.actions = [
      B2('Exportar', () =>
        app.openExport('Taxa mensal · ' + MOL[m - 1] + ' de ' + y, [MOL[m - 1] + ' de ' + y, ks.length + ' unidades'], {
          base: 'taxa-' + f.txMonth,
        }),
      ),
    ];
    ap.filters = app.filt({
      selects: [
        app.fsel('Mês de aprovação', 'txMonth', [
          { v: '2026-09', l: 'Setembro de 2026' },
          { v: '2026-10', l: 'Outubro de 2026' },
        ]),
      ],
      defaults: {},
    });
    ap.blocks = [
      app.note(
        'info',
        'Ingressos com pagamento aprovado continuam na apuração da taxa mesmo após cancelamento, reembolso ou estorno.',
        '',
      ),
      app.kpis([
        ['Ingressos apurados', ks.length, 'Unidades, não pedidos.'],
        ['Taxa por ingresso', 'R$ 1,00', 'Cláusula 6ª do contrato.'],
        ['Valor da taxa no mês', brl(ks.length * 100), ks.length + ' × R$ 1,00'],
        [
          'Pedidos de origem',
          ords.filter(o => o.status !== 'pago_sem_estoque').length,
          'Referência. Não entra no cálculo.',
        ],
      ]),
      app.prog(
        'Situação atual das unidades apuradas',
        Object.entries(grp).map(([k, v]) => ({
          label: k,
          right: v + ' unidades',
          segs: [
            {
              w: (v / Math.max(1, ks.length)) * 100 + '%',
              c: /Cancel/.test(k) ? '#DC2626' : k === 'Utilizado' ? '#5B5B6E' : '#7C3AED',
            },
          ],
        })),
        [{ label: 'Todas as situações contam na taxa', c: '#7C3AED' }],
        { span: half },
      ),
      app.tbl(
        'tx-ev',
        'Por evento',
        [
          { label: 'Evento', w: '2fr' },
          { label: 'Unidades', w: '1fr', align: 'right' },
          { label: 'Taxa', w: '1fr', align: 'right' },
        ],
        Object.entries(byEv).map(([id, q]) => ({
          cells: [{ t: app.ev(id).name, strong: true }, { t: q }, { t: brl(q * 100), strong: true }],
        })),
        {
          all: true,
          span: half,
          foot: ['Total', String(ks.length), brl(ks.length * 100)],
          footText: ks.length + ' · ' + brl(ks.length * 100),
          empty: { title: 'Nenhuma unidade no mês', text: '' },
        },
      ),
      app.tbl(
        'tx-d',
        'Detalhe por unidade',
        [
          { label: 'Código', w: '1.2fr' },
          { label: 'Pedido', w: '1fr' },
          { label: 'Evento', w: '1.2fr' },
          { label: 'Pagamento aprovado em', w: '1.3fr' },
          { label: 'Situação atual', w: '1.3fr' },
        ],
        ks
          .sort((a, b) => app.ord(a.orderId).paidAt! - app.ord(b.orderId).paidAt!)
          .map(k => ({
            cells: [
              { t: k.code, mono: true },
              { t: app.ord(k.orderId).num, mono: true },
              { t: app.ev(k.eventId).name },
              { t: fDTs(app.ord(k.orderId).paidAt) },
              { t: cur(k) },
            ],
          })),
        { per: 12, minW: '900px' },
      ),
      app.note(
        'neu',
        'Regras de apuração.',
        'Cada ingresso emitido conta uma vez, pelo identificador único da unidade; confirmações repetidas do gateway não criam unidades novas. ' +
          (noStock.length
            ? noStock.length +
              ' pagamento(s) aprovado(s) sem estoque neste mês não geraram ingresso e não entram na contagem (premissa a confirmar com a PartyX). '
            : '') +
          'Cobrança da mensalidade e emissão do boleto acontecem fora do sistema.',
      ),
    ];
  }
  if (route === 'ADM19') {
    const e = app.ev(f.entEv),
      ts = typeRowsFor(e),
      cis = db.checkins.filter(c => c.eventId === e.id).sort((a, b) => b.at - a.at);
    const used = ts.reduce((a, t) => a + st[t.id].used, 0),
      validEm = ts.reduce((a, t) => a + st[t.id].used + st[t.id].valid, 0),
      sold = ts.reduce((a, t) => a + st[t.id].sold, 0),
      refused = cis.filter(c => c.result !== 'valido').length;
    const off = s.v.conn === 'off',
      lastT = off ? s.v.lastOk || n : n;
    ap.title = 'Entradas';
    ap.badges = [off ? bd('Sem conexão', 'err') : bd('Ao vivo', 'ok')];
    ap.sub = off
      ? 'Sem conexão. Exibindo dados de ' + fTs(lastT) + '. Tentando reconectar.'
      : 'Atualização automática a cada 5 segundos · última às ' + fTs(lastT);
    ap.filters = app.filt({
      selects: [
        app.fsel(
          'Evento',
          'entEv',
          app.evOpts(false, x => x.status !== 'rascunho'),
        ),
      ],
      defaults: {},
    });
    if (off)
      ap.alerts = [
        {
          bg: '#FEF2F2',
          fg: '#991B1B',
          bd: '#FECACA',
          title: 'Conexão perdida.',
          text: 'Os números abaixo podem estar desatualizados. A portaria continua dependendo de conexão para validar.',
          hasAct: true,
          act: { label: 'Tentar agora', onClick: () => app.setState({ v: { ...s.v, conn: 'on' } }) },
        },
      ];
    ap.blocks = [
      app.kpis(
        [
          ['Entradas registradas', used, 'Leituras válidas únicas.', '#15803D'],
          ['Ingressos válidos emitidos', validEm, 'Vendidos menos cancelados.'],
          ['Ainda não entraram', validEm - used, ''],
          ['Ingressos vendidos', sold, 'Inclui ' + (sold - validEm) + ' cancelados.'],
          ['Leituras recusadas', refused, 'Repetidas, inválidas ou de outro evento. Não contam.', '#B91C1C'],
        ],
        '160px',
      ),
      app.prog(
        'Entradas por tipo',
        ts
          .filter(t => st[t.id].sold)
          .map(t => {
            const y = st[t.id],
              tot = y.used + y.valid;
            return {
              label: t.name,
              right: y.used + ' de ' + tot,
              segs: [{ w: (y.used / Math.max(1, tot)) * 100 + '%', c: '#15803D' }],
            };
          }),
        [
          { label: 'Entraram', c: '#15803D' },
          { label: 'Ainda não entraram', c: '#EEEEF3' },
        ],
        { span: half },
      ),
      app.tbl(
        'ent',
        'Registros recentes',
        [
          { label: 'Horário', w: '.8fr' },
          { label: 'Código', w: '1.2fr' },
          { label: 'Resultado', w: '1fr' },
          { label: 'Validador', w: '1fr' },
        ],
        cis.slice(0, 40).map(c => {
          const k = c.ticketId ? app.tkt(c.ticketId) : null;
          return {
            cells: [
              { t: fTs(c.at), strong: true },
              { t: c.code, mono: true, sub: k ? app.typ(k.typeId).name + ' · ' + c.method : c.method },
              {
                k: 'b',
                badge: {
                  valido: bd('Entrada liberada', 'ok'),
                  ja_utilizado: bd('Já utilizado', 'warn'),
                  invalido: bd('Inválido', 'err'),
                  cancelado: bd('Cancelado', 'err'),
                  outro_evento: bd('Outro evento', 'err'),
                }[c.result],
              },
              { t: app.staffName(c.by) },
            ],
          };
        }),
        {
          per: 10,
          span: half,
          empty: { title: 'Nenhuma leitura ainda', text: 'As entradas aparecem aqui assim que a portaria começar.' },
        },
      ),
    ];
    ap.hasDemo = true;
    ap.demo = [
      {
        label: s.v.live === false ? 'Retomar fluxo simulado de entradas' : 'Pausar fluxo simulado de entradas',
        onClick: () => app.setState({ v: { ...s.v, live: s.v.live === false } }),
      },
      {
        label: off ? 'Restaurar conexão' : 'Simular perda de conexão',
        onClick: () => app.setState({ v: { ...s.v, conn: off ? 'on' : 'off', lastOk: n } }),
      },
    ];
  }
  if (route === 'ADM20') {
    const q = norm(f.teamQ),
      us = db.staff.filter(x => !q || norm(x.name + ' ' + x.email).includes(q));
    ap.sub = 'Perfis disponíveis: Administrador (painel completo e portaria) e Validador (somente portaria).';
    ap.actions = [B2('Novo usuário', () => app.openStaff(null), 'pri')];
    ap.filters = app.filt({ search: { key: 'teamQ', ph: 'Nome ou e-mail' } });
    const rows = s.v.emptyTeam
      ? []
      : us.map(x => ({
          onClick: () => app.openStaff(x.id),
          cells: [
            { t: x.name + (x.id === s.uid ? ' (você)' : ''), strong: true, sub: x.email },
            { k: 'b', badge: x.role === 'admin' ? bd('Administrador', 'info') : bd('Validador', 'neu') },
            {
              k: 'b',
              badge: x.active
                ? x.temp
                  ? bd('Aguardando 1º acesso', 'warn')
                  : bd('Ativo', 'ok')
                : bd('Inativo', 'err'),
            },
            { t: x.last ? fDTs(x.last) : 'Nunca' },
            {
              k: 'a',
              acts: [
                { label: 'Editar', onClick: () => app.openStaff(x.id) },
                ...(x.id !== s.uid
                  ? [{ label: x.active ? 'Desativar' : 'Ativar', danger: x.active, onClick: () => app.toggleStaff(x) }]
                  : []),
              ],
            },
          ],
        }));
    ap.blocks = [
      app.tbl(
        'team',
        '',
        [
          { label: 'Usuário', w: '1.8fr' },
          { label: 'Perfil', w: '1fr' },
          { label: 'Situação', w: '1.1fr' },
          { label: 'Último acesso', w: '1fr' },
          { label: '', w: '1.2fr', align: 'right' },
        ],
        rows,
        {
          all: true,
          minW: '860px',
          empty: {
            title: 'Nenhum outro usuário na equipe',
            text: 'Cadastre administradores e validadores para dividir o trabalho.',
            act: { label: 'Novo usuário', onClick: () => app.openStaff(null) },
          },
        },
      ),
    ];
  }
  if (route === 'ADM24') {
    ap.title = 'Minha conta';
    ap.sub = 'Dados de acesso ao painel.';
    ap.actions = [
      B2('Alterar senha', () =>
        app.setState({ modal: { kind: 'pw', id: 'ADM24 › senha' }, pwf: { cur: '', nw: '', nw2: '', err: {} } }),
      ),
      B2('Sair', () => app.logout(), 'dan'),
    ];
    ap.blocks = [
      app.kv('Acesso', [
        { k: 'Nome', v: u.name },
        { k: 'E-mail', v: u.email },
        { k: 'Perfil', v: 'Administrador' },
        { k: 'Último acesso', v: u.last ? fDT(u.last) : '' },
      ]),
      app.note(
        'neu',
        'Credenciais de gateway, hospedagem e outros serviços',
        'não são gerenciadas por esta interface.',
      ),
    ];
  }
  return {
    ap,
    admNav: app.admNav(route),
    admUser: u ? u.name + ' · Administrador' : '',
    admLogout: () => app.logout(),
    openAdmMenu: () => app.setState({ drawer: { kind: 'admmenu' } }),
    notDesk: !desk,
    sideH: ((s.winH || window.innerHeight) - 52) / (s.frame === 'auto' ? 1 : Math.min(1, (s.winW - 16) / fw)) + 'px',
    formCols: mob ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
  };
}
