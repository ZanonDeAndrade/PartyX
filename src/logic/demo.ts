import { MIN } from '../lib/constants';
import type { PartyXLogic } from './PartyXLogic';
import type { Loose } from './viewTypes';

export function indexGroups(app: PartyXLogic) {
  const J = (role, route, patch?) => () => app.jump(role, route, patch || {});
  const I = (id, label, fn) => ({ id, label, onClick: fn });
  const lucas = app.state.db.orders.find(o => o.status === 'pago_sem_estoque'),
    cont = app.state.db.orders.find(o => o.status === 'contestado');
  const scanAfter = kinds => () =>
    app.jump('validador', 'V02', {
      g: { ...app.state.g, eventId: 'e1', cam: 'reading', res: null, busy: false, online: true },
      after: () => {
        let t = 0;
        kinds.forEach(k => {
          setTimeout(() => {
            if (app.state.g.res && k !== kinds[0]) app.upG({ res: null, cam: 'reading', cool: 0 });
            app.scan(k);
          }, t);
          t += 900;
        });
      },
    });
  return [
    {
      name: 'DOCUMENTOS DA ENTREGA',
      items: [
        I('DS', 'Fundamentos e componentes', () => {
          window.location.href = '/docs/fundamentos';
        }),
        I('DOC', 'Sitemap, anotações, matriz RF/CA, premissas', () => {
          window.location.href = '/docs';
        }),
        I('E01–E05', 'E-mails, PDF do ingresso e compartilhamento', () => {
          window.location.href = '/docs/emails';
        }),
      ],
    },
    {
      name: 'A · SITE PÚBLICO',
      items: [
        I('P01', 'Página inicial', J(null, 'P01')),
        I('P02', 'Listagem de eventos', J(null, 'P02', { lq: '', lqDate: '' })),
        I('P02', 'Carregando (skeleton)', () => {
          app.jump(null, 'P02');
          setTimeout(() => app.searchTo('', ''), 40);
        }),
        I('P02', 'Nenhum resultado', () => {
          app.jump(null, 'P02');
          setTimeout(() => app.searchTo('carnaval', ''), 40);
        }),
        I('P02', 'Nenhuma venda disponível', J(null, 'P02', { v: { noSales: true } })),
        I(
          'P03',
          'Evento disponível, com tipo esgotado e tipo desativado',
          J(null, 'P03', { ev: 'e1', cart: { eventId: 'e1', q: {} } }),
        ),
        I(
          'C01',
          'Seleção de ingressos com quantidade',
          J(null, 'P03', { ev: 'e1', cart: { eventId: 'e1', q: { t12: 2, t14: 1 } } }),
        ),
        I('P03', 'Vendas ainda não iniciadas', J(null, 'P03', { ev: 'e3', cart: { eventId: 'e3', q: {} } })),
        I('P03', 'Vendas encerradas', J(null, 'P03', { ev: 'e4', cart: { eventId: 'e4', q: {} } })),
        I('P03', 'Evento encerrado por link direto', J(null, 'P03', { ev: 'e6', cart: { eventId: 'e6', q: {} } })),
        I('E05', 'Compartilhar e pré-visualização', J(null, 'P03', { ev: 'e1', modal: { kind: 'share', id: 'E05' } })),
        I('P04', 'Termos de Uso', J(null, 'P04')),
        I('P05', 'Política de Privacidade', J(null, 'P05')),
        I('P06', 'Política de Cancelamento', J(null, 'P06')),
        I('P07', 'Página inexistente', J(null, 'P07')),
        I('P07', 'Evento em rascunho por link', J(null, 'P03', { ev: 'e5', preview: false })),
      ],
    },
    {
      name: 'B · CADASTRO E ACESSO',
      items: [
        I('A01', 'Entrar', J(null, 'A01', { auth: { ...app.state.auth, err: null, returnTo: null } })),
        I(
          'A01',
          'Erro de credenciais',
          J(null, 'A01', {
            auth: { ...app.state.auth, err: 'cred', returnTo: null, email: 'marina.costa@exemplo.com' },
          }),
        ),
        I(
          'A01',
          'Bloqueio por tentativas',
          J(null, 'A01', { auth: { ...app.state.auth, err: 'blocked', until: app.now() + 15 * MIN, returnTo: null } }),
        ),
        I(
          'A01',
          'Conta desativada',
          J(null, 'A01', {
            auth: {
              ...app.state.auth,
              err: 'off',
              offStaff: true,
              returnTo: null,
              email: 'bruno.teixeira@partyx.exemplo',
            },
          }),
        ),
        I(
          'A01',
          'Retorno ao checkout',
          J(null, 'A01', {
            cart: { eventId: 'e1', q: { t12: 2 } },
            auth: { ...app.state.auth, err: null, returnTo: { route: 'C02', patch: {} } },
          }),
        ),
        I(
          'A02',
          'Criar conta',
          J(null, 'A02', { reg: { name: '', email: '', cpf: '', phone: '', pw: '', accept: false, err: {} } }),
        ),
        I('A02', 'Erros de validação', () => {
          app.jump(null, 'A02', {
            reg: {
              name: 'Bianca Moreira',
              email: 'marina.costa@exemplo.com',
              cpf: '123.456.789-00',
              phone: '(55) 9962',
              pw: 'festa',
              accept: false,
              err: {},
            },
          });
          setTimeout(() => app.register(), 60);
        }),
        I(
          'A02',
          'Cadastro concluído',
          J('cliente', 'A02', {
            reg: { name: '', email: '', cpf: '', phone: '', pw: '', accept: false, err: {}, done: true },
          }),
        ),
        I('A03', 'Solicitar recuperação', J(null, 'A03')),
        I(
          'A04',
          'Confirmação neutra',
          J(null, 'A04', { rec: { ...app.state.rec, email: 'marina.costa@exemplo.com' } }),
        ),
        I(
          'A05',
          'Nova senha: link válido',
          J(null, 'A05', { v: { tok: 'valid' }, rec: { ...app.state.rec, used: false, pw: '', pw2: '', err2: {} } }),
        ),
        I('A05', 'Link expirado', J(null, 'A05', { v: { tok: 'expired' }, rec: { ...app.state.rec, used: false } })),
        I('A05', 'Link já utilizado', J(null, 'A05', { v: { tok: 'used' }, rec: { ...app.state.rec, used: false } })),
        I('A06', 'Senha alterada', J(null, 'A06')),
        I('ADM22', 'Primeiro acesso com senha temporária', () => {
          app.setState({ uid: 's5', index: false, first: { pw: '', pw2: '', err: {} } }, () =>
            app.go('ADM22', {}, true),
          );
        }),
      ],
    },
    {
      name: 'C · CHECKOUT E PAGAMENTO',
      items: [
        I('C02', 'Revisão com código do promoter', () => app.ckSetup(null)),
        I('C03', 'Forma de pagamento', () => {
          app.ckSetup(null);
          setTimeout(() => app.go('C03'), 80);
        }),
        I('C04', 'Pix aguardando pagamento', () => app.ckSetup('pix')),
        I('C05', 'Cartão (campos do gateway)', () => app.ckSetup('card')),
        I('C06', 'Pedido em processamento', () => app.ckSetup('card', oid => app.go('C06', { order: oid }, true))),
        I('C07', 'Pagamento confirmado, preparando ingressos', () => app.ckSetup('pix', oid => app.approve(oid))),
        I('C07', 'Compra confirmada (3 ingressos)', () =>
          app.ckSetup('pix', oid => {
            app.approve(oid);
          }),
        ),
        I('C08', 'Reserva ou Pix expirado', () => app.ckSetup('pix', oid => app.expireOrder(oid))),
        I('C09', 'Pagamento recusado', () =>
          app.ckSetup('card', () => {
            app.up('ck', { outcome: 'recusar' });
            setTimeout(() => app.payCard(), 40);
          }),
        ),
        I('C09', 'Falha de comunicação', () =>
          app.ckSetup('card', () => {
            app.up('ck', { outcome: 'erro' });
            setTimeout(() => app.payCard(), 40);
          }),
        ),
        I('C10', 'Aprovado após expirar, sem estoque', () => app.ckSetup('pix', oid => app.lateApprove(oid, false))),
      ],
    },
    {
      name: 'D · ÁREA DO CLIENTE',
      items: [
        I('U01', 'Meus ingressos', J('cliente', 'U01', { v: {} })),
        I('U01', 'Carregando', () => {
          app.jump('cliente', 'U01', { v: { loadingMe: true } });
          setTimeout(() => app.setState({ v: {} }), 1500);
        }),
        I('U01', 'Sem ingressos', J('cliente', 'U01', { v: { emptyMe: true } })),
        I('U01', 'Histórico (utilizados)', J('cliente', 'U01', { v: { meTab: 'hist' } })),
        I('U02', 'Minhas compras', J('cliente', 'U02')),
        I('U03', 'Detalhe: pago', J('cliente', 'U03', { order: (app.mo('e1', 'pago') || {}).id })),
        I('U03', 'Detalhe: expirado', J('cliente', 'U03', { order: (app.mo('e4', 'expirado') || {}).id })),
        I('U03', 'Detalhe: estornado', J('cliente', 'U03', { order: (app.mo('e1', 'estornado') || {}).id })),
        I('U04', 'Ingresso válido', J('cliente', 'U04', { ticket: (app.mt('e1', 'valido') || app.mt('e1') || {}).id })),
        I('U04', 'Ingresso utilizado', J('cliente', 'U04', { ticket: (app.mt('e6', 'utilizado') || {}).id })),
        I('U04', 'Ingresso cancelado', J('cliente', 'U04', { ticket: (app.mt('e2', 'cancelado') || {}).id })),
        I('U05', 'Tela cheia no celular', () =>
          app.jump('cliente', 'U05', {
            ticket: (app.mt('e1', 'valido') || app.mt('e1') || {}).id,
            pre: { frame: '390' },
          }),
        ),
        I('U05', 'Tela cheia: utilizado', () =>
          app.jump('cliente', 'U05', { ticket: (app.mt('e6', 'utilizado') || {}).id, pre: { frame: '390' } }),
        ),
        I('U06', 'Minha conta', J('cliente', 'U06')),
        I(
          'U07',
          'Alterar senha',
          J('cliente', 'U06', { modal: { kind: 'pw', id: 'U07' }, pwf: { cur: '', nw: '', nw2: '', err: {} } }),
        ),
      ],
    },
    {
      name: 'E · ADMINISTRAÇÃO',
      items: [
        I('ADM01', 'Visão geral', J('admin', 'ADM01')),
        I('ADM02', 'Lista de eventos', J('admin', 'ADM02')),
        I('ADM03', 'Criar evento', () => {
          app.jump('admin', 'ADM02');
          setTimeout(() => app.openEventForm(null), 40);
        }),
        I('ADM03', 'Editar evento', () => {
          app.jump('admin', 'ADM02');
          setTimeout(() => app.openEventForm('e1'), 40);
        }),
        I('ADM04', 'Gestão do evento', J('admin', 'ADM04', { ev: 'e1', admTab: 'info' })),
        I('ADM04', 'Rascunho pronto para publicar', J('admin', 'ADM04', { ev: 'e5', admTab: 'info' })),
        I('ADM05', 'Tipos de ingresso', J('admin', 'ADM04', { ev: 'e1', admTab: 'tipos' })),
        I('ADM06', 'Novo tipo de ingresso', () => {
          app.jump('admin', 'ADM04', { ev: 'e1', admTab: 'tipos' });
          setTimeout(() => app.openType('e1', null), 40);
        }),
        I('ADM06', 'Capacidade menor que vendidos', () => {
          app.jump('admin', 'ADM04', { ev: 'e1', admTab: 'tipos' });
          setTimeout(() => {
            app.openType('e1', 't12');
            setTimeout(() => {
              app.setForm('tf', { total: '50' });
              setTimeout(() => app.saveType(), 40);
            }, 40);
          }, 40);
        }),
        I('ADM07', 'Promoters', J('admin', 'ADM07', { v: {} })),
        I('ADM07', 'Sem promoters', J('admin', 'ADM07', { v: { emptyProm: true } })),
        I('ADM08', 'Cadastrar promoter', () => {
          app.jump('admin', 'ADM07');
          setTimeout(() => app.openProm(null), 40);
        }),
        I('ADM08', 'Código repetido', () => {
          app.jump('admin', 'ADM07');
          setTimeout(() => {
            app.openProm(null);
            setTimeout(() => {
              app.setForm('pf', { name: 'Nina Farias', phone: '(55) 99123-4567', code: 'DUDA' });
              setTimeout(() => app.saveProm(), 40);
            }, 40);
          }, 40);
        }),
        I('ADM09', 'Detalhe do promoter', J('admin', 'ADM09', { prom: 'p1' })),
        I('ADM10', 'Pedidos', J('admin', 'ADM10', { v: {} })),
        I('ADM11', 'Detalhe do pedido', J('admin', 'ADM11', { order: (app.mo('e1', 'pago') || {}).id })),
        I('ADM11', 'Pagamento tardio sem estoque', J('admin', 'ADM11', { order: lucas && lucas.id })),
        I('ADM11', 'Pedido contestado', J('admin', 'ADM11', { order: cont && cont.id })),
        I('ADM12', 'Compradores por evento', J('admin', 'ADM12')),
        I('ADM13', 'Detalhe do comprador', J('admin', 'ADM13', { buyer: 'c1' })),
        I(
          'ADM13',
          'Correção de e-mail ou CPF',
          J('admin', 'ADM13', {
            buyer: 'c1',
            modal: { kind: 'corr', id: 'ADM13 › correção' },
            corr: { email: 'marina.costa@exemplo.com', cpf: '123.456.789-09', why: '', err: {} },
          }),
        ),
        I('ADM14', 'Ingressos por evento', J('admin', 'ADM14')),
        I(
          'ADM15',
          'Detalhe do ingresso',
          J('admin', 'ADM14', { ticket: (app.mt('e1', 'valido') || {}).id, drawer: { kind: 'ticket', id: 'ADM15' } }),
        ),
        I('ADM15', 'Confirmação de cancelamento', () => {
          const k = app.mt('e1', 'valido');
          app.jump('admin', 'ADM11', { order: k && k.orderId, ticket: k && k.id });
          setTimeout(() => k && app.cancelTicket(k), 40);
        }),
        I('ADM16', 'Relatório de vendas', J('admin', 'ADM16')),
        I('ADM17', 'Ranking de promoters', J('admin', 'ADM17')),
        I('ADM18', 'Taxa mensal', J('admin', 'ADM18')),
        I('ADM19', 'Entradas em tempo real', J('admin', 'ADM19', { v: {} })),
        I('ADM19', 'Sem conexão', J('admin', 'ADM19', { v: { conn: 'off', lastOk: app.now() } })),
        I('ADM20', 'Equipe', J('admin', 'ADM20', { v: {} })),
        I('ADM20', 'Sem equipe adicional', J('admin', 'ADM20', { v: { emptyTeam: true } })),
        I('ADM21', 'Novo usuário', () => {
          app.jump('admin', 'ADM20');
          setTimeout(() => app.openStaff(null), 40);
        }),
        I('ADM21', 'Desativar usuário (confirmação)', () => {
          app.jump('admin', 'ADM20');
          setTimeout(() => app.toggleStaff(app.state.db.staff.find(x => x.id === 's2')), 40);
        }),
        I('ADM23', 'Exportação com PDF de contingência', () => {
          app.jump('admin', 'ADM14');
          setTimeout(
            () =>
              app.openExport('Ingressos · Noite Neon', ['Noite Neon', 'Todos os tipos', 'Todos os status'], {
                pdf: true,
                base: 'ingressos-noite-neon',
              }),
            40,
          );
        }),
        I('ADM23', 'Exportação com falha', () => {
          app.jump('admin', 'ADM16');
          setTimeout(() => {
            app.openExport('Relatório de vendas', ['Todos os eventos', 'Outubro de 2026'], {
              base: 'relatorio-vendas',
            });
            setTimeout(
              () =>
                app.setState(
                  s2 => ({ modal: { ...s2.modal, fail: true } }),
                  () => app.runExport(),
                ),
              40,
            );
          }, 40);
        }),
        I('ADM24', 'Conta do administrador', J('admin', 'ADM24')),
      ],
    },
    {
      name: 'F · PORTARIA',
      items: [
        I('V01', 'Selecionar evento', J('validador', 'V01')),
        I(
          'V02',
          'Solicitar permissão da câmera',
          J('validador', 'V02', { g: { ...app.state.g, eventId: 'e1', cam: 'perm', res: null } }),
        ),
        I(
          'V02',
          'Iniciando câmera',
          J('validador', 'V02', { g: { ...app.state.g, eventId: 'e1', cam: 'starting', res: null } }),
        ),
        I(
          'V02',
          'Lendo',
          J('validador', 'V02', { g: { ...app.state.g, eventId: 'e1', cam: 'reading', res: null, busy: false } }),
        ),
        I(
          'V02',
          'Consultando servidor',
          J('validador', 'V02', { g: { ...app.state.g, eventId: 'e1', cam: 'querying', busy: true, res: null } }),
        ),
        I(
          'V02',
          'Permissão negada',
          J('validador', 'V02', { g: { ...app.state.g, eventId: 'e1', cam: 'denied', res: null } }),
        ),
        I(
          'V02',
          'Câmera indisponível',
          J('validador', 'V02', { g: { ...app.state.g, eventId: 'e1', cam: 'unavailable', res: null } }),
        ),
        I(
          'V03',
          'Busca manual',
          J('validador', 'V03', { g: { ...app.state.g, eventId: 'e1', res: null, mres: null, mq: '' } }),
        ),
        I('V04', 'Resultado: nomes iguais', () => {
          app.jump('validador', 'V03', {
            g: { ...app.state.g, eventId: 'e1', res: null, mres: null, mq: 'Pedro Santos', online: true },
          });
          setTimeout(() => app.renderVals().gv.search({ preventDefault() {} }), 60);
        }),
        I('V05', 'Entrada liberada', scanAfter(['valido'])),
        I('V06', 'Já utilizado (leitura repetida)', scanAfter(['valido', 'repetir'])),
        I('V06', 'Dois aparelhos, mesmo ingresso', scanAfter(['duplo'])),
        I('V07', 'Ingresso cancelado', scanAfter(['cancelado'])),
        I('V07', 'QR adulterado ou inválido', scanAfter(['adulterado'])),
        I('V08', 'Ingresso de outro evento', scanAfter(['outro'])),
        I('V09', 'Sem conexão', () =>
          app.jump('validador', 'V02', {
            g: { ...app.state.g, eventId: 'e1', cam: 'reading', res: null, busy: false, online: false },
            after: () => app.scan('valido'),
          }),
        ),
        I('V09', 'QR ilegível', scanAfter(['ilegivel'])),
      ],
    },
    {
      name: 'G · ESTADOS GERAIS',
      items: [
        I('G01', 'Skeleton em lista (pedidos)', () => {
          app.jump('admin', 'ADM10', { v: { loadOrd: true } });
          setTimeout(() => app.setState(s2 => ({ v: { ...s2.v, loadOrd: false } })), 2500);
        }),
        I(
          'G02',
          'Vazio: sem resultados no período',
          J('admin', 'ADM10', { f: { ...app.state.f, ordPer: 'hoje', ordSt: 'contestado' } }),
        ),
        I('G03', 'Erro de carregamento', J('admin', 'ADM10', { v: { errOrd: true } })),
        I('G04', 'Acesso negado (validador no painel)', () => {
          app.setState({ uid: 's2', index: false }, () => app.go('ADM10', {}, true));
        }),
        I('G04', 'Acesso negado (cliente no painel)', () => {
          app.setState({ uid: 'c1', index: false }, () => app.go('ADM01', {}, true));
        }),
        I('G05', 'Sessão expirada', () => {
          app.jump('admin', 'ADM02');
          setTimeout(() => {
            app.openEventForm('e1');
            setTimeout(() => app.setState({ modal: { kind: 'session', id: 'G05' } }), 60);
          }, 40);
        }),
        I('G06', 'Manutenção', J(null, 'G06')),
        I('G07', 'Menu mobile público', () =>
          app.jump(null, 'P01', { pre: { frame: '390' }, drawer: { kind: 'pubmenu' } }),
        ),
        I('G07', 'Menu mobile do admin', () =>
          app.jump('admin', 'ADM01', { pre: { frame: '390' }, drawer: { kind: 'admmenu' } }),
        ),
        I('G07', 'Filtros em drawer (mobile)', () =>
          app.jump('admin', 'ADM10', { pre: { frame: '390' }, after: () => app.renderVals().ap.filters.openDrawer() }),
        ),
        I('G07', 'Alterações não salvas', () => {
          app.jump('admin', 'ADM02');
          setTimeout(() => {
            app.openEventForm('e1');
            setTimeout(() => {
              app.setForm('evf', { name: 'Noite Neon · edição' });
              setTimeout(() => app.go('ADM10'), 40);
            }, 60);
          }, 40);
        }),
        I('G08', 'Download em andamento e concluído', () => {
          app.jump('cliente', 'U04', { ticket: (app.mt('e1', 'valido') || {}).id });
          setTimeout(() => app.download('ingresso.pdf'), 60);
        }),
      ],
    },
  ];
}

