import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function Drawer({ vm }: { vm: ViewModel }) {
  return (
    <div
      onClick={vm.dr?.close}
      style={
        {
          position: 'fixed',
          inset: '0',
          zIndex: '60',
          background: 'rgba(11,11,16,.5)',
          display: 'flex',
          justifyContent: `${vm.dr?.side ?? ''}`,
        } as CSSProperties
      }
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={vm.dr?.title}
        onClick={vm.dr?.stop}
        style={
          {
            width: 'min(480px,100%)',
            height: '100%',
            background: `${vm.dr?.bg ?? ''}`,
            color: `${vm.dr?.fg ?? ''}`,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 32px rgba(11,11,16,.25)',
          } as CSSProperties
        }
      >
        <div
          style={
            {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '16px',
              borderBottom: `1px solid ${vm.dr?.line ?? ''}`,
            } as CSSProperties
          }
        >
          <div style={{ minWidth: '0' }}>
            {vm.dr?.eyebrow ? (
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', opacity: '.75' }}>
                {vm.dr?.eyebrow}
              </div>
            ) : null}
            <h2 style={{ margin: '0', fontSize: '20px', fontWeight: '800' }}>{vm.dr?.title}</h2>
            {vm.dr?.sub ? (
              <div style={{ fontSize: '13px', opacity: '.8', marginTop: '2px', lineHeight: '1.45' }}>{vm.dr?.sub}</div>
            ) : null}
          </div>
          <button
            onClick={vm.dr?.close}
            aria-label="Fechar"
            style={
              {
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                border: `1px solid ${vm.dr?.line ?? ''}`,
                background: 'transparent',
                color: 'inherit',
                fontSize: '18px',
                cursor: 'pointer',
                flex: 'none',
              } as CSSProperties
            }
          >
            ×
          </button>
        </div>
        <div
          style={{
            flex: '1',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {vm.dr?.isMenu ? (
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {(vm.dr?.items ?? []).map((n: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    onClick={n?.onClick}
                    style={
                      {
                        textAlign: 'left',
                        minHeight: '48px',
                        padding: `0 ${n?.pad ?? ''}`,
                        borderRadius: '10px',
                        border: '0',
                        background: `${n?.bg ?? ''}`,
                        color: 'inherit',
                        fontWeight: `${n?.fw ?? ''}`,
                        fontSize: `${n?.fs ?? ''}`,
                        cursor: 'pointer',
                      } as CSSProperties
                    }
                  >
                    {n?.label}
                  </button>
                </Fragment>
              ))}
            </nav>
          ) : null}
          {(vm.dr?.blocks ?? []).map((b: Loose, $index: number) => (
            <Fragment key={$index}>
              {b?.isNote ? (
                <div
                  style={
                    {
                      borderRadius: '12px',
                      padding: '12px 14px',
                      background: `${b?.bg ?? ''}`,
                      color: `${b?.fg ?? ''}`,
                      border: `1px solid ${b?.bd ?? ''}`,
                      fontSize: '14px',
                      lineHeight: '1.5',
                    } as CSSProperties
                  }
                >
                  <b>{b?.title}</b> {b?.text}
                </div>
              ) : null}
              {b?.isKV ? (
                <div>
                  {b?.title ? (
                    <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '800' }}>{b?.title}</h3>
                  ) : null}
                  <dl style={{ margin: '0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
                    {(b?.items ?? []).map((i: Loose, $index: number) => (
                      <Fragment key={$index}>
                        <div style={{ gridColumn: `${i?.span ?? ''}`, minWidth: '0' } as CSSProperties}>
                          <dt style={{ fontSize: '12px', fontWeight: '600', color: '#5B5B6E' }}>{i?.k}</dt>
                          <dd
                            style={
                              {
                                margin: '2px 0 0',
                                fontSize: '15px',
                                fontWeight: '600',
                                fontFamily: `${i?.ff ?? ''}`,
                                overflowWrap: 'anywhere',
                              } as CSSProperties
                            }
                          >
                            {i?.v}
                            {i?.hasBadge ? (
                              <span
                                style={
                                  {
                                    marginLeft: '6px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: `${i?.badge?.bg ?? ''}`,
                                    color: `${i?.badge?.fg ?? ''}`,
                                  } as CSSProperties
                                }
                              >
                                {i?.badge?.label}
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              ) : null}
              {b?.isTimeline ? (
                <div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: '800' }}>{b?.title}</h3>
                  {(b?.items ?? []).map((i: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: '10px', padding: '6px 0' }}>
                        <span
                          style={
                            {
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: `${i?.dot ?? ''}`,
                              marginTop: '5px',
                            } as CSSProperties
                          }
                        />
                        <span style={{ fontSize: '14px', lineHeight: '1.45' }}>
                          {i?.l}
                          <br />
                          <span style={{ fontSize: '12px', color: '#5B5B6E' }}>{i?.t}</span>
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              ) : null}
              {b?.isForm ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {(b?.fields ?? []).map((f: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600' }}>{f?.label}</span>
                        {f?.isText ? (
                          <span
                            style={
                              {
                                display: 'flex',
                                alignItems: 'center',
                                border: `${f?.bd ?? ''}`,
                                borderRadius: '10px',
                                height: '48px',
                                background: '#fff',
                                overflow: 'hidden',
                              } as CSSProperties
                            }
                          >
                            {f?.hasPrefix ? (
                              <span style={{ paddingLeft: '12px', color: '#5B5B6E' }}>{f?.prefix}</span>
                            ) : null}
                            <input
                              type={f?.inputType}
                              value={f?.value ?? ''}
                              onChange={f?.onChange}
                              placeholder={f?.ph}
                              aria-label={f?.label}
                              style={
                                {
                                  flex: '1',
                                  minWidth: '0',
                                  height: '46px',
                                  border: '0',
                                  outline: '0',
                                  padding: '0 12px',
                                  fontSize: '16px',
                                  background: 'transparent',
                                  fontFamily: `${f?.ff ?? ''}`,
                                } as CSSProperties
                              }
                            />
                          </span>
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
                        {f?.isToggle ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={f?.on}
                            onClick={f?.toggle}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              background: 'none',
                              border: '0',
                              padding: '0',
                              minHeight: '44px',
                              cursor: 'pointer',
                              fontSize: '15px',
                              color: '#0B0B10',
                            }}
                          >
                            <span
                              style={
                                {
                                  width: '44px',
                                  height: '26px',
                                  borderRadius: '13px',
                                  background: `${f?.tBg ?? ''}`,
                                  position: 'relative',
                                  flex: 'none',
                                } as CSSProperties
                              }
                            >
                              <span
                                style={
                                  {
                                    position: 'absolute',
                                    top: '3px',
                                    left: `${f?.tX ?? ''}`,
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                  } as CSSProperties
                                }
                              />
                            </span>
                            {f?.toggleLabel}
                          </button>
                        ) : null}
                        {f?.isRO ? (
                          <span
                            style={
                              {
                                minHeight: '48px',
                                display: 'flex',
                                alignItems: 'center',
                                border: '1px solid #E4E4EC',
                                background: '#F7F7FA',
                                borderRadius: '10px',
                                padding: '0 12px',
                                fontSize: '15px',
                                color: '#3F3F50',
                                fontFamily: `${f?.ff ?? ''}`,
                              } as CSSProperties
                            }
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
            </Fragment>
          ))}
        </div>
        {vm.dr?.hasActions ? (
          <div
            style={
              {
                padding: '12px 16px',
                borderTop: `1px solid ${vm.dr?.line ?? ''}`,
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              } as CSSProperties
            }
          >
            {(vm.dr?.actions ?? []).map((a: Loose, $index: number) => (
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
                      flex: `${vm.dr?.btnFlex ?? ''}`,
                    } as CSSProperties
                  }
                >
                  {a?.label}
                </button>
              </Fragment>
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
