import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function MyTicketsScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="U01 Meus ingressos"
      style={
        {
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `24px 16px ${vm.me?.padB ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        } as CSSProperties
      }
    >
      <h1
        style={{
          margin: '0',
          fontSize: 'clamp(28px,4vw,38px)',
          fontWeight: '900',
          fontStretch: '110%',
          letterSpacing: '-0.02em',
        }}
      >
        Meus ingressos
      </h1>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '4px',
          background: '#EEEEF3',
          borderRadius: '12px',
          padding: '4px',
          alignSelf: 'flex-start',
        }}
      >
        {(vm.me?.segs ?? []).map((t: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              role="tab"
              aria-selected={t?.on}
              onClick={t?.onClick}
              style={
                {
                  height: '40px',
                  padding: '0 16px',
                  borderRadius: '9px',
                  border: '0',
                  background: `${t?.bg ?? ''}`,
                  fontWeight: '700',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#0B0B10',
                  boxShadow: `${t?.sh ?? ''}`,
                } as CSSProperties
              }
            >
              {t?.label}
            </button>
          </Fragment>
        ))}
      </div>
      {vm.me?.loading ? (
        <>
          {(vm.me?.skel ?? []).map((_k: Loose, $index: number) => (
            <Fragment key={$index}>
              <div
                style={{
                  height: '140px',
                  borderRadius: '16px',
                  background: '#EEEEF3',
                  animation: 'pxpulse 1.4s ease-in-out infinite',
                }}
              />
            </Fragment>
          ))}
        </>
      ) : null}
      {vm.me?.empty ? (
        <div
          style={{
            background: '#fff',
            border: '1px dashed #C9C9D6',
            borderRadius: '16px',
            padding: '36px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '20px', fontWeight: '800' }}>{vm.me?.emptyTitle}</div>
          <div style={{ fontSize: '15px', color: '#5B5B6E', maxWidth: '420px', lineHeight: '1.5' }}>
            {vm.me?.emptyText}
          </div>
          <button
            onClick={vm.go?.P02}
            style={{
              marginTop: '6px',
              height: '48px',
              padding: '0 20px',
              borderRadius: '12px',
              background: '#7C3AED',
              color: '#fff',
              border: '0',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Ver eventos
          </button>
        </div>
      ) : null}
      {(vm.me?.groups ?? []).map((g: Loose, $index: number) => (
        <Fragment key={$index}>
          <section
            style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'center',
                padding: '14px',
                background: '#0B0B10',
                color: '#fff',
              }}
            >
              <div
                style={
                  {
                    width: '72px',
                    height: '54px',
                    borderRadius: '8px',
                    flex: 'none',
                    background: `repeating-linear-gradient(135deg,${g?.c1 ?? ''} 0 6px,${g?.c2 ?? ''} 6px 12px)`,
                    border: '1px solid #2C2C3A',
                  } as CSSProperties
                }
              />
              <div style={{ minWidth: '0', flex: '1' }}>
                <div style={{ fontWeight: '800', fontSize: '18px' }}>{g?.name}</div>
                <div style={{ fontSize: '14px', color: '#D4D4DE' }}>{g?.date}</div>
                <div style={{ fontSize: '13px', color: '#A6A6BA' }}>{g?.venue}</div>
              </div>
              <span style={{ fontSize: '13px', color: '#D4D4DE', flex: 'none' }}>{g?.count}</span>
            </div>
            {g?.issuing ? (
              <div style={{ padding: '14px', fontSize: '14px', color: '#5B21B6', background: '#F5F3FF' }}>
                Pagamento confirmado. Preparando seus ingressos…
              </div>
            ) : null}
            {(g?.tickets ?? []).map((k: Loose, $index: number) => (
              <Fragment key={$index}>
                <button
                  onClick={k?.onClick}
                  style={{
                    width: '100%',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '14px',
                    background: '#fff',
                    border: '0',
                    borderTop: '1px solid #EEEEF3',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#0B0B10',
                  }}
                >
                  <span
                    style={
                      {
                        width: '44px',
                        height: '44px',
                        borderRadius: '8px',
                        flex: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `${k?.iconBg ?? ''}`,
                        color: `${k?.iconFg ?? ''}`,
                        fontWeight: '900',
                        fontSize: '13px',
                      } as CSSProperties
                    }
                  >
                    {k?.icon}
                  </span>
                  <span style={{ flex: '1', minWidth: '0' }}>
                    <b style={{ fontSize: '16px' }}>{k?.type}</b>
                    <br />
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#5B5B6E' }}>
                      {k?.code}
                    </span>
                    <span style={{ fontSize: '13px', color: '#5B5B6E' }}> · {k?.holder}</span>
                  </span>
                  <span
                    style={
                      {
                        fontSize: '12px',
                        fontWeight: '700',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: `${k?.b?.bg ?? ''}`,
                        color: `${k?.b?.fg ?? ''}`,
                        flex: 'none',
                      } as CSSProperties
                    }
                  >
                    {k?.b?.label}
                  </span>
                </button>
              </Fragment>
            ))}
          </section>
        </Fragment>
      ))}
    </main>
  );
}
