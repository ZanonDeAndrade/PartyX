import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type GateEvent, type GateHit, type GateOutcome, type MinorCheck } from './api';
import { DateStub, ErrorBox, Layout, usePageTitle } from './components';
import { dateParts, dateShort, timeOf } from './format';
import { IconBack, IconCamera, IconKeyboard } from './icons';
import { Link, useRouter } from './router';
import { useSession } from './session';
import { useFetch } from './useFetch';

/** Sinal sonoro por resultado (RF-48). Precisa de um toque do usuário antes para o navegador liberar o áudio (iPhone). */
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new (
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    void audio.resume();
  } catch {
    // Sem áudio: a tela continua mostrando o resultado em cor e texto.
  }
}
function beep(kind: GateOutcome['result']) {
  if (!audio) return;
  const seq: [number, number, number][] =
    kind === 'valido'
      ? [[880, 0, 0.18]]
      : kind === 'ja_utilizado'
        ? [
            [440, 0, 0.14],
            [440, 0.22, 0.14],
          ]
        : [[196, 0, 0.55]];
  for (const [freq, start, dur] of seq) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(audio.destination);
    o.start(audio.currentTime + start);
    o.stop(audio.currentTime + start + dur);
  }
  try {
    navigator.vibrate?.(kind === 'valido' ? 80 : [120, 80, 120]);
  } catch {
    // Vibração não existe em todo aparelho.
  }
}

/** Só equipe. Visitante vai ao login (voltando aqui); cliente vê o aviso de acesso negado. */
function useStaff(returnTo: string): 'espera' | 'ok' | 'negado' {
  const { go } = useRouter();
  const session = useSession();
  useEffect(() => {
    if (session.status === 'anon') go(`/entrar?voltar=${encodeURIComponent(returnTo)}`);
    else if (session.user?.mustChangePassword) go('/primeiro-acesso');
  }, [session.status, session.user, returnTo, go]);
  if (session.status !== 'user') return 'espera';
  return session.user?.role === 'validador' || session.user?.role === 'administrador' ? 'ok' : 'negado';
}

function Denied() {
  return (
    <Layout dark footer={false}>
      <div className="px-wrap px-narrow">
        <div className="px-box">
          <h1 className="px-h2">Acesso negado</h1>
          <p>Esta área é só para a equipe de portaria.</p>
          <Link to="/minha-conta" className="px-btn px-btn-pri">
            Ir para minha área
          </Link>
        </div>
      </div>
    </Layout>
  );
}

