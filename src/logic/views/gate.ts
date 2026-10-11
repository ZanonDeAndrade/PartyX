import { fD, fT, fLong, norm, maskCPF, maskEmail } from '../../lib/format';
import { bd, kb } from '../../lib/badges';
import { R } from '../routes';
import type { PartyXLogic } from '../PartyXLogic';
import type { Loose, ViewCtx } from '../viewTypes';

export function gateV(app: PartyXLogic, { s, db, route, mob, role, u }: ViewCtx): Loose {
  if ((R[route] || [])[2] !== 'gate')
    return { gv: { res: { show: false }, conf: { show: false }, camMsg: { show: false } } };
  const g = s.g,
    n = app.now(),
    ev = app.ev(g.eventId),
    st = app.stats();
  const count = ev ? db.types.filter(t => t.eventId === ev.id).reduce((a, t) => a + st[t.id].used, 0) : 0;
  const gv: Loose = {
    label: route + ' ' + R[route][0],
    hasEvent: route !== 'V01' && !!ev,
    noEvent: route === 'V01',
    userName: u ? u.name + ' · ' + (role === 'admin' ? 'Administrador' : 'Validador') : '',
    isAdmin: role === 'admin',
    evName: ev ? ev.name : '',
    evDate: ev ? fD(ev.start) : '',
    count,
    connBg: g.online ? '#DCFCE7' : '#FEE2E2',
    connFg: g.online ? '#14532D' : '#991B1B',
    connLabel: g.online ? 'Conectado' : 'Sem conexão',
    offline: !g.online && route !== 'V01',
    sound: g.sound,
    soundLabel: g.sound ? 'Som ligado' : 'Som desligado',
    toggleSound: () => app.upG({ sound: !g.sound }),
    change: () => app.go('V01', { g: { ...g, res: null, conf: null, mres: null } }),
    logout: () => app.logout(),
    res: { show: false },
    conf: { show: false },
    camMsg: { show: false },
  };
  if (route === 'V01')
    gv.events = db.events
      .filter(e => e.status === 'publicado' && e.start > n - 12 * 3600000)
      .sort((a, b) => a.start - b.start)
      .map(e => {
        const today = fD(e.start) === fD(n);
        return {
          name: e.name,
          date: fLong(e.start) + ' · ' + fT(e.start),
          venue: e.venue + ' · ' + e.address,
          today,
          bd: today ? '#15803D' : '#1E1E2A',
          btnBg: today ? '#7C3AED' : 'transparent',
          btnBd: today ? '0' : '1px solid #3A3A4C',
          onClick: () =>
            app.go('V02', {
              g: { ...g, eventId: e.id, res: null, mres: null, mq: '', cam: g.cam === 'reading' ? 'reading' : 'perm' },
            }),
        };
      });
  if (route === 'V02') {
    const C: Loose = {
      perm: {
        show: true,
        title: 'Permitir acesso à câmera',
        text: 'O navegador vai pedir permissão para usar a câmera. Nada é gravado; a imagem só é usada para ler o QR.',
        hasBtn: true,
        btn: 'Ativar câmera',
        onClick: () => {
          app.upG({ cam: 'starting' });
          setTimeout(() => app.upG({ cam: 'reading' }), 1100);
        },
      },
      starting: { show: true, spin: true, title: 'Iniciando câmera…', text: 'Aguarde alguns segundos.' },
      denied: {
        show: true,
        title: 'Permissão da câmera negada',
        text: 'Sem permissão não é possível ler QR. Libere a câmera e tente de novo, ou use a busca manual.',
        hasSteps: true,
        steps: [
          { k: 'Chrome no Android:', v: 'toque no ícone ao lado do endereço › Permissões › Câmera › Permitir.' },
          { k: 'Safari no iPhone:', v: 'toque em aA na barra de endereço › Ajustes do Site › Câmera › Permitir.' },
        ],
        hasBtn: true,
        btn: 'Tentar novamente',
        onClick: () => {
          app.upG({ cam: 'starting' });
          setTimeout(() => app.upG({ cam: 'reading' }), 1100);
        },
      },
      unavailable: {
        show: true,
        title: 'Câmera indisponível',
        text: 'Nenhuma câmera foi encontrada ou ela está em uso por outro aplicativo. Feche outros apps que usam a câmera ou use a busca manual.',
        hasBtn: true,
        btn: 'Tentar novamente',
        onClick: () => {
          app.upG({ cam: 'starting' });
          setTimeout(() => app.upG({ cam: 'reading' }), 1100);
        },
      },
    };
    Object.assign(gv, {
      camReading: g.cam === 'reading' || g.cam === 'querying',
      camQuery: g.cam === 'querying',
      camMsg: C[g.cam] ? { spin: false, hasSteps: false, steps: [], hasBtn: false, ...C[g.cam] } : { show: false },
      multiCam: g.multiCam,
      btnCols: g.multiCam && !mob ? '1fr 1fr' : '1fr',
      switchCam: () => app.toast('Câmera alternada (disponível só quando o aparelho tem mais de uma).'),
      toManual: () => app.go('V03', { g: { ...g, res: null } }),
      sims: [
        ['valido', 'Ingresso válido'],
        ['repetir', 'Ler o mesmo QR de novo'],
        ['duplo', 'Mesmo ingresso lido em outro aparelho'],
        ['cancelado', 'Ingresso cancelado'],
        ['adulterado', 'QR adulterado'],
        ['outro', 'Ingresso de outro evento'],
        ['ilegivel', 'QR ilegível'],
        ['offline', g.online ? 'Perder internet' : 'Restaurar internet'],
        ['perm', 'Permissão negada'],
        ['nocam', 'Câmera indisponível'],
      ].map(([k, l]) => ({ label: l, onClick: () => app.scan(k) })),
    });
  }
  if (route === 'V03') {
    Object.assign(gv, {
      mq: g.mq,
      onMq: e => app.upG({ mq: e.target.value, merr: null }),
      mbusy: g.mbusy,
      merr: g.merr || '',
      toCam: () => app.go('V02'),
      search: e => {
        e.preventDefault();
        const q = norm(g.mq),
          dig = g.mq.replace(/\D/g, '');
        if (q.length < 3) {
          app.upG({ merr: 'Digite pelo menos 3 caracteres.', mres: null });
          return;
        }
        app.upG({ mbusy: true, mres: null, merr: null });
        setTimeout(() => {
          if (!app.state.g.online) {
            app.upG({
              mbusy: false,
              merr: 'Não foi possível consultar: sem conexão com o servidor. Siga o procedimento de contingência da PartyX.',
            });
            return;
          }
          const cq = q.replace(/[^a-z0-9]/g, '');
          const res = db.tickets
            .filter(k => {
              const c = app.cust(app.ord(k.orderId).userId);
              if (
                cq.length >= 4 &&
                norm(k.code)
                  .replace(/[^a-z0-9]/g, '')
                  .includes(cq)
              )
                return true;
              if (k.eventId !== g.eventId) return false;
              return (
                norm(c.name).includes(q) ||
                (dig.length === 11 && c.cpf === dig) ||
                (q.includes('@') && c.email.includes(q))
              );
            })
            .slice(0, 20)
            .map(k => k.id);
          app.upG({
            mbusy: false,
            mres: res,
            merr: res.length
              ? null
              : 'Nenhum ingresso encontrado para “' + g.mq + '” neste evento. Confira a grafia ou procure pelo código.',
          });
        }, 600);
      },
    });
    const ids = g.mres || [];
    gv.hasRes = ids.length > 0;
    gv.resCount =
      ids.length +
      (ids.length === 1 ? ' ingresso encontrado' : ' ingressos encontrados') +
      '. Toque em um para conferir.';
    gv.mres = ids.map(id => {
      const k = app.tkt(id),
        o = app.ord(k.orderId),
        c = app.cust(o.userId),
        sib = db.tickets.filter(x => x.orderId === o.id);
      const other = k.eventId !== g.eventId;
      return {
        name: c.name,
        cpf: maskCPF(c.cpf),
        email: maskEmail(c.email),
        type: app.typ(k.typeId).name,
        code: k.code,
        num: o.num,
        pos: sib.indexOf(k) + 1 + ' de ' + sib.length,
        b: other
          ? bd('Outro evento', 'err')
          : ['estornado', 'contestado'].includes(o.status)
            ? bd('Cancelado', 'err')
            : kb(k),
        other,
        evName: app.ev(k.eventId).name,
        bd: other ? '#7F1D1D' : '#2C2C3A',
        onClick: () => app.upG({ conf: id }),
      };
    });
    if (g.conf) {
      const k = app.tkt(g.conf),
        c = app.cust(app.ord(k.orderId).userId);
      gv.conf = {
        show: true,
        name: c.name,
        type: app.typ(k.typeId).name,
        code: k.code,
        cpf: maskCPF(c.cpf),
        cancel: () => app.upG({ conf: null }),
        ok: () => {
          if (app.state.g.busy) return;
          app.upG({ busy: true });
          setTimeout(() => {
            if (!app.state.g.online) {
              app.showRes({
                id: 'V09',
                tone: 'gray',
                icon: '?',
                title: 'Não foi possível confirmar o ingresso',
                sub: 'O servidor não respondeu. A entrada não foi registrada.',
                lines: [],
                hint: 'Não libere a entrada por esta tela. Sem internet, siga o procedimento de contingência da PartyX.',
                snd: null,
              });
              return;
            }
            const r = app.validate(k, 'manual');
            app.mut(() => {});
            app.showRes(r, k);
          }, 600);
        },
      };
    }
  }
  if (g.res) {
    const r = g.res,
      P = {
        green: ['#0E7A37', '#fff', 'rgba(255,255,255,.25)', 'rgba(0,0,0,.18)', '#fff', '#0E7A37'],
        yellow: ['#FACC15', '#0B0B10', 'rgba(0,0,0,.2)', 'rgba(0,0,0,.08)', '#0B0B10', '#FACC15'],
        red: ['#B91C1C', '#fff', 'rgba(255,255,255,.25)', 'rgba(0,0,0,.2)', '#fff', '#B91C1C'],
        gray: ['#2A2A38', '#fff', 'rgba(255,255,255,.15)', 'rgba(255,255,255,.08)', '#fff', '#0B0B10'],
      }[r.tone];
    const cooling = app.now() < g.cool,
      snd = {
        ok: 'Sinal sonoro: bipe curto de confirmação',
        used: 'Sinal sonoro: dois bipes de alerta',
        err: 'Sinal sonoro: bipe longo de recusa',
      }[r.snd];
    const extra =
      r.extra === 'manual'
        ? [{ label: 'Busca manual', onClick: () => app.go('V03', { g: { ...g, res: null } }) }]
        : r.extra === 'retry'
          ? [{ label: 'Busca manual', onClick: () => app.go('V03', { g: { ...g, res: null } }) }]
          : [];
    gv.res = {
      show: true,
      label: r.id + ' ' + r.title,
      bg: P[0],
      fg: P[1],
      line: P[2],
      hintBg: P[3],
      btnBg: P[4],
      btnFg: P[5],
      icon: r.icon,
      title: r.title,
      sub: r.sub,
      big: r.big || '',
      bigBg: P[3],
      lines: r.lines,
      hint: r.hint || '',
      sound: r.snd
        ? g.sound
          ? snd
          : 'Som desligado: siga a cor, o ícone e o texto'
        : 'Sem sinal sonoro: nenhuma resposta do servidor',
      extra,
      cooling,
      btnOp: cooling ? 0.5 : 1,
      nextLabel: cooling ? 'Aguarde…' : r.extra === 'retry' ? 'Tentar novamente' : 'Próxima leitura',
      next: () => {
        if (app.now() < app.state.g.cool) return;
        app.upG({ res: null, cam: 'reading' });
        if (route === 'V03') app.upG({ res: null, mres: null, mq: '' });
      },
    };
  }
  return { gv };
}