export function notesFor(id: string) {
  const N: Loose = {
    P01: [
      [
        'Destaque vem do campo “destaque na página inicial”; só um evento por vez.',
        'Cards mostram preço “a partir de” calculado apenas com tipos à venda.',
        'Rascunhos e encerrados não aparecem. Eventos só com vendas encerradas saem da listagem (continuam na busca).',
      ],
      'RF-19, RF-20, RF-21 · CA-07, CA-11',
    ],
    P02: [
      [
        'Busca por parte do nome, sem acento e sem diferenciar maiúsculas. Data filtra o dia do evento.',
        'Estados: carregando, resultados, nenhum resultado, nenhuma venda disponível.',
        'Sem filtros por categoria ou localização: não há esses dados no escopo.',
      ],
      'RF-21, RF-22 · CA-12',
    ],
    P03: [
      [
        'Endereço amigável /eventos/slug. Open Graph com banner e título.',
        'Cada tipo mostra preço e condição: à venda, esgotado, em breve, vendas encerradas, indisponível (desativado), indisponível no momento (reservas).',
        'Selecionar quantidade não reserva. Limite por pedido soma todos os tipos (premissa).',
        'Comprar exige login; a seleção é guardada e revalidada no retorno.',
      ],
      'RF-23 a RF-29 · CA-08, CA-09, CA-13, CA-14, CA-15',
    ],
    A01: [
      [
        'Um formulário para os três perfis; destino por perfil após o login.',
        '5 falhas em 15 min bloqueiam temporariamente (exemplo da documentação).',
        'Conta desativada: mensagem própria. Retorno ao checkout preserva a seleção.',
      ],
      'RF-04, RF-07, RF-10 · CA-01, CA-06',
    ],
    A02: [
      [
        'CPF com dígitos verificadores; e-mail e CPF únicos.',
        'Aceite desmarcado por padrão; registra versão, data e IP.',
        'Nenhuma etapa obrigatória de verificação de e-mail.',
      ],
      'RF-01, RF-02, RF-03 · CA-01, CA-02, CA-03',
    ],
    A03: [
      ['Mensagem neutra: não revela se o e-mail existe.', 'Link de uso único com validade de 1 hora.'],
      'RF-05 · CA-04',
    ],
    A04: [['Resposta idêntica para e-mails cadastrados ou não.'], 'RF-05 · CA-04'],
    A05: [
      ['Token verificado no servidor: válido, expirado ou já utilizado.', 'Ao salvar, o token é marcado como usado.'],
      'RF-05 · CA-04',
    ],
    A06: [['Após trocar, reabrir o mesmo link leva ao estado “já utilizado”.'], 'CA-04'],
    C02: [
      [
        'Código do promoter só vincula a venda. Total nunca muda; sem valor riscado ou economia.',
        'Códigos inválidos ou desativados recusados com mensagem própria.',
        'Disponibilidade é conferida de novo ao iniciar o pagamento.',
      ],
      'RF-30, RF-31, RF-32 · CA-19',
    ],
    C03: [
      [
        'Um único gateway, identidade neutra até a escolha.',
        'Parcelamento só se habilitado e aprovado no gateway.',
        'A reserva começa ao iniciar o pagamento.',
      ],
      'RF-33, RF-34',
    ],
    C04: [
      [
        'Cobrança Pix expira junto com a reserva (10 min é premissa).',
        'Página atualiza sozinha; o navegador não aprova nada: só o servidor, após webhook verificado e reconsulta.',
        'QR do Pix em bloco roxo rotulado “Pagamento”; nunca junto do QR do ingresso.',
      ],
      'RF-33, RF-34, RF-35, RF-37 · CA-17, CA-18, CA-P1',
    ],
    C05: [
      [
        'Campos do cartão são do componente seguro do gateway (tokenização) ou checkout hospedado. O número não passa pelo servidor.',
        'Sem salvar cartão. Resumos mostram no máximo o final do cartão.',
      ],
      'RF-34 · CA-P1, CA-P2',
    ],
    C06: [['Sem botão de pagar de novo. Reconsulta automática no servidor.'], 'RF-37'],
    C07: [
      [
        '“Preparando seus ingressos” enquanto o servidor emite; nenhum QR antes.',
        'Um ingresso por unidade, código aleatório único. Webhook repetido é idempotente.',
      ],
      'RF-35, RF-36, RF-38 · CA-18, CA-20, CA-P3',
    ],
    C08: [
      ['Pedido expirado não é reaproveitado: nova seleção cria novo pedido após revalidar estoque.'],
      'RF-33 · CA-17',
    ],
    C09: [
      [
        'Recusado: reserva liberada; nova tentativa no mesmo pedido, sem duplicar.',
        'Falha de comunicação: não afirma aprovação nem recusa; reconsulta.',
      ],
      'CA-P2',
    ],
    C10: [
      [
        'Pago após expirar sem estoque: nenhum ingresso; PartyX estorna no gateway. Com estoque, emissão normal.',
        'Alerta correspondente no admin (ADM01, ADM10, ADM11).',
      ],
      'Etapa 3 · CA-P5',
    ],
    U01: [
      ['Agrupado por evento; uma linha por unidade com status próprio.', 'Próximos e histórico.'],
      'RF-38, RF-42 · CA-20',
    ],
    U02: [['Status do pedido e do pagamento separados.'], 'RF-37, RF-42'],
    U03: [
      [
        'Ação depende do estado: pendente volta à cobrança; expirado volta à seleção; pago abre os ingressos.',
        'Sem cancelamento financeiro pelo comprador.',
      ],
      'RF-37, RF-41',
    ],
    U04: [
      [
        'Nome do comprador em todas as unidades; CPF não aparece no ingresso (pendente de decisão).',
        'QR assinado (HMAC) gerado no servidor; o protótipo usa padrão ilustrativo.',
      ],
      'RF-39, RF-40, RF-41 · CA-21, CA-22',
    ],
    U05: [
      [
        'QR preto sobre branco, margem de 4 módulos, até 360 px.',
        'Brilho não é controlado pelo navegador: só orientação.',
      ],
      'RF-43',
    ],
    U06: [['Nome e telefone editáveis; e-mail e CPF só pelo administrador.'], 'RF-06'],
    ADM01: [
      ['Vendas = pedidos pagos. Reservas e entradas em indicadores separados.', 'Sem saldo, lucro ou valor líquido.'],
      'RF-55',
    ],
    ADM02: [['Status: rascunho, publicado, encerrado. Exclusão lógica.'], 'RF-11 · CA-07, CA-11'],
    ADM03: [
      [
        'Upload com redimensionamento automático; limites dependem da configuração.',
        'Alterações não salvas pedem confirmação.',
      ],
      'RF-11, RF-12, RF-13, RF-19',
    ],
    ADM04: [
      ['Publicar exige tipo ativo e banner. Encerrar bloqueia novas vendas sem cancelar ingressos emitidos.'],
      'RF-11, RF-16, RF-17 · CA-07, CA-11',
    ],
    ADM05: [
      ['Vendidos (emitidos) e reservados separados. Estoque controlado no servidor com bloqueio de linha.'],
      'RF-14 a RF-17 · CA-09, CA-16',
    ],
    ADM07: [['Código exclusivo; sem comissão, sem portal do promoter.'], 'RF-18 · CA-10'],
    ADM09: [['Contagem por pedidos pagos, filtrável por evento e período.'], 'RF-59 · CA-19'],
    ADM10: [['Pagamento e emissão em colunas separadas.'], 'RF-56'],
    ADM11: [
      [
        'Referência do gateway parcialmente mascarada. Nunca dados completos de cartão.',
        'Linha do tempo com criação, aprovação, emissão, cancelamento, estorno e entradas.',
      ],
      'RF-56, RF-62 · CA-P5',
    ],
    ADM12: [['Sem funções de CRM ou marketing.'], 'RF-57'],
    ADM13: [['Correção de e-mail/CPF só pelo admin, com motivo e auditoria.'], 'RF-06'],
    ADM14: [['Base da lista de contingência; exportação CSV, XLSX e PDF.'], 'RF-57, RF-63, RF-64'],
    ADM16: [
      ['Total = soma dos pedidos pagos (CA-28). Estornados e contestados em indicador separado.'],
      'RF-58, RF-63 · CA-28, CA-31',
    ],
    ADM17: [['Ordenado do maior para o menor pela métrica escolhida.'], 'RF-59 · CA-30'],
    ADM18: [
      ['Unidades com pagamento aprovado no mês, independente do status atual.', 'Sem portal de cobrança.'],
      'RF-60 · CA-29',
    ],
    ADM19: [['Atualiza a cada 5 s; leituras repetidas/inválidas não contam.'], 'RF-61 · CA-27'],
    ADM20: [['Apenas Administrador e Validador.'], 'RF-07, RF-08'],
    ADM22: [['Troca obrigatória antes de qualquer tela.'], 'Checklist 13.1'],
    ADM24: [['Sem credenciais de infraestrutura.'], 'Escopo'],
    V01: [['Evento, data e local explícitos para evitar leitura no evento errado.'], 'RF-45'],
    V02: [
      [
        'Leitura por câmera no navegador (Chrome Android, Safari iPhone), sem app.',
        'Bloqueio de leitura enquanto consulta; resultado exige “Próxima leitura”.',
      ],
      'RF-46, RF-47, RF-53 · CA-26',
    ],
    V03: [['Buscar não consome o ingresso; confirmação explícita. CPF mascarado.'], 'RF-52'],
    V04: [['Nomes iguais distinguidos por CPF mascarado, e-mail mascarado, código e pedido.'], 'RF-52'],
    V05: [
      ['Atualização condicional no servidor: só uma leitura vence.'],
      'RF-48, RF-49, RF-50, RF-51 · CA-23, CA-25, CA-27',
    ],
    V06: [['Mostra horário e validador da primeira entrada; sem ignorar.'], 'RF-48 · CA-23, CA-25'],
    V07: [['Cancelado e inválido com mensagens distintas; sem liberar à força.'], 'RF-48 · CA-22, CA-24'],
    V08: [['Mantém o evento selecionado.'], 'RF-54'],
    V09: [['Sem resposta do servidor: nunca verde nem vermelho. Sem validação offline.'], 'Anexo II, 6'],
    G04: [['Permissão verificada no servidor em cada rota.'], 'RF-09 · CA-05'],
    G06: [['Sem promessa de suporte 24 h.'], 'Anexo II'],
  };
  return N[id] || [['Sem anotações específicas para esta tela. Consulte a Documentação.'], ''];
}