/** Seleção do evento em que o validador está trabalhando (RF-45, V01). */
export function GateEventsPage() {
  usePageTitle('Portaria · PartyX');
  const access = useStaff('/portaria');
  const [state, retry] = useFetch<GateEvent[]>(s => api.gateEvents(s), access === 'ok' ? 'eventos' : 'espera');
  if (access === 'negado') return <Denied />;
  if (access === 'espera')
    return (
      <Layout dark footer={false}>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  return (
    <Layout dark footer={false}>
      <div className="px-wrap px-narrow">
        <h1 className="px-h1 px-gate-h1">Portaria</h1>
        <p className="px-gate-lead">Escolha o evento desta porta. Confira nome, data e local antes de começar.</p>
        {state.status === 'loading' ? (
          <div className="px-gate-events-skel" aria-busy="true" aria-label="Carregando eventos">
            <span className="px-skel-line" />
            <span className="px-skel-line" />
          </div>
        ) : null}
        {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
        {state.status === 'ok' && state.data.length === 0 ? (
          <div className="px-box">
            <h2>Nenhum evento aberto</h2>
            <p>
              Aparecem os eventos publicados e, perto da data, os encerrados (enquanto a portaria ainda funciona para
              eles).
            </p>
          </div>
        ) : null}
        {state.status === 'ok' ? (
          <ul className="px-gate-events">
            {state.data.map(e => (
              <li key={e.id}>
                <Link to={`/portaria/${e.id}`} className="px-gate-event">
                  <DateStub iso={e.startsAt} />
                  <span className="px-gate-event-text">
                    <b>{e.name}</b>
                    <span>
                      {cap(dateParts(e.startsAt).weekday)}, {timeOf(e.startsAt)}
                    </span>
                    <small>{e.venue}</small>
                    {e.salesClosed ? (
                      <span className="px-gate-event-note">
                        <span className="px-badge px-badge-neu">Vendas encerradas</span>
                        {e.gateClosesAt ? (
                          <small>
                            Portaria até {dateShort(e.gateClosesAt)}, {timeOf(e.gateClosesAt)}
                          </small>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="px-gate-event-count" aria-label={`${e.entered} entradas de ${e.total} ingressos`}>
                    <b>{e.entered}</b>
                    <small>de {e.total}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Layout>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Cor (classe com os tokens semânticos), símbolo e título por resultado. Nunca só a cor: sempre símbolo e texto. */
const TONE: Record<GateOutcome['result'], { tone: 'ok' | 'warn' | 'err'; icon: string; title: string }> = {
  valido: { tone: 'ok', icon: '✓', title: 'Válido' },
  ja_utilizado: { tone: 'warn', icon: '!', title: 'Já utilizado' },
  invalido: { tone: 'err', icon: '✕', title: 'Inválido' },
  cancelado: { tone: 'err', icon: '✕', title: 'Cancelado' },
  outro_evento: { tone: 'err', icon: '✕', title: 'Outro evento' },
  menor_confirmar: { tone: 'warn', icon: '18', title: 'Conferir idade' },
};

/**
 * Ingresso de pedido de comprador menor (regras de menores): nada foi consumido. O validador confere a idade de quem está na frente e
 * escolhe; só então o servidor faz a entrada e grava a escolha na leitura. Recusar não consome o ingresso (a pessoa pode voltar).
 */
interface MinorActions {
  busy: boolean;
  onConfirm: (check: MinorCheck) => void;
  onRefuse: () => void;
}

/** Resultado em tela cheia (RF-48): verde, amarelo ou vermelho, sempre também em texto e símbolo. */
function ResultScreen({
  outcome,
  eventName,
  onDone,
  minor,
}: {
  outcome: GateOutcome;
  eventName: string;
  onDone: () => void;
  minor?: MinorActions;
}) {
  const t = TONE[outcome.result];
  const asking = outcome.result === 'menor_confirmar';
  useEffect(() => {
    beep(asking ? 'ja_utilizado' : outcome.result);
    // Conferir idade espera a escolha do validador: não fecha sozinho nem com toque fora dos botões.
    if (asking) return;
    // Verde segue sozinho; amarelo e vermelho esperam o toque (ou 8 s), para o validador ler com calma.
    const id = setTimeout(onDone, outcome.result === 'valido' ? 1800 : 8000);
    return () => clearTimeout(id);
  }, [outcome, onDone, asking]);
  // Aparece de imediato (sem transição de entrada). Só um pulso curto de cor, por baixo do conteúdo, que não atrasa nada.
  return (
    <div
      className={`px-gate-result px-gate-r-${t.tone}`}
      role="alert"
      aria-live="assertive"
      onClick={asking ? undefined : onDone}
    >
      <p className="px-gate-top">
        <span>{eventName}</span>
        <span>
          Entradas <b>{outcome.counter.entered}</b> de {outcome.counter.total}
        </span>
      </p>
      <div className="px-gate-body">
        <div className="px-gate-icon" aria-hidden="true">
          {t.icon}
        </div>
        <h1 className="px-gate-title">{t.title}</h1>
        <p className="px-gate-msg px-gate-msg-main">{outcome.message}</p>
        {outcome.ticket ? (
          <div className="px-gate-ticket">
            <p className="px-gate-type">{outcome.ticket.typeName}</p>
            <p className="px-gate-name">{outcome.ticket.holderName}</p>
            <p className="px-gate-code px-mono">{outcome.ticket.shortCode}</p>
          </div>
        ) : null}
        {outcome.firstEntry ? (
          <p className="px-gate-msg">
            Primeira entrada às <b>{timeOf(outcome.firstEntry.at)}</b> por {outcome.firstEntry.validatorName}
          </p>
        ) : null}
        {outcome.otherEvent ? (
          <p className="px-gate-msg">
            Este ingresso é de: <b>{outcome.otherEvent.name}</b>
          </p>
        ) : null}
        {outcome.method === 'manual' ? <p className="px-gate-small">Entrada manual</p> : null}
        {outcome.ticket?.buyerMinor && !asking ? <p className="px-gate-small">Pedido de comprador menor</p> : null}
      </div>
      {asking && minor ? (
        <div className="px-gate-minor-actions">
          <button
            type="button"
            className="px-gate-next"
            disabled={minor.busy}
            onClick={() => minor.onConfirm('autorizacao_recebida')}
          >
            Menor: autorização recebida
          </button>
          <button
            type="button"
            className="px-gate-next px-gate-next-alt"
            disabled={minor.busy}
            onClick={() => minor.onConfirm('maior_de_idade')}
          >
            Tem 18 anos ou mais
          </button>
          <button type="button" className="px-gate-refuse" disabled={minor.busy} onClick={minor.onRefuse}>
            Recusar: menor sem autorização
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="px-gate-next"
          onClick={e => {
            e.stopPropagation();
            onDone();
          }}
        >
          Próxima leitura
        </button>
      )}
    </div>
  );
}

type Camera = 'parada' | 'iniciando' | 'lendo' | 'negada' | 'indisponivel';

/** Portaria: câmera, contador e busca manual (RF-46 a RF-53). A conferência é toda no servidor. */
export function GatePage({ eventId }: { eventId: string }) {
  usePageTitle('Portaria · PartyX');
  const access = useStaff(`/portaria/${eventId}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const [events] = useFetch<GateEvent[]>(s => api.gateEvents(s), access === 'ok' ? 'eventos' : 'espera');
  const event = events.status === 'ok' ? events.data.find(e => e.id === eventId) : undefined;
  const [camera, setCamera] = useState<Camera>('parada');
  const [outcome, setOutcome] = useState<GateOutcome | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [problem, setProblem] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ entered: number; total: number } | null>(null);
  const [byType, setByType] = useState<{ typeName: string; entered: number; total: number }[]>([]);
  const [tab, setTab] = useState<'camera' | 'busca'>('camera');

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Contador a cada poucos segundos (RF-53, CA-27).
  useEffect(() => {
    if (access !== 'ok') return;
    let live = true;
    const load = () =>
      api
        .gateCounter(eventId)
        .then(r => {
          if (live) {
            setCounter(r.counter);
            setByType(r.byType);
          }
        })
        .catch(() => {});
    void load();
    const id = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [access, eventId]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const submit = useCallback(
    async (text: string) => {
      pausedRef.current = true;
      setProblem(null);
      try {
        const res = await api.gateScan(eventId, text);
        setOutcome(res);
        setCounter(res.counter);
      } catch (e) {
        // Sem internet ou servidor fora: NÃO se confirma entrada localmente (seção 15). Orienta a lista impressa.
        if (e instanceof ApiError && e.status === 0) setProblem('offline');
        else if (e instanceof ApiError && e.status === 429)
          setProblem('Muitas leituras seguidas. Aguarde um instante.');
        else setProblem(e instanceof ApiError ? e.message : 'Não foi possível verificar.');
        pausedRef.current = false;
      }
    },
    [eventId],
  );

  const startCamera = async () => {
    unlockAudio(); // o toque do botão libera áudio e câmera no iPhone
    setCamera('iniciando');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('indisponivel'); // endereço sem HTTPS, ou navegador sem câmera
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // iPhone: sem isso o vídeo abre em tela cheia do sistema
      await video.play();
      setCamera('lendo');
      const loop = () => {
        if (!streamRef.current) return;
        const v = videoRef.current;
        const canvas = canvasRef.current;
        if (v && canvas && !pausedRef.current && v.readyState >= 2 && v.videoWidth > 0) {
          const scale = Math.min(1, 640 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          const now = Date.now();
          // Mesmo QR continua à frente da câmera: não reenvia por 4 s.
          if (code?.data && (code.data !== lastRef.current.text || now - lastRef.current.at > 4000)) {
            lastRef.current = { text: code.data, at: now };
            void submit(code.data);
          }
        }
        setTimeout(() => requestAnimationFrame(loop), 90);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setCamera(name === 'NotAllowedError' || name === 'SecurityError' ? 'negada' : 'indisponivel');
    }
  };

  const done = useCallback(() => {
    setOutcome(null);
    lastRef.current = { text: lastRef.current.text, at: Date.now() };
    pausedRef.current = false;
  }, []);

  // Conferência da idade num ingresso de pedido de comprador menor: confirma (entrada gravada com a escolha) ou recusa (trilha).
  const [minorBusy, setMinorBusy] = useState(false);
  const minorActions = (current: GateOutcome): MinorActions => ({
    busy: minorBusy,
    onConfirm: check => {
      setMinorBusy(true);
      api
        .gateAdmit(eventId, current.ticket!.id, { method: current.method, minorCheck: check })
        .then(res => {
          setOutcome(res);
          setCounter(res.counter);
        })
        .catch(e => {
          setOutcome(null);
          pausedRef.current = false;
          setProblem(
            e instanceof ApiError && e.status === 0
              ? 'offline'
              : e instanceof ApiError
                ? e.message
                : 'Não foi possível confirmar.',
          );
        })
        .finally(() => setMinorBusy(false));
    },
    onRefuse: () => {
      setMinorBusy(true);
      api
        .gateMinorRefused(eventId, current.ticket!.id)
        .then(() => setProblem('Entrada recusada: menor sem a autorização. O ingresso continua válido.'))
        .catch(e => setProblem(e instanceof ApiError ? e.message : 'Não foi possível registrar a recusa.'))
        .finally(() => {
          setMinorBusy(false);
          done();
        });
    },
  });

  if (access === 'negado') return <Denied />;
  if (access === 'espera')
    return (
      <Layout dark footer={false}>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );

  return (
    <Layout dark footer={false}>
      <div className="px-wrap px-narrow">
        <Link to="/portaria" className="px-textlink px-textlink-sm">
          <IconBack size={18} />
          Trocar de evento
        </Link>
        <h1 className="px-gate-event-name">{event?.name ?? 'Portaria'}</h1>
        {event?.salesClosed ? (
          <p className="px-small">
            <span className="px-badge px-badge-neu">Vendas encerradas</span>{' '}
            {event.gateClosesAt
              ? `Validação disponível até ${dateShort(event.gateClosesAt)} ${timeOf(event.gateClosesAt)}.`
              : null}
          </p>
        ) : null}
        <div className="px-gate-counter" role="status" aria-live="polite">
          <b className="px-gate-count">{counter ? counter.entered : '0'}</b>
          <span>
            entradas
            {counter ? <small> de {counter.total} ingressos</small> : null}
          </span>
        </div>
        {byType.length > 0 ? (
          <ul className="px-gate-types">
            {byType.map(t => (
              <li key={t.typeName}>
                {t.typeName}: <b>{t.entered}</b>/{t.total}
              </li>
            ))}
          </ul>
        ) : null}

        {offline || problem === 'offline' ? (
          <div className="px-notice px-notice-err" role="alert">
            <b>Sem conexão com o servidor</b>
            <span>
              Não confirme a entrada sem o sistema. Use a <b>lista impressa de contingência</b> e registre as entradas
              depois.
            </span>
          </div>
        ) : null}
        {problem && problem !== 'offline' ? (
          <p className="px-notice px-notice-err" role="alert">
            {problem}
          </p>
        ) : null}

        <div className="px-tabs px-gate-tabs" role="tablist" aria-label="Modo">
          <button type="button" role="tab" aria-selected={tab === 'camera'} onClick={() => setTab('camera')}>
            <IconCamera size={20} />
            Câmera
          </button>
          <button type="button" role="tab" aria-selected={tab === 'busca'} onClick={() => setTab('busca')}>
            <IconKeyboard size={20} />
            Busca manual
          </button>
        </div>

        <div hidden={tab !== 'camera'}>
          <div className="px-camera">
            <video ref={videoRef} muted playsInline aria-label="Imagem da câmera" />
            <canvas ref={canvasRef} hidden />
            {camera === 'lendo' ? <span className="px-camera-frame" aria-hidden="true" /> : null}
            {camera !== 'lendo' ? (
              <div className="px-camera-cover">
                {camera === 'negada' ? (
                  <p>
                    A câmera foi bloqueada. Libere o acesso à câmera nas configurações do navegador, ou use a{' '}
                    <b>busca manual</b>.
                  </p>
                ) : camera === 'indisponivel' ? (
                  <p>
                    Não foi possível usar a câmera. Ela só funciona em endereço <b>https</b> e em navegador com câmera.
                    Use a <b>busca manual</b>.
                  </p>
                ) : (
                  <p>{camera === 'iniciando' ? 'Abrindo a câmera…' : 'Toque para iniciar a leitura.'}</p>
                )}
                <button
                  type="button"
                  className="px-btn px-btn-pri px-btn-lg"
                  onClick={startCamera}
                  disabled={camera === 'iniciando'}
                >
                  {camera === 'parada' ? 'Iniciar leitura' : 'Tentar de novo'}
                </button>
              </div>
            ) : null}
          </div>
          <p className="px-gate-hint">Aponte para o QR Code do ingresso e segure parado. O resultado ocupa a tela.</p>
        </div>

        {tab === 'busca' ? <ManualSearch eventId={eventId} onOutcome={setOutcome} /> : null}
      </div>
      {outcome ? (
        <ResultScreen
          outcome={outcome}
          eventName={event?.name ?? ''}
          onDone={done}
          minor={outcome.result === 'menor_confirmar' ? minorActions(outcome) : undefined}
        />
      ) : null}
    </Layout>
  );
}

/** Busca por código, nome, CPF ou e-mail, com CPF mascarado (RF-52, V03). */
function ManualSearch({ eventId, onOutcome }: { eventId: string; onOutcome: (o: GateOutcome) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GateHit[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setHits((await api.gateSearch(eventId, q)).hits);
    } catch (err) {
      setHits(null);
      setError(
        err instanceof ApiError && err.status === 0
          ? 'Sem conexão. Use a lista impressa de contingência.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível buscar.',
      );
    } finally {
      setBusy(false);
    }
  };
  const admit = async (ticketId: string) => {
    setBusy(true);
    setError('');
    try {
      onOutcome(await api.gateAdmit(eventId, ticketId));
      setHits((await api.gateSearch(eventId, q)).hits); // atualiza o estado do ingresso na lista
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 0
          ? 'Sem conexão. Não confirme a entrada: use a lista impressa.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível confirmar.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Busca manual">
      <form onSubmit={search} className="px-form" role="search">
        <div className="px-field">
          <label htmlFor="busca">Código, nome, CPF ou e-mail</label>
          <input id="busca" value={q} maxLength={100} autoComplete="off" onChange={e => setQ(e.target.value)} />
          <small className="px-muted">
            CPF e e-mail precisam estar completos. Nome: 3 letras ou mais. Código: PX-...
          </small>
        </div>
        <button type="submit" className="px-btn px-btn-pri px-btn-lg" disabled={busy || !q.trim()}>
          Buscar
        </button>
      </form>
      {error ? (
        <p className="px-notice px-notice-err" role="alert">
          {error}
        </p>
      ) : null}
      {hits && hits.length === 0 ? (
        <p className="px-gate-empty">
          Nenhum ingresso deste evento com esse dado. Confira o código no celular da pessoa ou tente o e-mail completo.
        </p>
      ) : null}
      <ul className="px-gate-hits">
        {hits?.map(h => (
          <li key={h.ticketId} className="px-hit">
            <div className="px-hit-text">
              <b>{h.holderName}</b>
              {h.buyerMinor ? <span className="px-badge px-badge-warn">MENOR: conferir idade</span> : null}
              <span>{h.typeName}</span>
              <small>
                <span className="px-mono">{h.shortCode}</span>
                <span>CPF {h.cpf ?? 'não informado'}</span>
                <span className="px-break">{h.email}</span>
              </small>
              <span
                className={`px-badge px-badge-${h.status === 'valido' ? 'ok' : h.status === 'utilizado' ? 'warn' : 'err'}`}
              >
                {h.status === 'valido'
                  ? 'Válido'
                  : h.status === 'utilizado'
                    ? `Já utilizado${h.usedAt ? ` às ${timeOf(h.usedAt)}` : ''}`
                    : 'Cancelado'}
              </span>
            </div>
            <button
              type="button"
              className="px-btn px-btn-pri px-btn-lg"
              disabled={busy || h.status !== 'valido'}
              onClick={() => admit(h.ticketId)}
            >
              Confirmar entrada
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
