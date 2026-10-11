import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function HomeScreen({ vm }: { vm: ViewModel }) {
  return (
    <main data-screen-label="P01 Página inicial" style={{ color: '#fff' }}>
      {vm.home?.hasFeat ? (
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 16px 0' }}>
          <div
            style={
              {
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                minHeight: `${vm.home?.heroH ?? ''}`,
                display: 'flex',
                alignItems: 'flex-end',
                background: `repeating-linear-gradient(135deg,${vm.home?.feat?.c1 ?? ''} 0 14px,${vm.home?.feat?.c2 ?? ''} 14px 28px)`,
              } as CSSProperties
            }
          >
            <span
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: '11px',
                color: '#A6A6BA',
                background: '#0B0B10CC',
                padding: '4px 8px',
                borderRadius: '6px',
              }}
            >
              banner do evento · a fornecer
            </span>
            <div
              style={{
                position: 'relative',
                width: '100%',
                padding: 'clamp(20px,4vw,48px)',
                background: 'linear-gradient(0deg,#0B0B10F2 0%,#0B0B10B3 55%,#0B0B1000 100%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.1em', color: '#C4B5FD' }}>
                EM DESTAQUE
              </span>
              <h1
                style={{
                  margin: '0',
                  fontSize: 'clamp(40px,7vw,84px)',
                  lineHeight: '.95',
                  fontWeight: '900',
                  fontStretch: '115%',
                  letterSpacing: '-0.035em',
                }}
              >
                {vm.home?.feat?.name}
              </h1>
              <div style={{ fontSize: '17px', fontWeight: '600' }}>{vm.home?.feat?.dateShort}</div>
              <div style={{ fontSize: '15px', color: '#D4D4DE' }}>{vm.home?.feat?.venue}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginTop: '10px' }}>
                <button
                  onClick={vm.home?.feat?.onClick}
                  style={{
                    height: '52px',
                    padding: '0 24px',
                    borderRadius: '12px',
                    background: '#7C3AED',
                    color: '#fff',
                    border: '0',
                    fontWeight: '700',
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  {vm.home?.feat?.cta}
                </button>
                {vm.home?.feat?.hasPrice ? (
                  <span style={{ fontSize: '15px', color: '#D4D4DE' }}>
                    a partir de <b style={{ color: '#fff' }}>{vm.home?.feat?.priceLabel}</b>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 16px 0' }}>
        <form
          onSubmit={vm.home?.submit}
          style={{
            background: '#15151E',
            border: '1px solid #2C2C3A',
            borderRadius: '16px',
            padding: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'flex-end',
          }}
        >
          <label style={{ flex: '2 1 220px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#D4D4DE' }}>Nome do evento</span>
            <input
              value={vm.home?.q ?? ''}
              onChange={vm.home?.onQ}
              placeholder="Ex.: Neon"
              style={{
                height: '48px',
                borderRadius: '10px',
                background: '#0B0B10',
                border: '1px solid #2C2C3A',
                color: '#fff',
                padding: '0 14px',
                fontSize: '16px',
              }}
            />
          </label>
          <label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#D4D4DE' }}>Data</span>
            <input
              type="date"
              value={vm.home?.qDate ?? ''}
              onChange={vm.home?.onDate}
              style={{
                height: '48px',
                borderRadius: '10px',
                background: '#0B0B10',
                border: '1px solid #2C2C3A',
                color: '#fff',
                padding: '0 12px',
                fontSize: '16px',
                colorScheme: 'dark',
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              flex: '1 1 120px',
              height: '48px',
              borderRadius: '10px',
              background: '#fff',
              color: '#0B0B10',
              border: '0',
              fontWeight: '700',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Buscar
          </button>
        </form>
      </section>
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 16px 64px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{ margin: '0', fontSize: '28px', fontWeight: '800', fontStretch: '110%', letterSpacing: '-0.02em' }}
          >
            Próximos eventos
          </h2>
          <button
            onClick={vm.go?.P02}
            style={{
              background: 'none',
              border: '0',
              color: '#C4B5FD',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              height: '44px',
            }}
          >
            Ver todos os eventos
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '16px' }}>
          {(vm.home?.list ?? []).map((e: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={e?.onClick}
                style={{
                  textAlign: 'left',
                  background: '#15151E',
                  border: '1px solid #1E1E2A',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  color: '#fff',
                  padding: '0',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={
                    {
                      aspectRatio: '16/9',
                      width: '100%',
                      background: `repeating-linear-gradient(135deg,${e?.c1 ?? ''} 0 10px,${e?.c2 ?? ''} 10px 20px)`,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      padding: '10px',
                    } as CSSProperties
                  }
                >
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: '#A6A6BA' }}>
                    banner 16:9
                  </span>
                  {e?.hasState ? (
                    <span
                      style={
                        {
                          fontSize: '12px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: `${e?.sBg ?? ''}`,
                          color: `${e?.sFg ?? ''}`,
                        } as CSSProperties
                      }
                    >
                      {e?.stateLabel}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    flex: '1',
                    width: '100%',
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#C4B5FD', fontWeight: '700', letterSpacing: '.02em' }}>
                    {e?.dateShort}
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: '800', fontStretch: '108%', letterSpacing: '-0.01em' }}>
                    {e?.name}
                  </span>
                  <span style={{ fontSize: '14px', color: '#A6A6BA' }}>{e?.venue}</span>
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: 'auto',
                      paddingTop: '12px',
                    }}
                  >
                    <span style={{ fontSize: '14px', color: '#A6A6BA' }}>
                      {e?.priceText} <b style={{ color: '#fff' }}>{e?.priceLabel}</b>
                    </span>
                    <span
                      style={
                        {
                          height: '40px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0 14px',
                          borderRadius: '10px',
                          background: `${e?.ctaBg ?? ''}`,
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: '14px',
                          border: `${e?.ctaBorder ?? ''}`,
                        } as CSSProperties
                      }
                    >
                      {e?.cta}
                    </span>
                  </span>
                </div>
              </button>
            </Fragment>
          ))}
        </div>
      </section>
    </main>
  );
}
