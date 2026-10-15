import { useMemo, useState, type CSSProperties } from 'react';
import { ACCENT_DEFAULT, accentPalette, accentVars, contrast, normalizeHex, parseHex } from './accent';
import { ACCENT_FORMAT_ERROR, ACCENT_PRESETS } from './accentPresets';
import ColorArea from './adminColorPicker';
import { api, ApiError, type AdminEvent } from './api';
import { Svg, type IconProps } from './icons';

/** Conta-gotas (só aqui: fica no arquivo do painel, fora do JavaScript do site). */
const IconPipette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4l5 5-3 3-5-5z" />
    <path d="M13 9 6 16v2h2l7-7" />
    <path d="M6 18l-2 2" />
  </Svg>
);

/** Conta-gotas do navegador (EyeDropper API: Chrome e Edge no computador). Onde não existe, o botão não aparece. */
type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> };
const eyeDropper = (): EyeDropperCtor | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

/**
 * Campo "Cor de destaque" do evento (0014): seletor embutido (quadrado de saturação e brilho, barra de matiz, código com a amostra
 * redonda e conta-gotas onde houver), cores prontas, volta ao padrão, sugestão pela capa salva e a pré-visualização com os mesmos
 * componentes da página (bloco da data, linha de "Quando", link e o quadro de ingressos com "Continuar"). Enquanto arrasta, só este
 * campo redesenha (a cor fica em `live`); ao soltar, a cor vai para o formulário. A regra que vale é a do servidor (`#RRGGBB`); aqui
 * a tela só orienta.
 */
