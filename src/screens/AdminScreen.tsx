import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function AdminScreen({ vm }: { vm: ViewModel }) {
  return (
    <div data-screen-label={vm.ap?.label} style={{ display: 'flex', minHeight: '100%', alignItems: 'stretch' }}>
      {vm.desk ? (
        <aside
          style={
            {
              width: '248px',
              flex: 'none',
              background: '#0B0B10',
              color: '#fff',
              position: 'sticky',
              top: '0',
              height: `${vm.sideH ?? ''}`,
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 12px',
              gap: '2px',
              overflowY: 'auto',
            } as CSSProperties
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px 18px' }}>
            <img src="/brand/partyx-logo.png" width={58} height={32} alt="PartyX" style={{ display: 'block' }} />
            <span style={{ fontSize: '12px', color: '#A6A6BA', fontWeight: '600' }}>Admin</span>
          </div>
          {(vm.admNav ?? []).map((n: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={n?.onClick}
                style={
                  {
                    textAlign: 'left',
                    minHeight: '42px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '0',
                    background: `${n?.bg ?? ''}`,
                    color: `${n?.fg ?? ''}`,
                    fontWeight: `${n?.fw ?? ''}`,
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: `${n?.sh ?? ''}`,
                  } as CSSProperties
                }
              >
                {n?.label}
              </button>
              {n?.hasSub ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    paddingLeft: '14px',
                    margin: '2px 0 4px',
                    borderLeft: '1px solid #2C2C3A',
                    marginLeft: '16px',
                  }}
                >
                  {(n?.sub ?? []).map((x: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <button
                        onClick={x?.onClick}
                        style={
                          {
                            textAlign: 'left',
                            minHeight: '36px',
                            padding: '0 10px',
                            border: '0',
                            background: 'transparent',
                            color: `${x?.fg ?? ''}`,
                            fontWeight: `${x?.fw ?? ''}`,
                            fontSize: '13px',
                            cursor: 'pointer',
                          } as CSSProperties
                        }
                      >
                        {x?.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              ) : null}
            </Fragment>
          ))}
          <div
            style={{
              marginTop: 'auto',
              borderTop: '1px solid #1E1E2A',
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <button
              onClick={vm.go?.V01}
              style={{
                textAlign: 'left',
                minHeight: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #2C2C3A',
                background: 'transparent',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Validar ingressos
            </button>
            <button
              onClick={vm.go?.ADM24}
              style={{
                textAlign: 'left',
                minHeight: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '0',
                background: 'transparent',
                color: '#D4D4DE',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Minha conta
            </button>
            <button
              onClick={vm.admLogout}
              style={{
                textAlign: 'left',
                minHeight: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '0',
                background: 'transparent',
                color: '#D4D4DE',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Sair
            </button>
            <div style={{ padding: '8px 12px 0', fontSize: '12px', color: '#A6A6BA' }}>{vm.admUser}</div>
          </div>
        </aside>
      ) : null}
      <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
        {vm.notDesk ? (
          <div
            style={{
              position: 'sticky',
              top: '0',
              zIndex: '20',
              height: '60px',
              background: '#0B0B10',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '0 10px',
            }}
          >
            <button
              onClick={vm.openAdmMenu}
              aria-label="Abrir menu"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                border: '1px solid #2C2C3A',
                background: 'transparent',
                color: '#fff',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              ≡
            </button>
            <img src="/brand/partyx-logo.png" width={51} height={28} alt="PartyX" style={{ display: 'block' }} />
            <span
              style={{
                fontSize: '14px',
                color: '#A6A6BA',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: '0',
              }}
            >
              {vm.ap?.section}
            </span>
          </div>
        ) : null}
        <div
          style={
            {
              width: '100%',
              maxWidth: '1240px',
              margin: '0 auto',
              padding: `${vm.ap?.pad ?? ''}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            } as CSSProperties
          }
        >
          {vm.ap?.back?.show ? (
            <button
              onClick={vm.ap?.back?.onClick}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: '0',
                padding: '0',
                minHeight: '36px',
                color: '#5B21B6',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ‹ {vm.ap?.back?.label}
            </button>
          ) : null}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: '14px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: '0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {vm.ap?.eyebrow ? (
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#5B5B6E' }}>
                  {vm.ap?.eyebrow}
                </span>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1
                  style={{
                    margin: '0',
                    fontSize: 'clamp(24px,3vw,32px)',
                    fontWeight: '900',
                    fontStretch: '108%',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {vm.ap?.title}
                </h1>
                {(vm.ap?.badges ?? []).map((b: Loose, $index: number) => (
                  <Fragment key={$index}>
                    <span
                      style={
                        {
                          fontSize: '12px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: `${b?.bg ?? ''}`,
                          color: `${b?.fg ?? ''}`,
                        } as CSSProperties
                      }
                    >
                      {b?.label}
                    </span>
                  </Fragment>
                ))}
              </div>
              {vm.ap?.sub ? (
                <span style={{ fontSize: '14px', color: '#5B5B6E', lineHeight: '1.5' }}>{vm.ap?.sub}</span>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(vm.ap?.actions ?? []).map((a: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    onClick={a?.onClick}
                    style={
                      {
                        height: '44px',
                        padding: '0 16px',
                        borderRadius: '10px',
                        fontWeight: '700',
                        fontSize: '14px',
                        cursor: 'pointer',
                        background: `${a?.bg ?? ''}`,
                        color: `${a?.fg ?? ''}`,
                        border: `${a?.bd ?? ''}`,
                      } as CSSProperties
                    }
                  >
                    {a?.label}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
          {(vm.ap?.alerts ?? []).map((al: Loose, $index: number) => (
            <Fragment key={$index}>
              <div
                role="alert"
                style={
                  {
                    borderRadius: '12px',
                    padding: '12px 14px',
                    background: `${al?.bg ?? ''}`,
                    color: `${al?.fg ?? ''}`,
                    border: `1px solid ${al?.bd ?? ''}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  } as CSSProperties
                }
              >
                <span style={{ fontSize: '14px', lineHeight: '1.5', flex: '1 1 280px' }}>
                  <b>{al?.title}</b> {al?.text}
                </span>
                {al?.hasAct ? (
                  <button
                    onClick={al?.act?.onClick}
                    style={
                      {
                        height: '40px',
                        padding: '0 14px',
                        borderRadius: '8px',
                        background: '#fff',
                        border: `1px solid ${al?.bd ?? ''}`,
                        color: `${al?.fg ?? ''}`,
                        fontWeight: '700',
                        cursor: 'pointer',
                      } as CSSProperties
                    }
                  >
                    {al?.act?.label}
                  </button>
                ) : null}
              </div>
            </Fragment>
          ))}
          {vm.ap?.hasTabs ? (
            <div
              role="tablist"
              style={{ display: 'flex', gap: '2px', borderBottom: '1px solid #E4E4EC', overflowX: 'auto' }}
            >
              {(vm.ap?.tabs ?? []).map((t: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    role="tab"
                    onClick={t?.onClick}
                    style={
                      {
                        height: '46px',
                        padding: '0 12px',
                        background: 'none',
                        border: '0',
                        borderBottom: `2px solid ${t?.bc ?? ''}`,
                        fontWeight: `${t?.fw ?? ''}`,
                        fontSize: '14px',
                        color: `${t?.fg ?? ''}`,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      } as CSSProperties
                    }
                  >
                    {t?.label}
                  </button>
                </Fragment>
              ))}
            </div>
          ) : null}
          {vm.ap?.filters?.has ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'flex-end',
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '14px',
                padding: '12px',
              }}
            >
              {vm.ap?.filters?.hasSearch ? (
                <label style={{ flex: '2 1 220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#5B5B6E' }}>Buscar</span>
                  <input
                    value={vm.ap?.filters?.search?.value ?? ''}
                    onChange={vm.ap?.filters?.search?.onChange}
                    placeholder={vm.ap?.filters?.search?.ph}
                    style={{
                      height: '44px',
                      border: '1px solid #D4D4DE',
                      borderRadius: '10px',
                      padding: '0 12px',
                      fontSize: '15px',
                    }}
                  />
                </label>
              ) : null}
              {vm.ap?.filters?.showSelects ? (
                <>
                  {(vm.ap?.filters?.selects ?? []).map((f: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <label style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#5B5B6E' }}>{f?.label}</span>
                        <select
                          value={f?.value ?? ''}
                          onChange={f?.onChange}
                          style={{
                            height: '44px',
                            border: '1px solid #D4D4DE',
                            borderRadius: '10px',
                            padding: '0 10px',
                            fontSize: '15px',
                            background: '#fff',
                          }}
                        >
                          {(f?.options ?? []).map((o: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <option value={o?.v ?? ''}>{o?.l}</option>
                            </Fragment>
                          ))}
                        </select>
                      </label>
                    </Fragment>
                  ))}
                </>
              ) : null}
              {vm.ap?.filters?.drawerBtn ? (
                <button
                  onClick={vm.ap?.filters?.openDrawer}
                  style={{
                    flex: '1 1 120px',
                    height: '44px',
                    borderRadius: '10px',
                    border: '1px solid #D4D4DE',
                    background: '#fff',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Filtros {vm.ap?.filters?.count}
                </button>
              ) : null}
              {vm.ap?.filters?.hasChips ? (
                <button
                  onClick={vm.ap?.filters?.clear}
                  style={{
                    height: '44px',
                    padding: '0 10px',
                    background: 'none',
                    border: '0',
                    color: '#5B21B6',
                    fontWeight: '600',
                    fontSize: '14px',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            style={
              {
                display: 'grid',
                gridTemplateColumns: `${vm.ap?.grid ?? ''}`,
                gap: '16px',
                alignItems: 'start',
              } as CSSProperties
            }
          >
            {(vm.ap?.blocks ?? []).map((b: Loose, $index: number) => (
              <Fragment key={$index}>
                <div style={{ gridColumn: `${b?.span ?? ''}`, minWidth: '0' } as CSSProperties}>
                  {b?.isKpis ? (
                    <div
                      style={
                        {
                          display: 'grid',
                          gridTemplateColumns: `repeat(auto-fit,minmax(${b?.min ?? ''},1fr))`,
                          gap: '12px',
                        } as CSSProperties
                      }
                    >
                      {(b?.items ?? []).map((k: Loose, $index: number) => (
                        <Fragment key={$index}>
                          <div
                            style={{
                              background: '#fff',
                              border: '1px solid #E4E4EC',
                              borderRadius: '14px',
                              padding: '14px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#5B5B6E' }}>{k?.label}</span>
                            <span
                              style={
                                {
                                  fontSize: 'clamp(20px,2vw,26px)',
                                  fontWeight: '900',
                                  fontVariantNumeric: 'tabular-nums',
                                  color: `${k?.color ?? ''}`,
                                  overflowWrap: 'anywhere',
                                  lineHeight: '1.15',
                                } as CSSProperties
                              }
                            >
                              {k?.value}
                            </span>
                            <span style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.4' }}>{k?.def}</span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  ) : null}
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
                          lineHeight: '1.55',
                        } as CSSProperties
                      }
                    >
                      <b>{b?.title}</b> {b?.text}
                    </div>
                  ) : null}
                  {b?.isCard ? (
                    <section
                      style={{
                        background: '#fff',
                        border: '1px solid #E4E4EC',
                        borderRadius: '14px',
                        overflow: 'hidden',
                      }}
                    >
                      {b?.hasHead ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '14px 16px',
                            borderBottom: '1px solid #EEEEF3',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ minWidth: '0' }}>
                            <h2 style={{ margin: '0', fontSize: '16px', fontWeight: '800' }}>{b?.title}</h2>
                            {b?.sub ? <span style={{ fontSize: '13px', color: '#5B5B6E' }}>{b?.sub}</span> : null}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {(b?.actions ?? []).map((a: Loose, $index: number) => (
                              <Fragment key={$index}>
                                <button
                                  onClick={a?.onClick}
                                  style={
                                    {
                                      height: '38px',
                                      padding: '0 12px',
                                      borderRadius: '8px',
                                      fontWeight: '700',
                                      fontSize: '13px',
                                      cursor: 'pointer',
                                      background: `${a?.bg ?? ''}`,
                                      color: `${a?.fg ?? ''}`,
                                      border: `${a?.bd ?? ''}`,
                                    } as CSSProperties
                                  }
                                >
                                  {a?.label}
                                </button>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {b?.isLoading ? (
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {(b?.skel ?? []).map((_k: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <div
                                style={{
                                  height: '36px',
                                  borderRadius: '8px',
                                  background: '#EEEEF3',
                                  animation: 'pxpulse 1.4s ease-in-out infinite',
                                }}
                              />
                            </Fragment>
                          ))}
                        </div>
                      ) : null}
                      {b?.isError ? (
                        <div
                          style={{
                            padding: '28px 16px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            alignItems: 'center',
                          }}
                        >
                          <b style={{ fontSize: '16px' }}>Não foi possível carregar os dados</b>
                          <span style={{ fontSize: '14px', color: '#5B5B6E', maxWidth: '420px' }}>
                            Verifique sua conexão. Os filtros escolhidos foram mantidos.
                          </span>
                          <button
                            onClick={b?.retry}
                            style={{
                              marginTop: '6px',
                              height: '44px',
                              padding: '0 16px',
                              borderRadius: '10px',
                              background: '#0B0B10',
                              color: '#fff',
                              border: '0',
                              fontWeight: '700',
                              cursor: 'pointer',
                            }}
                          >
                            Tentar novamente
                          </button>
                        </div>
                      ) : null}
                      {b?.isEmpty ? (
                        <div
                          style={{
                            padding: '32px 16px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            alignItems: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '12px',
                              background: '#EDE9FE',
                              color: '#5B21B6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '900',
                            }}
                          >
                            0
                          </div>
                          <b style={{ fontSize: '16px' }}>{b?.emptyTitle}</b>
                          <span style={{ fontSize: '14px', color: '#5B5B6E', maxWidth: '420px', lineHeight: '1.5' }}>
                            {b?.emptyText}
                          </span>
                          {b?.hasEmptyAct ? (
                            <button
                              onClick={b?.emptyAct?.onClick}
                              style={{
                                marginTop: '6px',
                                height: '44px',
                                padding: '0 16px',
                                borderRadius: '10px',
                                background: '#7C3AED',
                                color: '#fff',
                                border: '0',
                                fontWeight: '700',
                                cursor: 'pointer',
                              }}
                            >
                              {b?.emptyAct?.label}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {b?.showGrid ? (
                        <div style={{ overflowX: 'auto' }}>
                          <div role="table" style={{ minWidth: `${b?.minW ?? ''}` } as CSSProperties}>
                            <div
                              role="row"
                              style={
                                {
                                  display: 'grid',
                                  gridTemplateColumns: `${b?.gcols ?? ''}`,
                                  gap: '12px',
                                  padding: '10px 16px',
                                  background: '#F7F7FA',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  color: '#5B5B6E',
                                  textTransform: 'uppercase',
                                  letterSpacing: '.04em',
                                } as CSSProperties
                              }
                            >
                              {(b?.cols ?? []).map((c: Loose, $index: number) => (
                                <Fragment key={$index}>
                                  <span role="columnheader" style={{ textAlign: `${c?.align ?? ''}` } as CSSProperties}>
                                    {c?.label}
                                  </span>
                                </Fragment>
                              ))}
                            </div>
                            {(b?.rows ?? []).map((r: Loose, $index: number) => (
                              <Fragment key={$index}>
                                <div
                                  role="row"
                                  onClick={r?.onClick}
                                  style={
                                    {
                                      display: 'grid',
                                      gridTemplateColumns: `${b?.gcols ?? ''}`,
                                      gap: '12px',
                                      padding: '11px 16px',
                                      borderTop: '1px solid #EEEEF3',
                                      alignItems: 'center',
                                      fontSize: '14px',
                                      cursor: `${r?.cur ?? ''}`,
                                      background: `${r?.bg ?? ''}`,
                                    } as CSSProperties
                                  }
                                >
                                  {(r?.cells ?? []).map((c: Loose, $index: number) => (
                                    <Fragment key={$index}>
                                      <div
                                        role="cell"
                                        style={
                                          {
                                            textAlign: `${c?.align ?? ''}`,
                                            minWidth: '0',
                                            overflowWrap: 'anywhere',
                                          } as CSSProperties
                                        }
                                      >
                                        {c?.isText ? (
                                          <span
                                            style={
                                              {
                                                fontFamily: `${c?.ff ?? ''}`,
                                                fontWeight: `${c?.fw ?? ''}`,
                                                fontVariantNumeric: 'tabular-nums',
                                              } as CSSProperties
                                            }
                                          >
                                            {c?.t}
                                          </span>
                                        ) : null}
                                        {c?.isBadge ? (
                                          <span
                                            style={
                                              {
                                                display: 'inline-block',
                                                fontSize: '12px',
                                                fontWeight: '700',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                background: `${c?.badge?.bg ?? ''}`,
                                                color: `${c?.badge?.fg ?? ''}`,
                                              } as CSSProperties
                                            }
                                          >
                                            {c?.badge?.label}
                                          </span>
                                        ) : null}
                                        {c?.isBar ? (
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span
                                              style={{
                                                flex: '1',
                                                height: '8px',
                                                borderRadius: '4px',
                                                background: '#EEEEF3',
                                                overflow: 'hidden',
                                                display: 'flex',
                                              }}
                                            >
                                              <span
                                                style={
                                                  { width: `${c?.w ?? ''}`, background: '#7C3AED' } as CSSProperties
                                                }
                                              />
                                              <span
                                                style={
                                                  { width: `${c?.w2 ?? ''}`, background: '#C4B5FD' } as CSSProperties
                                                }
                                              />
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#5B5B6E', whiteSpace: 'nowrap' }}>
                                              {c?.t}
                                            </span>
                                          </span>
                                        ) : null}
                                        {c?.isAct ? (
                                          <span
                                            style={{
                                              display: 'flex',
                                              gap: '6px',
                                              justifyContent: 'flex-end',
                                              flexWrap: 'wrap',
                                            }}
                                          >
                                            {(c?.acts ?? []).map((a: Loose, $index: number) => (
                                              <Fragment key={$index}>
                                                <button
                                                  onClick={a?.onClick}
                                                  style={
                                                    {
                                                      height: '34px',
                                                      padding: '0 10px',
                                                      borderRadius: '8px',
                                                      border: `1px solid ${a?.bd ?? ''}`,
                                                      background: '#fff',
                                                      color: `${a?.fg ?? ''}`,
                                                      fontWeight: '600',
                                                      fontSize: '13px',
                                                      cursor: 'pointer',
                                                      whiteSpace: 'nowrap',
                                                    } as CSSProperties
                                                  }
                                                >
                                                  {a?.label}
                                                </button>
                                              </Fragment>
                                            ))}
                                          </span>
                                        ) : null}
                                        {c?.hasSub ? (
                                          <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '2px' }}>
                                            {c?.sub}
                                          </div>
                                        ) : null}
                                      </div>
                                    </Fragment>
                                  ))}
                                </div>
                              </Fragment>
                            ))}
                            {b?.hasFoot ? (
                              <div
                                style={
                                  {
                                    display: 'grid',
                                    gridTemplateColumns: `${b?.gcols ?? ''}`,
                                    gap: '12px',
                                    padding: '12px 16px',
                                    borderTop: '2px solid #E4E4EC',
                                    fontWeight: '800',
                                    fontSize: '14px',
                                  } as CSSProperties
                                }
                              >
                                {(b?.foot ?? []).map((c: Loose, $index: number) => (
                                  <Fragment key={$index}>
                                    <span
                                      style={
                                        {
                                          textAlign: `${c?.align ?? ''}`,
                                          fontVariantNumeric: 'tabular-nums',
                                        } as CSSProperties
                                      }
                                    >
                                      {c?.t}
                                    </span>
                                  </Fragment>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {b?.showCards ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {(b?.mrows ?? []).map((r: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <div
                                onClick={r?.onClick}
                                style={
                                  {
                                    padding: '14px 16px',
                                    borderTop: '1px solid #EEEEF3',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    cursor: `${r?.cur ?? ''}`,
                                  } as CSSProperties
                                }
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '10px',
                                    alignItems: 'flex-start',
                                  }}
                                >
                                  <div style={{ minWidth: '0' }}>
                                    <div
                                      style={
                                        {
                                          fontWeight: '700',
                                          fontFamily: `${r?.ff ?? ''}`,
                                          overflowWrap: 'anywhere',
                                        } as CSSProperties
                                      }
                                    >
                                      {r?.title}
                                    </div>
                                    {r?.sub ? <div style={{ fontSize: '13px', color: '#5B5B6E' }}>{r?.sub}</div> : null}
                                  </div>
                                  {r?.hasChev ? <span style={{ color: '#8A8A9E', fontSize: '18px' }}>›</span> : null}
                                </div>
                                {(r?.lines ?? []).map((l: Loose, $index: number) => (
                                  <Fragment key={$index}>
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: '10px',
                                        fontSize: '14px',
                                      }}
                                    >
                                      <span style={{ color: '#5B5B6E' }}>{l?.k}</span>
                                      {l?.isBadge ? (
                                        <span
                                          style={
                                            {
                                              fontSize: '12px',
                                              fontWeight: '700',
                                              padding: '3px 8px',
                                              borderRadius: '6px',
                                              background: `${l?.badge?.bg ?? ''}`,
                                              color: `${l?.badge?.fg ?? ''}`,
                                            } as CSSProperties
                                          }
                                        >
                                          {l?.badge?.label}
                                        </span>
                                      ) : null}
                                      {l?.isText ? (
                                        <span
                                          style={{
                                            fontWeight: '600',
                                            textAlign: 'right',
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {l?.t}
                                        </span>
                                      ) : null}
                                    </div>
                                  </Fragment>
                                ))}
                                {r?.hasActs ? (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                    {(r?.acts ?? []).map((a: Loose, $index: number) => (
                                      <Fragment key={$index}>
                                        <button
                                          onClick={a?.onClick}
                                          style={
                                            {
                                              minHeight: '40px',
                                              padding: '0 12px',
                                              borderRadius: '8px',
                                              border: `1px solid ${a?.bd ?? ''}`,
                                              background: '#fff',
                                              color: `${a?.fg ?? ''}`,
                                              fontWeight: '600',
                                              fontSize: '13px',
                                              cursor: 'pointer',
                                            } as CSSProperties
                                          }
                                        >
                                          {a?.label}
                                        </button>
                                      </Fragment>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </Fragment>
                          ))}
                          {b?.hasFoot ? (
                            <div
                              style={{
                                padding: '12px 16px',
                                borderTop: '2px solid #E4E4EC',
                                fontWeight: '800',
                                fontSize: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span>Total</span>
                              <span>{b?.footText}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {b?.hasPager ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 16px',
                            borderTop: '1px solid #EEEEF3',
                            fontSize: '13px',
                            color: '#5B5B6E',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>{b?.pager?.text}</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={b?.pager?.prev}
                              aria-label="Página anterior"
                              style={
                                {
                                  width: '40px',
                                  height: '40px',
                                  border: '1px solid #D4D4DE',
                                  borderRadius: '10px',
                                  background: '#fff',
                                  cursor: 'pointer',
                                  opacity: `${b?.pager?.pOp ?? ''}`,
                                } as CSSProperties
                              }
                            >
                              ‹
                            </button>
                            <span
                              style={{
                                minWidth: '64px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '700',
                                color: '#0B0B10',
                              }}
                            >
                              {b?.pager?.page}
                            </span>
                            <button
                              onClick={b?.pager?.next}
                              aria-label="Próxima página"
                              style={
                                {
                                  width: '40px',
                                  height: '40px',
                                  border: '1px solid #D4D4DE',
                                  borderRadius: '10px',
                                  background: '#fff',
                                  cursor: 'pointer',
                                  opacity: `${b?.pager?.nOp ?? ''}`,
                                } as CSSProperties
                              }
                            >
                              ›
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {b?.isKV ? (
                        <dl
                          style={{
                            margin: '0',
                            padding: '14px 16px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
                            gap: '14px 18px',
                          }}
                        >
                          {(b?.items ?? []).map((i: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <div style={{ gridColumn: `${i?.span ?? ''}`, minWidth: '0' } as CSSProperties}>
                                <dt style={{ fontSize: '12px', fontWeight: '600', color: '#5B5B6E' }}>{i?.k}</dt>
                                <dd
                                  style={
                                    {
                                      margin: '3px 0 0',
                                      fontSize: '15px',
                                      fontWeight: '600',
                                      fontFamily: `${i?.ff ?? ''}`,
                                      overflowWrap: 'anywhere',
                                      lineHeight: '1.4',
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
                                  {i?.hasLink ? (
                                    <button
                                      onClick={i?.link?.onClick}
                                      style={{
                                        marginLeft: '8px',
                                        background: 'none',
                                        border: '0',
                                        padding: '0',
                                        color: '#5B21B6',
                                        fontWeight: '600',
                                        fontSize: '13px',
                                        textDecoration: 'underline',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {i?.link?.label}
                                    </button>
                                  ) : null}
                                </dd>
                              </div>
                            </Fragment>
                          ))}
                        </dl>
                      ) : null}
                      {b?.isTimeline ? (
                        <ol
                          style={{
                            margin: '0',
                            padding: '10px 16px 14px',
                            listStyle: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          {(b?.items ?? []).map((i: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <li
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '14px 1fr',
                                  gap: '10px',
                                  padding: '8px 0',
                                }}
                              >
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
                                <span>
                                  <span style={{ fontSize: '14px', lineHeight: '1.45' }}>{i?.l}</span>
                                  <br />
                                  <span style={{ fontSize: '12px', color: '#5B5B6E' }}>{i?.t}</span>
                                </span>
                              </li>
                            </Fragment>
                          ))}
                        </ol>
                      ) : null}
                      {b?.isProg ? (
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {(b?.rows ?? []).map((p: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '10px',
                                    fontSize: '14px',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <b>{p?.label}</b>
                                  <span style={{ color: '#3F3F50', fontVariantNumeric: 'tabular-nums' }}>
                                    {p?.right}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: '10px',
                                    borderRadius: '5px',
                                    background: '#EEEEF3',
                                    display: 'flex',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {(p?.segs ?? []).map((g: Loose, $index: number) => (
                                    <Fragment key={$index}>
                                      <span
                                        style={{ width: `${g?.w ?? ''}`, background: `${g?.c ?? ''}` } as CSSProperties}
                                      />
                                    </Fragment>
                                  ))}
                                </div>
                              </div>
                            </Fragment>
                          ))}
                          <div
                            style={{
                              display: 'flex',
                              gap: '14px',
                              flexWrap: 'wrap',
                              fontSize: '12px',
                              color: '#3F3F50',
                            }}
                          >
                            {(b?.legend ?? []).map((g: Loose, $index: number) => (
                              <Fragment key={$index}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span
                                    style={
                                      {
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '3px',
                                        background: `${g?.c ?? ''}`,
                                      } as CSSProperties
                                    }
                                  />
                                  {g?.label}
                                </span>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {b?.isChart ? (
                        <div style={{ padding: '16px 16px 10px' }}>
                          <div
                            style={
                              {
                                height: '180px',
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: `${b?.gap ?? ''}`,
                                borderBottom: '1px solid #E4E4EC',
                              } as CSSProperties
                            }
                          >
                            {(b?.bars ?? []).map((x: Loose, $index: number) => (
                              <Fragment key={$index}>
                                <div
                                  title={x?.tip}
                                  style={
                                    {
                                      flex: '1',
                                      minWidth: '0',
                                      height: `${x?.h ?? ''}`,
                                      background: `${x?.c ?? ''}`,
                                      borderRadius: '4px 4px 0 0',
                                    } as CSSProperties
                                  }
                                />
                              </Fragment>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: `${b?.gap ?? ''}`, marginTop: '6px' } as CSSProperties}>
                            {(b?.bars ?? []).map((x: Loose, $index: number) => (
                              <Fragment key={$index}>
                                <span
                                  style={{
                                    flex: '1',
                                    minWidth: '0',
                                    fontSize: '10px',
                                    color: '#5B5B6E',
                                    textAlign: 'center',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {x?.label}
                                </span>
                              </Fragment>
                            ))}
                          </div>
                          <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '8px' }}>{b?.note}</div>
                        </div>
                      ) : null}
                      {b?.isForm ? (
                        <div
                          style={
                            {
                              padding: '16px',
                              display: 'grid',
                              gridTemplateColumns: `${vm.formCols ?? ''}`,
                              gap: '16px',
                            } as CSSProperties
                          }
                        >
                          {(b?.fields ?? []).map((f: Loose, $index: number) => (
                            <Fragment key={$index}>
                              <div
                                style={
                                  {
                                    gridColumn: `${f?.span ?? ''}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    minWidth: '0',
                                  } as CSSProperties
                                }
                              >
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
                                      <span style={{ padding: '0 0 0 12px', color: '#5B5B6E', fontSize: '15px' }}>
                                        {f?.prefix}
                                      </span>
                                    ) : null}
                                    <input
                                      type={f?.inputType}
                                      value={f?.value ?? ''}
                                      onChange={f?.onChange}
                                      placeholder={f?.ph}
                                      aria-label={f?.label}
                                      style={{
                                        flex: '1',
                                        minWidth: '0',
                                        height: '46px',
                                        border: '0',
                                        outline: '0',
                                        padding: '0 12px',
                                        fontSize: '16px',
                                        background: 'transparent',
                                      }}
                                    />
                                  </span>
                                ) : null}
                                {f?.isArea ? (
                                  <textarea
                                    value={f?.value ?? ''}
                                    onChange={f?.onChange}
                                    rows={4}
                                    aria-label={f?.label}
                                    style={
                                      {
                                        border: `${f?.bd ?? ''}`,
                                        borderRadius: '10px',
                                        padding: '10px 12px',
                                        fontSize: '16px',
                                        lineHeight: '1.5',
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
                                            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
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
                                {f?.isUpload ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {f?.up?.hasPreview ? (
                                      <div
                                        style={{
                                          aspectRatio: '16/9',
                                          maxWidth: '520px',
                                          borderRadius: '12px',
                                          background:
                                            'repeating-linear-gradient(135deg,#EDE9FE 0 10px,#E4DCFD 10px 20px)',
                                          display: 'flex',
                                          alignItems: 'flex-end',
                                          justifyContent: 'space-between',
                                          padding: '10px',
                                          gap: '8px',
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontFamily: "'IBM Plex Mono',monospace",
                                            fontSize: '11px',
                                            color: '#5B21B6',
                                            background: '#fff',
                                            padding: '3px 6px',
                                            borderRadius: '4px',
                                          }}
                                        >
                                          {f?.up?.name}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={f?.up?.remove}
                                          style={{
                                            height: '34px',
                                            padding: '0 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #D4D4DE',
                                            background: '#fff',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          Trocar imagem
                                        </button>
                                      </div>
                                    ) : null}
                                    {f?.up?.busy ? (
                                      <div
                                        style={{
                                          border: '1px solid #E4E4EC',
                                          borderRadius: '12px',
                                          padding: '12px',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '6px',
                                        }}
                                      >
                                        <span style={{ fontSize: '14px', fontWeight: '600' }}>{f?.up?.name}</span>
                                        <div style={{ height: '6px', background: '#EEEEF3', borderRadius: '6px' }}>
                                          <div
                                            style={
                                              {
                                                height: '6px',
                                                width: `${f?.up?.pct ?? ''}`,
                                                background: '#7C3AED',
                                                borderRadius: '6px',
                                              } as CSSProperties
                                            }
                                          />
                                        </div>
                                        <span style={{ fontSize: '12px', color: '#5B5B6E' }}>
                                          Enviando {f?.up?.pct}
                                        </span>
                                      </div>
                                    ) : null}
                                    {f?.up?.empty ? (
                                      <div
                                        style={
                                          {
                                            border: `2px dashed ${f?.up?.bd ?? ''}`,
                                            borderRadius: '12px',
                                            padding: '20px',
                                            textAlign: 'center',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px',
                                            alignItems: 'center',
                                          } as CSSProperties
                                        }
                                      >
                                        <b>Arraste a imagem ou selecione um arquivo</b>
                                        <span style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.45' }}>
                                          Proporção recomendada 16:9 (ex.: 1920 × 1080). O sistema redimensiona a
                                          imagem. Formatos e tamanho máximo dependem da configuração do servidor.
                                        </span>
                                        <button
                                          type="button"
                                          onClick={f?.up?.pick}
                                          style={{
                                            marginTop: '6px',
                                            height: '40px',
                                            padding: '0 14px',
                                            border: '1px solid #D4D4DE',
                                            borderRadius: '10px',
                                            background: '#fff',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          Selecionar arquivo
                                        </button>
                                      </div>
                                    ) : null}
                                    {f?.up?.err ? (
                                      <div
                                        role="alert"
                                        style={{
                                          border: '1px solid #FECACA',
                                          background: '#FEF2F2',
                                          borderRadius: '10px',
                                          padding: '10px 12px',
                                          fontSize: '13px',
                                          color: '#991B1B',
                                          lineHeight: '1.45',
                                        }}
                                      >
                                        <b>Não foi possível usar este arquivo.</b> Envie uma imagem JPG, PNG ou WebP
                                        dentro do tamanho permitido.
                                      </div>
                                    ) : null}
                                    {f?.up?.empty ? (
                                      <button
                                        type="button"
                                        onClick={f?.up?.pickBad}
                                        style={{
                                          alignSelf: 'flex-start',
                                          minHeight: '32px',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                          border: '1px dashed #E6C35C',
                                          background: '#FFFBEB',
                                          fontSize: '12px',
                                          color: '#854D0E',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        DEMO · enviar arquivo inválido
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                                {f?.hasErr ? (
                                  <span role="alert" style={{ fontSize: '13px', color: '#B91C1C' }}>
                                    {f?.err}
                                  </span>
                                ) : null}
                                {f?.hasHint ? (
                                  <span style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.45' }}>
                                    {f?.hint}
                                  </span>
                                ) : null}
                              </div>
                            </Fragment>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              </Fragment>
            ))}
          </div>
          {vm.ap?.hasDemo ? (
            <div
              style={{
                border: '1px dashed #E6C35C',
                background: '#FFFBEB',
                borderRadius: '14px',
                padding: '12px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#854D0E',
                  fontFamily: "'IBM Plex Mono',monospace",
                  width: '100%',
                }}
              >
                DEMO
              </span>
              {(vm.ap?.demo ?? []).map((d: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    onClick={d?.onClick}
                    style={{
                      minHeight: '36px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      border: '1px solid #E6C35C',
                      background: '#fff',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {d?.label}
                  </button>
                </Fragment>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
