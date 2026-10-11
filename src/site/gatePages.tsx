import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type GateEvent, type GateHit, type GateOutcome } from './api';
import { ErrorBox, Layout, usePageTitle } from './components';
import { dateShort, timeOf } from './format';
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
    <Layout>
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
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  return (
    <Layout>
      <div className="px-wrap px-narrow">
        <h1 className="px-h1">Portaria</h1>
        <p>Escolha o evento em que você vai validar os ingressos.</p>
        {state.status === 'loading' ? <p aria-busy="true">Carregando…</p> : null}
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
          <ul className="px-tickets">
            {state.data.map(e => (
              <li key={e.id}>
                <Link to={`/portaria/${e.id}`} className="px-ticketrow">
                  <span>
                    <b>{e.name}</b>
                    <br />
                    <span className="px-muted">
                      {dateShort(e.startsAt)} · {timeOf(e.startsAt)} · {e.venue}
                    </span>
                    {e.salesClosed ? (
                      <>
                        <br />
                        <span className="px-badge px-badge-neu">Vendas encerradas</span>{' '}
                        {e.gateClosesAt ? (
                          <span className="px-small px-muted">
                            Portaria até {dateShort(e.gateClosesAt)} {timeOf(e.gateClosesAt)}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                  <span className="px-mono">
                    {e.entered}/{e.total}
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

const TONE: Record<GateOutcome['result'], { bg: string; fg: string; icon: string; title: string }> = {
  valido: { bg: '#166534', fg: '#FFFFFF', icon: '✓', title: 'VÁLIDO' },
  ja_utilizado: { bg: '#FACC15', fg: '#1C1500', icon: '!', title: 'JÁ UTILIZADO' },
  invalido: { bg: '#B91C1C', fg: '#FFFFFF', icon: '✕', title: 'INVÁLIDO' },
  cancelado: { bg: '#B91C1C', fg: '#FFFFFF', icon: '✕', title: 'CANCELADO' },
  outro_evento: { bg: '#B91C1C', fg: '#FFFFFF', icon: '✕', title: 'OUTRO EVENTO' },
};

/** Resultado em tela cheia (RF-48): verde, amarelo ou vermelho, sempre também em texto e símbolo. */
function ResultScreen({ outcome, eventName, onDone }: { outcome: GateOutcome; eventName: string; onDone: () => void }) {
  const t = TONE[outcome.result];
  useEffect(() => {
    beep(outcome.result);
    // Verde segue sozinho; amarelo e vermelho esperam o toque (ou 8 s), para o validador ler com calma.
    const id = setTimeout(onDone, outcome.result === 'valido' ? 1800 : 8000);
    return () => clearTimeout(id);
  }, [outcome, onDone]);
  return (
    <div
      className="px-gate-result"
      role="alert"
      aria-live="assertive"
      style={{ background: t.bg, color: t.fg }}
      onClick={onDone}
    >
      <p className="px-gate-top">
        {eventName} · Entradas {outcome.counter.entered} de {outcome.counter.total}
      </p>
      <div className="px-gate-icon" aria-hidden="true">
        {t.icon}
      </div>
      <h1 className="px-gate-title">{t.title}</h1>
      <p className="px-gate-msg">{outcome.message}</p>
      {outcome.ticket ? (
        <>
          <p className="px-gate-type">{outcome.ticket.typeName}</p>
          <p className="px-gate-name">{outcome.ticket.holderName}</p>
          <p className="px-gate-code px-mono">{outcome.ticket.shortCode}</p>
        </>
      ) : null}
      {outcome.firstEntry ? (
        <p className="px-gate-msg">
          Primeira entrada às {timeOf(outcome.firstEntry.at)} por {outcome.firstEntry.validatorName}
        </p>
      ) : null}
      {outcome.otherEvent ? <p className="px-gate-msg">Este ingresso é de: {outcome.otherEvent.name}</p> : null}
      {outcome.method === 'manual' ? <p className="px-gate-small">Entrada manual</p> : null}
      <p className="px-gate-small">Toque para continuar</p>
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

  if (access === 'negado') return <Denied />;
  if (access === 'espera')
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );

  return (
    <Layout>
      <div className="px-wrap px-narrow">
        <p>
          <Link to="/portaria">← Trocar de evento</Link>
        </p>
        <h1 className="px-h2">{event?.name ?? 'Portaria'}</h1>
        {event?.salesClosed ? (
          <p className="px-small">
            <span className="px-badge px-badge-neu">Vendas encerradas</span>{' '}
            {event.gateClosesAt
              ? `Validação disponível até ${dateShort(event.gateClosesAt)} ${timeOf(event.gateClosesAt)}.`
              : null}
          </p>
        ) : null}
        <div className="px-gate-counter" role="status" aria-live="polite">
          <b className="px-gate-count">{counter ? counter.entered : '–'}</b> entradas
          {counter ? <span className="px-muted"> de {counter.total} ingressos</span> : null}
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

        <div className="px-tabs" role="tablist" aria-label="Modo">
          <button type="button" role="tab" aria-selected={tab === 'camera'} onClick={() => setTab('camera')}>
            Câmera
          </button>
          <button type="button" role="tab" aria-selected={tab === 'busca'} onClick={() => setTab('busca')}>
            Busca manual
          </button>
        </div>

        <div hidden={tab !== 'camera'}>
          <div className="px-camera">
            <video ref={videoRef} muted playsInline aria-label="Imagem da câmera" />
            <canvas ref={canvasRef} hidden />
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
          <p className="px-small px-muted">
            Aponte a câmera para o QR Code do ingresso. O resultado aparece em tela cheia.
          </p>
        </div>

        {tab === 'busca' ? <ManualSearch eventId={eventId} onOutcome={setOutcome} /> : null}
      </div>
      {outcome ? <ResultScreen outcome={outcome} eventName={event?.name ?? ''} onDone={done} /> : null}
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
        <button type="submit" className="px-btn px-btn-pri" disabled={busy || !q.trim()}>
          Buscar
        </button>
      </form>
      {error ? (
        <p className="px-notice px-notice-err" role="alert">
          {error}
        </p>
      ) : null}
      {hits && hits.length === 0 ? <p className="px-muted">Nenhum ingresso encontrado neste evento.</p> : null}
      <ul className="px-tickets">
        {hits?.map(h => (
          <li key={h.ticketId} className="px-hit">
            <div>
              <b>{h.holderName}</b> · {h.typeName}
              <br />
              <span className="px-mono">{h.shortCode}</span> · {h.cpf ?? 'sem CPF'} · {h.email}
              <br />
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
              className="px-btn px-btn-pri"
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