export function AccentField({
  value,
  onChange,
  error,
  event,
  newFilePending,
  bannerRemoved,
  storageAvailable,
  busy,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
  event: AdminEvent | null;
  newFilePending: boolean;
  bannerRemoved: boolean;
  storageAvailable: boolean;
  busy: boolean;
}) {
  // Cor do arrasto em andamento (só este campo redesenha); ao soltar, vai para o formulário e volta a nulo.
  const [live, setLive] = useState<string | null>(null);
  const text = live ?? value;
  const empty = text.trim() === '';
  const valid = empty ? null : normalizeHex(text);
  const invalid = !empty && valid === null;
  // Código que não tem como virar #RRGGBB (letra fora de 0-9 e A-F, # no meio, ou 6 dígitos sem formar uma cor): o erro aparece
  // enquanto digita. Só incompleto ("#7C3"), o erro espera o "Salvar". Nunca na saída do campo: o erro surgindo ali empurrava o
  // botão "Salvar" no meio do clique, e o clique se perdia.
  const hopeless = invalid && (/[^#0-9a-f]/i.test(text.trim()) || /.#/.test(text.trim()) || text.trim().replace(/^#/, '').length >= 6);
  // Enquanto o código digitado está incompleto, o seletor e a prévia ficam na última cor válida.
  const [lastValid, setLastValid] = useState(valid ?? ACCENT_DEFAULT);
  const color = empty ? ACCENT_DEFAULT : (valid ?? lastValid);
  if (color !== lastValid) setLastValid(color);
  const palette = useMemo(() => accentPalette(color)!, [color]);
  const custom = !empty;
  const [said, setSaid] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [canDrop] = useState(() => eyeDropper() !== undefined);
  const rgb = parseHex(palette.base)!;
  const savedCover = Boolean(event?.bannerUrl) && !bannerRemoved;
  const shownError = error || (hopeless ? ACCENT_FORMAT_ERROR : '');

  /** Cor escolhida por botão (pronta, conta-gotas, sugestão, padrão): direto para o formulário. */
  const choose = (next: string) => {
    setLive(null);
    onChange(next);
  };

  const drop = async () => {
    const Ctor = eyeDropper();
    if (!Ctor) return;
    try {
      const hex = normalizeHex((await new Ctor().open()).sRGBHex);
      if (hex) choose(hex);
    } catch {
      // Esc ou clique fora: nada muda.
    }
  };

  const suggest = async () => {
    if (newFilePending) {
      setSaid('Salve a imagem nova antes: a sugestão usa a capa já salva.');
      return;
    }
    if (!event || !savedCover) return;
    setSuggesting(true);
    setSaid('');
    try {
      const { color: suggested } = await api.admin.accentSuggestion(event.id);
      if (suggested) {
        choose(suggested);
        setSaid(`Cor sugerida pela capa: ${suggested}. Salve para aplicar na página.`);
      } else setSaid('A capa não tem uma cor viva para sugerir (só preto, branco ou cinza). Escolha no seletor.');
    } catch (err) {
      setSaid(err instanceof ApiError ? err.message : 'Não foi possível sugerir a cor agora. Tente de novo.');
    } finally {
      setSuggesting(false);
    }
  };

  const adjusted = custom && palette.fill !== palette.base;
  const otherNotes = palette.notes.filter((_, i) => !(adjusted && i === 0));
  const textName = palette.onFill === '#FFFFFF' ? 'branco' : 'preto';

  return (
    <fieldset className="px-field-wide px-fieldset px-accent-edit">
      <legend>Cor de destaque</legend>
      <small className="px-muted">
        Vale só na página deste evento: bloco da data, cronômetro, linhas de Quando, Onde e Classificação, aviso de menores,
        links e o botão Continuar. No card da vitrine, só o bloco da data. Cabeçalho, menu e rodapé ficam com as cores da
        PartyX.
      </small>
      <div className="px-accent-grid">
        <div className="px-accent-controls">
          <div className="px-color" role="group" aria-label="Seletor de cor">
            <ColorArea
              color={color}
              onChange={setLive}
              onChangeEnd={hex => {
                setLive(null);
                onChange(hex);
              }}
            />
            <div className="px-field px-color-code">
              <label htmlFor="ev-accentColor">Código da cor</label>
              <div className="px-color-code-row">
                <span className="px-color-dot" style={{ background: color }} aria-hidden="true" />
                <input
                  id="ev-accentColor"
                  className="px-mono"
                  value={text}
                  placeholder={ACCENT_DEFAULT}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="characters"
                  onChange={e => onChange(e.target.value)}
                  onBlur={() => {
                    if (valid && valid !== value) onChange(valid);
                  }}
                  aria-invalid={shownError ? true : undefined}
                  aria-describedby={shownError ? 'ev-accentColor-erro ev-accentColor-dica' : 'ev-accentColor-dica'}
                />
                {canDrop ? (
                  <button
                    type="button"
                    className="px-btn px-color-drop"
                    aria-label="Pegar uma cor da tela"
                    title="Pegar uma cor da tela"
                    disabled={busy}
                    onClick={drop}
                  >
                    <IconPipette />
                  </button>
                ) : null}
              </div>
              {shownError ? (
                <small id="ev-accentColor-erro" className="px-error" role="alert">
                  {shownError}
                </small>
              ) : null}
              <small id="ev-accentColor-dica" className="px-hint">
                {custom && !invalid
                  ? `RGB ${rgb.join(', ')}. Texto ${textName} sobre a cor: ${ratio(palette.fillContrast)}.`
                  : `Em branco: o roxo da PartyX (${ACCENT_DEFAULT}). Formato #RRGGBB, com ou sem o #.`}
              </small>
            </div>
            <div className="px-color-presets" role="group" aria-labelledby="ev-accent-prontas">
              <span id="ev-accent-prontas" className="px-color-label">
                Cores prontas
              </span>
              <div className="px-color-swatches">
                {ACCENT_PRESETS.map(p => {
                  const isDefault = p.hex === ACCENT_DEFAULT;
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      className="px-color-swatch"
                      style={{ '--swatch': p.hex } as CSSProperties}
                      aria-label={p.name}
                      title={p.name}
                      aria-pressed={isDefault ? empty || valid === p.hex : valid === p.hex}
                      disabled={busy}
                      onClick={() => choose(isDefault ? '' : p.hex)}
                    />
                  );
                })}
              </div>
            </div>
            <button type="button" className="px-btn px-color-reset" disabled={busy || text === ''} onClick={() => choose('')}>
              Voltar ao padrão
            </button>
          </div>
          {storageAvailable ? (
            <div className="px-actions">
              <button
                type="button"
                className="px-btn"
                disabled={busy || suggesting || (!newFilePending && !savedCover)}
                onClick={suggest}
                aria-describedby="ev-accent-sugestao"
              >
                {suggesting ? 'Lendo a capa…' : 'Sugerir pela imagem de capa'}
              </button>
            </div>
          ) : null}
          <p id="ev-accent-sugestao" className="px-small px-muted" role="status" aria-live="polite">
            {said ||
              (storageAvailable && !newFilePending && !savedCover
                ? 'Para sugerir pela capa, salve o evento com uma imagem de capa.'
                : '')}
          </p>
          {adjusted ? (
            <div className="px-notice px-notice-warn" role="status">
              <b>Contraste insuficiente</b>
              <span>{palette.notes[0]}</span>
              <button type="button" className="px-btn px-self-start" disabled={busy} onClick={() => choose(palette.fill)}>
                Usar {palette.fill} no campo
              </button>
            </div>
          ) : null}
          {custom && otherNotes.length > 0 ? (
            <ul className="px-accent-notes">
              {otherNotes.map(n => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <AccentPreview palette={custom ? palette : null} />
      </div>
    </fieldset>
  );
}

const ratio = (n: number) => `${(Math.floor(n * 10) / 10).toFixed(1).replace('.', ',')}:1`;

/**
 * Pré-visualização com as classes da página do evento: o fundo preto com o bloco da data, a linha de "Quando" e um link; o quadro
 * branco com o aviso de últimas unidades e o botão "Continuar" (ativo e desabilitado). Sem cor própria, os tokens padrão.
 */
function AccentPreview({ palette }: { palette: ReturnType<typeof accentPalette> }) {
  return (
    <div
      className="px-accent-preview px-event-scope"
      data-accent={palette ? palette.base : undefined}
      style={palette ? (accentVars(palette) as CSSProperties) : undefined}
      aria-label="Pré-visualização da cor na página do evento"
      role="group"
    >
      <div className="px-accent-dark">
        <span className="px-stub px-stub-lg" aria-hidden="true">
          <span className="px-stub-day">20</span>
          <span className="px-stub-month">out</span>
        </span>
        <div className="px-accent-dark-body">
          <dl className="px-facts px-accent-facts">
            <div>
              <dt>Quando</dt>
              <dd>Sábado, 20 de outubro</dd>
            </div>
          </dl>
          <a href="#ev-accentColor" className="px-textlink" onClick={e => e.preventDefault()}>
            Termo de ciência para menores
          </a>
        </div>
      </div>
      <div className="px-accent-card">
        <p className="px-type-flag">Últimas unidades deste lote</p>
        <span className="px-btn px-btn-pri px-continue" aria-hidden="true">
          Continuar
        </span>
        <button type="button" className="px-btn px-btn-pri px-continue" disabled tabIndex={-1} aria-hidden="true">
          Continuar (desabilitado)
        </button>
      </div>
      {palette ? (
        <p className="px-accent-legend">
          Fundo {palette.fill}, texto {palette.onFill === '#FFFFFF' ? 'branco' : 'preto'} a {ratio(palette.fillContrast)};
          links no preto {palette.onDark} a {ratio(contrast(palette.onDark, '#0B0B10'))}.
        </p>
      ) : (
        <p className="px-accent-legend">Roxo da PartyX, como em todos os eventos sem cor própria.</p>
      )}
    </div>
  );
}
