import { cpfFull, fmtCPF, maskEmail, mCPF, mPhone } from '../../lib/format';
import { MIN } from '../../lib/constants';
import { B } from '../../lib/badges';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function authV(app: PartyXLogic, { s, db, route, mob, role, u }: ViewCtx): Loose {
  const out: Loose = { msg: { show: false }, pwpage: { show: false } };
  const A = (label, onClick, primary = true) => ({
    label,
    onClick,
    bg: primary ? '#7C3AED' : '#fff',
    fg: primary ? '#fff' : '#0B0B10',
    bd: primary ? '0' : '1px solid #D4D4DE',
    flex: mob ? '1 1 100%' : '0 0 auto',
  });
  const M = o => ({
    show: true,
    iBg: '#EDE9FE',
    iFg: '#5B21B6',
    icon: 'i',
    eyebrow: '',
    hasList: !!(o.list && o.list.length),
    list: [],
    note: '',
    hasDemo: !!(o.demo && o.demo.length),
    demo: [],
    demoTitle: '',
    ...o,
  });
  if (route === 'A01') {
    const a = s.auth,
      rt = a.returnTo,
      n = app.now();
    let rtText = '';
    if (rt) {
      const items = app.sel(),
        units = items.reduce((x, i) => x + i.qty, 0),
        ev = app.ev(s.cart.eventId);
      rtText = units
        ? 'Sua seleção de ' +
          ev.name +
          ' foi guardada: ' +
          units +
          (units === 1 ? ' ingresso' : ' ingressos') +
          '. A disponibilidade é conferida de novo antes do pagamento.'
        : 'Depois de entrar, você volta para onde estava.';
    }
    const E: Loose = {
      cred: ['E-mail ou senha incorretos.', 'Confira os dados e tente novamente.', 'err'],
      empty: ['Preencha e-mail e senha.', '', 'err'],
      blocked: [
        'Acesso bloqueado temporariamente.',
        'Houve muitas tentativas sem sucesso. Tente novamente em ' +
          Math.max(1, Math.ceil((a.until - n) / MIN)) +
          ' minutos ou redefina sua senha.',
        'warn',
      ],
      off: [
        'Esta conta está desativada.',
        a.offStaff ? 'Fale com o administrador da PartyX para reativar o acesso.' : 'Fale com o atendimento da PartyX.',
        'neu',
      ],
    }[a.err];
    const fill = (email, pw) => () => app.up('auth', { email, pw, err: null });
    out.au = {
      hasReturn: !!rt,
      returnText: rtText,
      hasErr: !!E,
      errTitle: E ? E[0] : '',
      errText: E ? E[1] : '',
      errBg: E ? B[E[2]][0] : '',
      errFg: E ? B[E[2]][1] : '',
      errBd: E ? (E[2] === 'err' ? '#FECACA' : E[2] === 'warn' ? '#FDE68A' : '#E4E4EC') : '',
      email: a.email,
      pw: a.pw,
      onEmail: e => app.up('auth', { email: e.target.value }),
      onPw: e => app.up('auth', { pw: e.target.value }),
      pwType: a.show ? 'text' : 'password',
      pwLabel: a.show ? 'Ocultar' : 'Mostrar',
      togglePw: () => app.up('auth', { show: !a.show }),
      submit: e => {
        e.preventDefault();
        app.login();
      },
      demo: [
        ['Cliente: Marina', 'marina.costa@exemplo.com', 'demo1234'],
        ['Administrador: Carla', 'carla.menezes@partyx.exemplo', 'demo1234'],
        ['Validador: Rafael', 'rafael.lima@partyx.exemplo', 'demo1234'],
        ['Conta desativada: Bruno', 'bruno.teixeira@partyx.exemplo', 'demo1234'],
        ['Primeiro acesso: Paulo', 'paulo.reis@partyx.exemplo', 'temp1234'],
        ['Senha errada', 'marina.costa@exemplo.com', 'errada00'],
      ].map(([l, e, p]) => ({ label: l, onClick: fill(e, p) })),
    };
  }
  if (route === 'A02') {
    const g = s.reg,
      er = g.err || {},
      set = (k, mask?) => e =>
        app.setState(st => ({
          reg: { ...st.reg, [k]: mask ? mask(e.target.value) : e.target.value, err: { ...st.reg.err, [k]: null } },
        }));
    const bb = k => (er[k] ? '2px solid #DC2626' : '1px solid #D4D4DE'),
      nErr = Object.values(er).filter(Boolean).length;
    const rt = s.auth.returnTo;
    out.rg = {
      hasReturn: !!rt && !g.done,
      done: !!g.done,
      form: !g.done,
      maskedEmail: u ? maskEmail(u.email) : '',
      nextLabel: rt ? 'Continuar para o pedido' : 'Ver eventos',
      next: () => app.afterRegister(),
      hasErrors: nErr > 0,
      errCount: nErr + (nErr === 1 ? ' campo precisa de ajuste.' : ' campos precisam de ajuste.'),
      cols: mob ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
      name: g.name,
      email: g.email,
      cpf: g.cpf,
      phone: g.phone,
      pw: g.pw,
      onName: set('name'),
      onEmail: set('email'),
      onCpf: set('cpf', mCPF),
      onPhone: set('phone', mPhone),
      onPw: set('pw'),
      bName: bb('name'),
      bEmail: bb('email'),
      bCpf: bb('cpf'),
      bPhone: bb('phone'),
      bPw: bb('pw'),
      eName: er.name || '',
      eEmail: er.email || '',
      eCpf: er.cpf || '',
      ePhone: er.phone || '',
      ePw: er.pw || '',
      eAccept: er.accept || '',
      pwType: g.show ? 'text' : 'password',
      pwLabel: g.show ? 'Ocultar' : 'Mostrar',
      togglePw: () => app.up('reg', { show: !g.show }),
      rules: app.pwRules(g.pw),
      accept: g.accept,
      accBg: g.accept ? '#7C3AED' : '#fff',
      accBd: er.accept ? '#DC2626' : g.accept ? '#7C3AED' : '#8A8A9E',
      accMark: g.accept ? '✓' : '',
      toggleAccept: () =>
        app.setState(st => ({ reg: { ...st.reg, accept: !st.reg.accept, err: { ...st.reg.err, accept: null } } })),
      openTerms: () => app.setState({ modal: { kind: 'legal', doc: 'Termos de Uso' } }),
      openPriv: () => app.setState({ modal: { kind: 'legal', doc: 'Política de Privacidade' } }),
      submit: e => {
        e.preventDefault();
        app.register();
      },
      fillOk: () =>
        app.up('reg', {
          name: 'Bianca Moreira',
          email: 'bianca.moreira@exemplo.com',
          cpf: fmtCPF(cpfFull('987654321')),
          phone: '(55) 99623-1180',
          pw: 'festa2026',
          err: {},
        }),
      fillBad: () =>
        app.up('reg', {
          name: 'Bianca Moreira',
          email: 'bianca.moreira@exemplo.com',
          cpf: '123.456.789-00',
          phone: '(55) 9962',
          pw: 'festa2026',
          err: {},
        }),
      fillDup: () =>
        app.up('reg', {
          name: 'Marina Costa',
          email: 'marina.costa@exemplo.com',
          cpf: fmtCPF(db.customers[0].cpf),
          phone: '(55) 99812-4470',
          pw: 'festa2026',
          err: {},
        }),
    };
  }
  if (route === 'A03') {
    const r = s.rec;
    out.rc = {
      email: r.email,
      onEmail: e => app.up('rec', { email: e.target.value, err: null }),
      err: r.err || '',
      bEmail: r.err ? '2px solid #DC2626' : '1px solid #D4D4DE',
      submit: e => {
        e.preventDefault();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) {
          app.up('rec', { err: 'Informe um e-mail válido.' });
          return;
        }
        app.up('rec', { used: false });
        app.go('A04');
      },
    };
  }
  if (route === 'A04')
    out.msg = M({
      label: 'A04 Solicitação enviada',
      icon: '✉',
      title: 'Verifique seu e-mail',
      body:
        'Se houver uma conta PartyX com o e-mail ' +
        (s.rec.email || 'informado') +
        ', você receberá um link para criar uma nova senha nos próximos minutos.',
      list: [
        'O link vale por 1 hora e só pode ser usado uma vez.',
        'Confira também a caixa de spam ou promoções.',
        'Não recebeu? Aguarde alguns minutos e faça uma nova solicitação.',
      ],
      actions: [A('Voltar para entrar', () => app.go('A01')), A('Nova solicitação', () => app.go('A03'), false)],
      hasDemo: true,
      demoTitle: 'abrir o link recebido (E02)',
      demo: [
        {
          label: 'Link válido',
          onClick: () => app.go('A05', { v: { tok: 'valid' }, rec: { ...s.rec, pw: '', pw2: '', err2: {} } }),
        },
        { label: 'Link expirado', onClick: () => app.go('A05', { v: { tok: 'expired' } }) },
        { label: 'Link já utilizado', onClick: () => app.go('A05', { v: { tok: 'used' } }) },
      ],
    });
  if (route === 'A05') {
    const tok = s.rec.used ? 'used' : s.v.tok || 'valid';
    if (tok === 'valid') {
      const r = s.rec,
        e2 = r.err2 || {};
      out.pwpage = {
        show: true,
        label: 'A05 Definir nova senha',
        eyebrow: '',
        title: 'Criar nova senha',
        text: 'Escolha uma senha nova para a conta ' + maskEmail(r.email || 'marina.costa@exemplo.com') + '.',
        pw: r.pw,
        pw2: r.pw2,
        onPw: e => app.up('rec', { pw: e.target.value, err2: {} }),
        onPw2: e => app.up('rec', { pw2: e.target.value, err2: {} }),
        rules: app.pwRules(r.pw),
        ePw: e2.pw || '',
        ePw2: e2.pw2 || '',
        bPw: e2.pw ? '2px solid #DC2626' : '1px solid #D4D4DE',
        bPw2: e2.pw2 ? '2px solid #DC2626' : '1px solid #D4D4DE',
        cta: 'Salvar nova senha',
        hasDemo: false,
        submit: e => {
          e.preventDefault();
          const er: Loose = {};
          if (r.pw.length < 8 || !/\d/.test(r.pw) || !/[a-zA-Z]/.test(r.pw))
            er.pw = 'Use pelo menos 8 caracteres, com letras e números.';
          if (r.pw !== r.pw2) er.pw2 = 'As senhas não são iguais.';
          if (Object.keys(er).length) {
            app.up('rec', { err2: er });
            return;
          }
          app.up('rec', { used: true, pw: '', pw2: '' });
          app.go('A06');
        },
      };
    } else
      out.msg = M({
        label: 'A05 Link ' + (tok === 'expired' ? 'expirado' : 'já utilizado'),
        iBg: '#FEF3C7',
        iFg: '#854D0E',
        icon: '!',
        title: tok === 'expired' ? 'Este link expirou' : 'Este link já foi utilizado',
        body:
          tok === 'expired'
            ? 'Por segurança, o link de recuperação vale por 1 hora. Solicite um novo link para criar sua senha.'
            : 'Cada link de recuperação pode ser usado uma única vez. Se você não alterou sua senha, solicite um novo link.',
        actions: [
          A('Solicitar novo link', () => app.go('A03', { rec: { ...s.rec, used: false } })),
          A('Voltar para entrar', () => app.go('A01'), false),
        ],
      });
  }
  if (route === 'A06')
    out.msg = M({
      label: 'A06 Senha alterada',
      iBg: '#DCFCE7',
      iFg: '#14532D',
      icon: '✓',
      title: 'Senha alterada',
      body: 'Sua nova senha já está valendo. Entre com ela para acessar seus ingressos.',
      actions: [A('Entrar', () => app.go('A01'))],
      hasDemo: true,
      demoTitle: 'CA-04',
      demo: [{ label: 'Abrir o mesmo link de novo', onClick: () => app.go('A05') }],
    });
  if (route === 'ADM22') {
    const f = s.first,
      er = f.err || {};
    out.pwpage = {
      show: true,
      label: 'ADM22 Primeiro acesso',
      eyebrow: 'PRIMEIRO ACESSO',
      title: 'Defina sua senha',
      text:
        'Olá, ' +
        (u ? u.name.split(' ')[0] : '') +
        '. Sua conta foi criada com uma senha temporária. Crie uma senha pessoal para continuar.',
      pw: f.pw,
      pw2: f.pw2,
      onPw: e => app.up('first', { pw: e.target.value, err: {} }),
      onPw2: e => app.up('first', { pw2: e.target.value, err: {} }),
      rules: app.pwRules(f.pw),
      ePw: er.pw || '',
      ePw2: er.pw2 || '',
      bPw: er.pw ? '2px solid #DC2626' : '1px solid #D4D4DE',
      bPw2: er.pw2 ? '2px solid #DC2626' : '1px solid #D4D4DE',
      cta: 'Salvar e continuar',
      hasDemo: true,
      submit: e => {
        e.preventDefault();
        const x: Loose = {};
        if (f.pw.length < 8 || !/\d/.test(f.pw) || !/[a-zA-Z]/.test(f.pw))
          x.pw = 'Use pelo menos 8 caracteres, com letras e números.';
        else if (f.pw === 'temp1234') x.pw = 'A nova senha precisa ser diferente da temporária.';
        if (f.pw !== f.pw2) x.pw2 = 'As senhas não são iguais.';
        if (Object.keys(x).length) {
          app.up('first', { err: x });
          return;
        }
        app.mut(() => {
          u.pw = f.pw;
          u.temp = false;
          u.last = app.now();
        });
        app.go(app.home(), {}, true);
        app.toast('Senha definida. Bem-vindo à PartyX.');
      },
    };
  }
  if (route === 'G04') {
    const h = app.home(),
      lbl = {
        ADM01: 'Ir para o painel',
        V01: 'Ir para a portaria',
        U01: 'Ir para meus ingressos',
        P01: 'Ir para a página inicial',
      }[h];
    const txt =
      role === 'validador'
        ? 'Seu perfil de validador acessa somente a portaria. Relatórios, pedidos e gestão de usuários são exclusivos de administradores.'
        : role === 'cliente'
          ? 'Esta área é exclusiva da equipe PartyX.'
          : role === 'admin'
            ? 'Esta área é exclusiva de clientes. Para comprar ingressos, use uma conta de cliente.'
            : 'Entre com uma conta autorizada.';
    out.msg = M({
      label: 'G04 Acesso negado',
      iBg: '#FEE2E2',
      iFg: '#991B1B',
      icon: '×',
      eyebrow: 'SEM PERMISSÃO',
      title: 'Você não tem acesso a esta página',
      body: txt,
      note: 'A permissão é verificada pelo servidor em cada endereço, inclusive quando digitado diretamente (RF-09, CA-05).',
      actions: [A(lbl, () => app.go(h))],
    });
  }
  return out;
}
