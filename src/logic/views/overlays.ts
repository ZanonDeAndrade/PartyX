import { fD, fDTs, norm, maskCPF, mCPF, mPhone } from '../../lib/format';
import { pb, kb } from '../../lib/badges';
import { indexGroups, notesFor } from '../demo';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function overV(app: PartyXLogic, { s, db, route, mob, role, u }: ViewCtx): Loose {
  const B2 = (label, onClick?, kind?) => app.btn(label, onClick, kind),
    close = () => app.setState({ drawer: null, modal: null });
  const out: Loose = {
    dr: { show: false },
    md: { show: false },
    tst: { show: false },
    idx: { show: false },
    nt: { show: false },
    formCols: mob ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
  };
  const d = s.drawer;
  if (d) {
    const dr: Loose = {
      show: true,
      side: 'flex-end',
      bg: '#fff',
      fg: '#0B0B10',
      line: '#E4E4EC',
      eyebrow: '',
      title: '',
      sub: '',
      isMenu: false,
      items: [],
      blocks: [],
      hasActions: false,
      actions: [],
      close,
      stop: e => e.stopPropagation(),
      btnFlex: mob ? '1 1 100%' : '0 0 auto',
    };
    if (d.kind === 'pubmenu' || d.kind === 'admmenu') {
      Object.assign(dr, {
        side: 'flex-start',
        bg: '#0B0B10',
        fg: '#fff',
        line: '#1E1E2A',
        title: d.kind === 'admmenu' ? 'PartyX Admin' : 'Menu',
        isMenu: true,
      });
      const it = (label, fn, act?, sub?) => ({
        label,
        onClick: () => {
          app.setState({ drawer: null });
          fn();
        },
        bg: act ? 'rgba(124,58,237,.22)' : 'transparent',
        fw: act ? 800 : 500,
        fs: sub ? '14px' : '16px',
        pad: sub ? '28px' : '12px',
      });
      if (d.kind === 'pubmenu')
        dr.items = [
          it('Eventos', () => app.go('P02'), route === 'P02'),
          ...(role === 'cliente'
            ? [
                it('Meus ingressos', () => app.go('U01'), route === 'U01'),
                it('Minhas compras', () => app.go('U02'), route === 'U02'),
                it('Minha conta', () => app.go('U06'), route === 'U06'),
                it('Sair', () => app.logout()),
              ]
            : [
                it('Entrar', () => app.go('A01'), route === 'A01'),
                it('Criar conta', () => app.go('A02'), route === 'A02'),
              ]),
          it('Termos de Uso', () => app.go('P04'), false, true),
          it('Política de Privacidade', () => app.go('P05'), false, true),
          it('Cancelamento e reembolso', () => app.go('P06'), false, true),
        ];
      else
        dr.items = [
          ...app
            .admNav(route)
            .flatMap(n => [
              it(n.label, n.onClick, n.bg !== 'transparent'),
              ...n.sub.map(x => it(x.label, x.onClick, x.fw === 700, true)),
            ]),
          it('Validar ingressos', () => app.go('V01')),
          it('Minha conta', () => app.go('ADM24'), route === 'ADM24'),
          it('Sair', () => app.logout()),
        ];
    }
    if (d.kind === 'filters') {
      dr.title = 'Filtros';
      dr.eyebrow = 'G07';
      dr.blocks = [
        app.blk({
          isForm: true,
          fields: d.sels.map((k, i) => ({
            ...app.fld('f', k, d.labels[i], 'select', { options: d.opts[i] }),
            onChange: e => app.setF(k, e.target.value),
          })),
        }),
      ];
      dr.hasActions = true;
      dr.actions = [B2('Ver resultados', () => app.setState({ drawer: null }), 'pri')];
    }
    if (d.kind === 'type') {
      const f = s.tf || {},
        e = app.ev(f.eventId),
        x = f.id ? app.stats()[f.id] : null;
      Object.assign(dr, {
        eyebrow: 'ADM06 · ' + (e ? e.name : ''),
        title: f.id ? 'Editar tipo de ingresso' : 'Novo tipo de ingresso',
        sub: x
          ? x.sold + ' vendidos e ' + x.res + ' em reserva neste momento.'
          : 'Defina nome, valor, quantidade e período de vendas.',
        hasActions: true,
        actions: [B2('Cancelar', close), B2('Salvar tipo', () => app.saveType(), 'pri')],
        blocks: [
          app.blk({
            isForm: true,
            fields: [
              app.fld('tf', 'name', 'Nome', 'text', {
                ph: 'Ex.: Pista 2º lote, VIP, Pista Meia-entrada',
                hint: 'Lotes são tipos com nome e período próprios; não há virada automática.',
              }),
              app.fld('tf', 'price', 'Valor', 'money', { prefix: 'R$', ph: '0,00' }),
              app.fld('tf', 'total', 'Quantidade total', 'number', {
                hint: x ? 'Mínimo permitido: ' + (x.sold + x.res) + '.' : '',
              }),
              app.fld('tf', 'sd', 'Início das vendas (data)', 'date'),
              app.fld('tf', 'st', 'Início das vendas (hora)', 'time'),
              app.fld('tf', 'ed', 'Fim das vendas (data)', 'date'),
              app.fld('tf', 'et', 'Fim das vendas (hora)', 'time'),
              app.fld('tf', 'active', 'Situação', 'toggle', {
                onLabel: 'Ativo: vende dentro do período',
                offLabel: 'Inativo: aparece como indisponível',
              }),
            ],
          }),
          app.note(
            'neu',
            'Meia-entrada.',
            'Nomes com “Meia” mostram ao comprador o aviso de conferência do documento na portaria. Não há envio de comprovante.',
          ),
        ],
      });
    }
    if (d.kind === 'prom') {
      const f = s.pf || {};
      Object.assign(dr, {
        eyebrow: 'ADM08',
        title: f.id ? 'Editar promoter' : 'Cadastrar promoter',
        sub: 'O código rastreia vendas indicadas. Ele não oferece desconto ao comprador.',
        hasActions: true,
        actions: [B2('Cancelar', close), B2('Salvar promoter', () => app.saveProm(), 'pri')],
        blocks: [
          app.blk({
            isForm: true,
            fields: [
              app.fld('pf', 'name', 'Nome'),
              app.fld('pf', 'phone', 'Telefone', 'tel', { mask: mPhone, ph: '(55) 99999-9999' }),
              app.fld('pf', 'code', 'Código exclusivo', 'text', {
                mask: v => v.toUpperCase(),
                mono: true,
                ph: 'Ex.: DUDA',
                hint: 'De 3 a 20 letras sem acento ou números. Precisa ser único.',
              }),
              app.fld('pf', 'active', 'Situação', 'toggle', {
                onLabel: 'Ativo: aceito no checkout',
                offLabel: 'Inativo: recusado no checkout',
              }),
            ],
          }),
        ],
      });
    }
    if (d.kind === 'staff') {
      const f = s.sf || {};
      Object.assign(dr, {
        eyebrow: 'ADM21',
        title: f.id ? 'Editar usuário' : 'Novo usuário da equipe',
        sub: 'Administrador acessa o painel e a portaria. Validador acessa somente a portaria.',
        hasActions: true,
        actions: [B2('Cancelar', close), B2('Salvar', () => app.saveStaff(false), 'pri')],
        blocks: [
          app.blk({
            isForm: true,
            fields: [
              app.fld('sf', 'name', 'Nome completo'),
              app.fld('sf', 'email', 'E-mail de acesso', 'email'),
              app.fld('sf', 'role', 'Perfil', 'select', {
                options: [
                  { v: 'validador', l: 'Validador' },
                  { v: 'admin', l: 'Administrador' },
                ],
              }),
              app.fld('sf', 'active', 'Situação', 'toggle', {
                onLabel: 'Ativo: pode entrar',
                offLabel: 'Inativo: não pode entrar',
              }),
              ...(f.id
                ? []
                : [
                    app.fld('sf', 'temp', 'Senha temporária', 'text', {
                      mono: true,
                      hint: 'Informe à pessoa por um canal seguro. A troca é obrigatória no primeiro acesso.',
                    }),
                  ]),
            ],
          }),
          ...(!f.id ? [app.note('neu', '', 'Use o botão abaixo para gerar uma senha temporária aleatória.')] : []),
          ...(f.id && !f.active
            ? [app.note('warn', 'Usuário inativo não consegue entrar.', 'Ao salvar, sessões abertas são encerradas.')]
            : []),
        ],
      });
      if (!f.id)
        dr.actions = [
          B2('Gerar senha temporária', () =>
            app.setForm('sf', {
              temp: 'Px-' + Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6),
            }),
          ),
          ...dr.actions,
        ];
    }
    if (d.kind === 'ticket') {
      const k = app.tkt();
      if (k) {
        const o = app.ord(k.orderId),
          e = app.ev(k.eventId),
          c = app.cust(o.userId);
        const hist = [
          { t: fDTs(k.issued), l: 'Emitido no pedido ' + o.num, tone: 'info' },
          ...(k.usedAt
            ? [
                {
                  t: fDTs(k.usedAt),
                  l: 'Entrada registrada por ' + app.staffName(k.usedBy) + ' (' + (k.method || 'câmera') + ')',
                  tone: 'ok',
                },
              ]
            : []),
          ...(k.cancelAt
            ? [{ t: fDTs(k.cancelAt), l: 'Cancelado por ' + k.cancelBy + '. Motivo: ' + k.cancelReason, tone: 'err' }]
            : []),
          ...db.checkins
            .filter(ci => ci.ticketId === k.id && ci.result !== 'valido')
            .map(ci => ({
              t: fDTs(ci.at),
              l:
                'Leitura recusada (' +
                {
                  ja_utilizado: 'já utilizado',
                  cancelado: 'cancelado',
                  outro_evento: 'outro evento',
                  invalido: 'inválido',
                }[ci.result] +
                ') por ' +
                app.staffName(ci.by),
              tone: 'warn',
            })),
        ];
        Object.assign(dr, {
          eyebrow: 'ADM15 · ' + k.code,
          title: app.typ(k.typeId).name,
          sub: e.name + ' · ' + fD(e.start),
          hasActions: true,
          actions: [
            B2('Ver pedido', () => app.go('ADM11', { order: o.id })),
            ...(k.status === 'valido' ? [B2('Cancelar ingresso', () => app.cancelTicket(k), 'danf')] : []),
          ],
          blocks: [
            app.kv('', [
              { k: 'Status', v: '', badge: kb(k) },
              { k: 'Código', v: k.code, mono: true },
              { k: 'Comprador', v: c.name },
              { k: 'CPF', v: maskCPF(c.cpf) },
              { k: 'Pedido', v: o.num, mono: true },
              { k: 'Pagamento', v: pb(o).label },
            ]),
            app.tl('Histórico', hist),
            ...(k.status === 'utilizado'
              ? [app.note('neu', 'Ingresso já utilizado.', 'Não há ação para desfazer entradas.')]
              : []),
          ],
        });
      }
    }
    out.dr = dr;
  }
  const m = s.modal;
  if (m) {
    const md: Loose = {
      show: true,
      maxW: '520px',
      eyebrow: m.id || '',
      title: '',
      text: '',
      hasList: false,
      list: [],
      isShare: false,
      isExport: false,
      hasFields: false,
      fields: [],
      foot: '',
      actions: [],
      closable: true,
      close,
      btnFlex: mob ? '1 1 100%' : '0 0 auto',
    };
    if (m.kind === 'unsaved')
      Object.assign(md, {
        eyebrow: 'G07',
        title: 'Descartar alterações?',
        text: 'Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.',
        actions: [
          B2('Continuar editando', close),
          B2(
            'Descartar e sair',
            () => {
              app.setState({ modal: null, dirty: false });
              m.next();
            },
            'danf',
          ),
        ],
      });
    if (m.kind === 'confirm')
      Object.assign(md, {
        title: m.title,
        text: m.text,
        hasList: !!(m.list && m.list.length),
        list: m.list || [],
        actions: [B2('Voltar', close), B2(m.confirm, m.onConfirm, m.danger ? 'danf' : 'pri')],
      });
    if (m.kind === 'info')
      Object.assign(md, {
        title: m.title,
        text: m.text,
        hasList: !!(m.list && m.list.length),
        list: m.list || [],
        actions: [B2(m.ok || 'Entendi', close, 'pri')],
      });
    if (m.kind === 'legal')
      Object.assign(md, {
        eyebrow: 'P04 / P05',
        title: m.doc,
        text:
          'O texto de ' +
          m.doc +
          ' será fornecido pela PartyX e aparecerá aqui para leitura sem sair do cadastro. O aceite registra versão, data e IP.',
        actions: [B2('Fechar', close, 'pri')],
      });
    if (m.kind === 'share') {
      const e = app.ev();
      const url = 'dominio-partyx/eventos/' + e.slug,
        copy = () => {
          try {
            navigator.clipboard.writeText('https://' + url);
          } catch (x) {}
          app.setState({ modal: null });
          app.toast('Link copiado: ' + url);
        };
      Object.assign(md, {
        eyebrow: 'Compartilhar · E05',
        title: e.name,
        isShare: true,
        c1: e.c1,
        c2: e.c2,
        ogTitle: e.name + ' · ' + fD(e.start) + ' · PartyX',
        ogDesc: e.venue + '. Ingressos online na PartyX.',
        shareBtns: [
          ['WhatsApp', copy],
          ['Facebook', copy],
          ['X', copy],
          ['Copiar link', copy],
        ].map(([label, fn]) => ({
          label,
          onClick: () => {
            if (label !== 'Copiar link') {
              app.setState({ modal: null });
              app.toast('Demonstração: abriria o ' + label + ' com o link ' + url + '.');
            } else (fn as () => void)();
          },
        })),
        foot: 'Título e imagem vêm das tags Open Graph da página do evento (RF-26, CA-13).',
        actions: [B2('Fechar', close)],
      });
    }
    if (m.kind === 'pw')
      Object.assign(md, {
        title: 'Alterar senha',
        hasFields: true,
        fields: app.pwModalFields(),
        actions: [B2('Cancelar', close), B2('Salvar nova senha', () => app.savePw(), 'pri')],
        foot: 'DEMO · senha atual das contas de exemplo: demo1234.',
      });
    if (m.kind === 'corr')
      Object.assign(md, {
        title: 'Corrigir e-mail ou CPF',
        text: 'Somente administradores podem corrigir estes dados. A alteração fica registrada com seu nome, data, valores anteriores e o motivo.',
        hasFields: true,
        fields: [
          app.fld('corr', 'email', 'E-mail', 'email'),
          app.fld('corr', 'cpf', 'CPF', 'text', { mask: mCPF }),
          app.fld('corr', 'why', 'Motivo da correção', 'area', {
            ph: 'Ex.: comprador informou e-mail com erro de digitação',
          }),
        ],
        actions: [B2('Cancelar', close), B2('Salvar correção', () => app.saveCorr(), 'pri')],
      });
    if (m.kind === 'cancel') {
      const k = app.tkt(m.tid);
      Object.assign(md, {
        eyebrow: 'ADM15',
        title: 'Cancelar o ingresso ' + k.code + '?',
        text: 'Confira o que acontece:',
        hasList: true,
        list: [
          'O acesso é invalidado: a portaria passa a recusar este código.',
          'O cliente vê o ingresso como Cancelado em Meus ingressos.',
          'Não há estorno automático. Se houver reembolso, a PartyX faz o estorno no gateway.',
          'A ação fica registrada com seu nome e horário.',
        ],
        hasFields: true,
        fields: [
          {
            ...app.fld('modal', 'reason', 'Motivo', 'select', {
              options: ['Solicitação do comprador', 'Erro operacional', 'Suspeita de fraude', 'Outro'].map(x => ({
                v: x,
                l: x,
              })),
            }),
            onChange: e => app.setState({ modal: { ...m, reason: e.target.value } }),
          },
          ...(m.reason === 'Outro'
            ? [
                {
                  ...app.fld('modal', 'other', 'Descreva o motivo', 'text'),
                  onChange: e => app.setState({ modal: { ...m, other: e.target.value } }),
                },
              ]
            : []),
        ],
        actions: [B2('Voltar', close), B2('Cancelar ingresso', () => app.doCancel(), 'danf')],
      });
    }
    if (m.kind === 'session')
      Object.assign(md, {
        eyebrow: 'G05',
        title: 'Sua sessão expirou',
        text: 'Por segurança, a sessão foi encerrada após um período sem uso. Entre novamente para continuar de onde parou. O que estava na tela foi mantido.',
        hasFields: true,
        fields: [
          { ...app.fld('modal', 'email', 'E-mail', 'ro'), value: u ? u.email : '' },
          {
            ...app.fld('modal', 'pw', 'Senha', 'password'),
            value: m.pw || '',
            err: m.err || '',
            hasErr: !!m.err,
            bd: m.err ? '2px solid #DC2626' : '1px solid #D4D4DE',
            onChange: e => app.setState({ modal: { ...m, pw: e.target.value, err: null } }),
          },
        ],
        closable: false,
        actions: [
          B2('Sair', () => app.logout()),
          B2(
            'Entrar',
            () => {
              if ((m.pw || '') !== (u ? u.pw : '')) {
                app.setState({ modal: { ...m, err: 'Senha incorreta.' } });
                return;
              }
              app.setState({ modal: null });
              app.toast('Sessão renovada.', 'ok');
            },
            'pri',
          ),
        ],
        foot: 'DEMO · senha demo1234.',
      });
    if (m.kind === 'export') {
      const fm = [
        ['csv', 'CSV (UTF-8)', 'Abre no Excel com acentos corretos.'],
        ['xlsx', 'XLSX', 'Planilha do Excel.'],
        ...(m.pdf
          ? [
              [
                'pdf',
                'PDF imprimível de contingência',
                'Código, tipo, comprador e CPF mascarado, para conferência na portaria sem internet.',
              ],
            ]
          : []),
      ];
      Object.assign(md, {
        title: 'Exportar · ' + m.title,
        isExport: true,
        filters: m.filters.join(' · '),
        expIdle: m.st === 'idle',
        expBusy: m.st === 'busy',
        expDone: m.st === 'done',
        expFail: m.st === 'fail',
        fname: m.fname || '',
        at: m.at || '',
        isPdf: m.fmt === 'pdf',
        fail: !!m.fail,
        toggleFail: () => app.setState({ modal: { ...m, fail: !m.fail } }),
        fmts: fm.map(([k, l, t]) => ({
          label: l,
          text: t,
          on: m.fmt === k,
          onClick: () => app.setState({ modal: { ...m, fmt: k } }),
          bd: m.fmt === k ? '#7C3AED' : '#E4E4EC',
          dot: m.fmt === k ? '#7C3AED' : 'transparent',
        })),
        actions:
          m.st === 'done'
            ? [
                B2('Fechar', close),
                B2(
                  'Baixar arquivo',
                  () => {
                    app.setState({ modal: null });
                    app.toast('Download iniciado: ' + m.fname);
                  },
                  'pri',
                ),
              ]
            : m.st === 'fail'
              ? [
                  B2('Fechar', close),
                  B2(
                    'Tentar novamente',
                    () => app.setState({ modal: { ...m, st: 'idle', fail: false } }, () => app.runExport()),
                    'pri',
                  ),
                ]
              : m.st === 'busy'
                ? []
                : [B2('Cancelar', close), B2('Gerar arquivo', () => app.runExport(), 'pri')],
      });
    }
    out.md = md;
  }
  if (s.toast) {
    const t = s.toast;
    out.tst = {
      show: true,
      text: t.text,
      bg: t.tone === 'ok' ? '#14532D' : t.tone === 'err' ? '#991B1B' : '#0B0B10',
      hasAction: !!t.action,
      href: t.action ? t.action.href : '',
      label: t.action ? t.action.label : '',
      close: () => app.setState({ toast: null }),
      bottom:
        mob && (route === 'P03' || route === 'C02' || ['U01', 'U02', 'U03', 'U04', 'U06'].includes(route))
          ? '96px'
          : '20px',
    };
  }
  if (s.index) {
    const q = norm(s.idxQ);
    out.idx = {
      show: true,
      q: s.idxQ,
      onQ: e => app.setState({ idxQ: e.target.value }),
      close: () => app.setState({ index: false }),
      groups: indexGroups(app)
        .map(g => ({
          name: g.name,
          items: g.items
            .filter(i => !q || norm(i.id + ' ' + i.label).includes(q))
            .map(i => ({ ...i, bg: 'transparent' })),
        }))
        .filter(g => g.items.length),
    };
  }
  if (s.notes) {
    const id = app.screenId().split(' ')[0],
      N = notesFor(id);
    out.nt = { show: true, id: app.screenId(), items: N[0], refs: N[1], close: () => app.setState({ notes: false }) };
  }
  return out;
}
