import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function Modal({ vm }: { vm: ViewModel }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        zIndex: '70',
        background: 'rgba(11,11,16,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={vm.md?.title}
        style={
          {
            background: '#fff',
            color: '#0B0B10',
            borderRadius: '18px',
            width: '100%',
            maxWidth: `${vm.md?.maxW ?? ''}`,
            maxHeight: '100%',
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 12px 32px rgba(11,11,16,.25)',
          } as CSSProperties
        }
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: '0' }}>
            {vm.md?.eyebrow ? (
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: '#5B5B6E' }}>
                {vm.md?.eyebrow}
              </div>
            ) : null}
            <h2 style={{ margin: '0', fontSize: '20px', fontWeight: '800', lineHeight: '1.2' }}>{vm.md?.title}</h2>
          </div>
          {vm.md?.closable ? (
            <button
              onClick={vm.md?.close}
              aria-label="Fechar"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                border: '1px solid #E4E4EC',
                background: '#fff',
                fontSize: '18px',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        {vm.md?.text ? (
          <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#3F3F50' }}>{vm.md?.text}</p>
        ) : null}
        {vm.md?.hasList ? (
          <ul
            style={{
              margin: '0',
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#3F3F50',
            }}
          >
            {(vm.md?.list ?? []).map((l: Loose, $index: number) => (
              <Fragment key={$index}>
                <li>{l}</li>
              </Fragment>
            ))}
          </ul>
        ) : null}
        {vm.md?.isShare ? (
          <div
            data-screen-label="E05 Pré-visualização de compartilhamento"
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div
              style={{ border: '1px solid #E4E4EC', borderRadius: '14px', overflow: 'hidden', background: '#F7F7FA' }}
            >
              <div
                style={
                  {
                    aspectRatio: '1.91/1',
                    background: `repeating-linear-gradient(135deg,${vm.md?.c1 ?? ''} 0 10px,${vm.md?.c2 ?? ''} 10px 20px)`,
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: '10px',
                  } as CSSProperties
                }
              >
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: '11px',
                    color: '#D4D4DE',
                    background: '#0B0B10CC',
                    padding: '3px 6px',
                    borderRadius: '4px',
                  }}
                >
                  og:image · banner 1200 × 630
                </span>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '12px', color: '#5B5B6E' }}>dominio-partyx</div>
                <div style={{ fontWeight: '800', fontSize: '15px' }}>{vm.md?.ogTitle}</div>
                <div style={{ fontSize: '13px', color: '#3F3F50' }}>{vm.md?.ogDesc}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}>
              {(vm.md?.shareBtns ?? []).map((b: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    onClick={b?.onClick}
                    style={{
                      height: '48px',
                      borderRadius: '10px',
                      border: '1px solid #D4D4DE',
                      background: '#fff',
                      fontWeight: '700',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    {b?.label}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        ) : null}
        {vm.md?.isExport ? (
          <div data-screen-label="ADM23 Exportação" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                background: '#F7F7FA',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              <b>Filtros aplicados</b>
              <br />
              {vm.md?.filters}
            </div>
            {vm.md?.expIdle ? (
              <>
                <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(vm.md?.fmts ?? []).map((x: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <button
                        role="radio"
                        aria-checked={x?.on}
                        onClick={x?.onClick}
                        style={
                          {
                            textAlign: 'left',
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start',
                            padding: '12px',
                            borderRadius: '12px',
                            border: `2px solid ${x?.bd ?? ''}`,
                            background: '#fff',
                            cursor: 'pointer',
                          } as CSSProperties
                        }
                      >
                        <span
                          style={
                            {
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              border: `2px solid ${x?.bd ?? ''}`,
                              flex: 'none',
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            } as CSSProperties
                          }
                        >
                          <span
                            style={
                              {
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: `${x?.dot ?? ''}`,
                              } as CSSProperties
                            }
                          />
                        </span>
                        <span>
                          <b style={{ fontSize: '15px' }}>{x?.label}</b>
                          <br />
                          <span style={{ fontSize: '13px', color: '#5B5B6E' }}>{x?.text}</span>
                        </span>
                      </button>
                    </Fragment>
                  ))}
                </div>
                <label
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    fontSize: '12px',
                    color: '#854D0E',
                    border: '1px dashed #E6C35C',
                    background: '#FFFBEB',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={vm.md?.fail ?? false} onChange={vm.md?.toggleFail} />
                  DEMO · simular falha na geração
                </label>
              </>
            ) : null}
            {vm.md?.expBusy ? (
              <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Gerando arquivo…</span>
                <div style={{ height: '8px', borderRadius: '4px', background: '#EEEEF3', overflow: 'hidden' }}>
                  <div
                    style={{ height: '8px', width: '60%', background: '#7C3AED', animation: 'pxpulse 1s infinite' }}
                  />
                </div>
              </div>
            ) : null}
            {vm.md?.expDone ? (
              <>
                <div
                  style={{
                    border: '1px solid #BBF7D0',
                    background: '#F0FDF4',
                    color: '#14532D',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }}
                >
                  <b>Arquivo pronto.</b> {vm.md?.fname}
                  <br />
                  Gerado em {vm.md?.at}. A lista é um retrato deste momento: vendas, entradas ou cancelamentos
                  posteriores não aparecem.
                </div>
                {vm.md?.isPdf ? (
                  <a href="/docs/emails#contingencia" style={{ fontSize: '14px', fontWeight: '600' }}>
                    Ver modelo do PDF de contingência
                  </a>
                ) : null}
              </>
            ) : null}
            {vm.md?.expFail ? (
              <div
                role="alert"
                style={{
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: '#991B1B',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                }}
              >
                <b>Não foi possível gerar o arquivo.</b> Os filtros foram mantidos. Tente novamente em instantes.
              </div>
            ) : null}
          </div>
        ) : null}
        {vm.md?.hasFields ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {(vm.md?.fields ?? []).map((f: Loose, $index: number) => (
              <Fragment key={$index}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{f?.label}</span>
                  {f?.isText ? (
                    <input
                      type={f?.inputType}
                      value={f?.value ?? ''}
                      onChange={f?.onChange}
                      placeholder={f?.ph}
                      aria-label={f?.label}
                      style={
                        {
                          height: '48px',
                          border: `${f?.bd ?? ''}`,
                          borderRadius: '10px',
                          padding: '0 12px',
                          fontSize: '16px',
                        } as CSSProperties
                      }
                    />
                  ) : null}
                  {f?.isArea ? (
                    <textarea
                      value={f?.value ?? ''}
                      onChange={f?.onChange}
                      rows={3}
                      aria-label={f?.label}
                      style={
                        {
                          border: `${f?.bd ?? ''}`,
                          borderRadius: '10px',
                          padding: '10px 12px',
                          fontSize: '16px',
                          resize: 'vertical',
                        } as CSSProperties
                      }
                    />
                  ) : null}
                  {f?.isSel ? (
                    <select
                      value={f?.value ?? ''}
                      onChange={f?.onChange}
                      aria-label={f?.label}
                      style={
                        {
                          height: '48px',
                          border: `${f?.bd ?? ''}`,
                          borderRadius: '10px',
                          padding: '0 10px',
                          fontSize: '16px',
                          background: '#fff',
                        } as CSSProperties
                      }
                    >
                      {(f?.options ?? []).map((o: Loose, $index: number) => (
                        <Fragment key={$index}>
                          <option value={o?.v ?? ''}>{o?.l}</option>
                        </Fragment>
                      ))}
                    </select>
                  ) : null}
                  {f?.isRO ? (
                    <span
                      style={{
                        minHeight: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid #E4E4EC',
                        background: '#F7F7FA',
                        borderRadius: '10px',
                        padding: '0 12px',
                        fontSize: '15px',
                        color: '#3F3F50',
                      }}
                    >
                      {f?.value}
                    </span>
                  ) : null}
                  {f?.hasErr ? (
                    <span role="alert" style={{ fontSize: '13px', color: '#B91C1C' }}>
                      {f?.err}
                    </span>
                  ) : null}
                  {f?.hasHint ? (
                    <span style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.45' }}>{f?.hint}</span>
                  ) : null}
                </div>
              </Fragment>
            ))}
          </div>
        ) : null}
        {vm.md?.foot ? (
          <div style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.5' }}>{vm.md?.foot}</div>
        ) : null}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {(vm.md?.actions ?? []).map((a: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={a?.onClick}
                style={
                  {
                    height: '48px',
                    padding: '0 18px',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '15px',
                    cursor: 'pointer',
                    background: `${a?.bg ?? ''}`,
                    color: `${a?.fg ?? ''}`,
                    border: `${a?.bd ?? ''}`,
                    flex: `${vm.md?.btnFlex ?? ''}`,
                  } as CSSProperties
                }
              >
                {a?.label}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
