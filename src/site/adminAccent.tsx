import { useMemo, useState, type CSSProperties } from 'react';
import { ACCENT_DEFAULT, accentPalette, accentVars, contrast, normalizeHex, parseHex } from './accent';
import { api, ApiError, type AdminEvent } from './api';

/**
 * Campo "Cor de destaque" do evento (0014): seletor do sistema (RGB e hexadecimal), campo hexadecimal, volta ao padrão, sugestão
 * pela capa salva e a pré-visualização com os mesmos componentes da página (bloco da data, linha de "Quando", link e o quadro de
 * ingressos com "Continuar"). A regra que vale é a do servidor (`#RRGGBB`); aqui a tela só orienta.
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
  const valid = normalizeHex(value);
  const palette = useMemo(() => accentPalette(valid ?? ACCENT_DEFAULT)!, [valid]);
  const custom = valid !== null;
  const [said, setSaid] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const rgb = parseHex(palette.base)!;
  const savedCover = Boolean(event?.bannerUrl) && !bannerRemoved;

  const suggest = async () => {
    if (newFilePending) {
      setSaid('Salve a imagem nova antes: a sugestão usa a capa já salva.');
      return;
    }
    if (!event || !savedCover) return;
    setSuggesting(true);
    setSaid('');
    try {
      const { color } = await api.admin.accentSuggestion(event.id);
      if (color) {
        onChange(color);
        setSaid(`Cor sugerida pela capa: ${color}. Salve para aplicar na página.`);
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
          <div className="px-accent-pick">
            <input
              type="color"
              className="px-accent-swatch"
              aria-label="Escolher a cor no seletor"
              value={palette.base.toLowerCase()}
              onChange={e => onChange(e.target.value.toUpperCase())}
            />
            <div className="px-field">
              <label htmlFor="ev-accentColor">Hexadecimal</label>
              <input
                id="ev-accentColor"
                className="px-mono"
                value={value}
                placeholder={ACCENT_DEFAULT}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="characters"
                onChange={e => onChange(e.target.value)}
                onBlur={() => {
                  if (valid && valid !== value) onChange(valid);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'ev-accentColor-erro ev-accentColor-dica' : 'ev-accentColor-dica'}
              />
              {error ? (
                <small id="ev-accentColor-erro" className="px-error" role="alert">
                  {error}
                </small>
              ) : null}
              <small id="ev-accentColor-dica" className="px-hint">
                {custom
                  ? `RGB ${rgb.join(', ')}. Texto ${textName} sobre a cor: ${ratio(palette.fillContrast)}.`
                  : `Em branco: o roxo da PartyX (${ACCENT_DEFAULT}). Formato #RRGGBB.`}
              </small>
            </div>
          </div>
          <div className="px-actions">
            <button type="button" className="px-btn" disabled={busy || value === ''} onClick={() => onChange('')}>
              Voltar ao padrão
            </button>
            {storageAvailable ? (
              <button
                type="button"
                className="px-btn"
                disabled={busy || suggesting || (!newFilePending && !savedCover)}
                onClick={suggest}
                aria-describedby="ev-accent-sugestao"
              >
                {suggesting ? 'Lendo a capa…' : 'Sugerir pela imagem de capa'}
              </button>
            ) : null}
          </div>
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
              <button type="button" className="px-btn px-self-start" disabled={busy} onClick={() => onChange(palette.fill)}>
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
