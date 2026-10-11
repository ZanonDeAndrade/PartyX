import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function EventsScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="P02 Eventos"
      style={{ color: '#fff', maxWidth: '1200px', margin: '0 auto', padding: '28px 16px 64px' }}
    >
      <h1
        style={{
          margin: '0 0 16px',
          fontSize: 'clamp(32px,5vw,48px)',
          fontWeight: '900',
          fontStretch: '112%',
          letterSpacing: '-0.03em',
        }}
      >
        Eventos
      </h1>
      <form
        onSubmit={vm.list?.submit}
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
            value={vm.list?.q ?? ''}
            onChange={vm.list?.onQ}
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
            value={vm.list?.qDate ?? ''}
            onChange={vm.list?.onDate}
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
      {vm.list?.hasChips ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '14px' }}>
          <span style={{ fontSize: '14px', color: '#A6A6BA' }}>Filtros:</span>
          {(vm.list?.chips ?? []).map((c: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={c?.onRemove}
                aria-label="Remover filtro"
                style={{
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '999px',
                  background: '#2A1F4D',
                  color: '#E9E3FF',
                  border: '1px solid #4C3A8A',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {c?.label} ×
              </button>
            </Fragment>
          ))}
          <button
            onClick={vm.list?.clear}
            style={{
              height: '36px',
              background: 'none',
              border: '0',
              color: '#C4B5FD',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
      <div style={{ fontSize: '14px', color: '#A6A6BA', margin: '20px 0 12px' }}>{vm.list?.countText}</div>
      {vm.list?.loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '16px' }}>
          {(vm.list?.skel ?? []).map((_k: Loose, $index: number) => (
            <Fragment key={$index}>
              <div style={{ background: '#15151E', borderRadius: '16px', overflow: 'hidden' }}>
                <div
                  style={{ aspectRatio: '16/9', background: '#1E1E2A', animation: 'pxpulse 1.4s ease-in-out infinite' }}
                />
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      height: '12px',
                      width: '40%',
                      borderRadius: '6px',
                      background: '#2A2A38',
                      animation: 'pxpulse 1.4s ease-in-out infinite',
                    }}
                  />
                  <div
                    style={{
                      height: '18px',
                      width: '70%',
                      borderRadius: '6px',
                      background: '#2A2A38',
                      animation: 'pxpulse 1.4s ease-in-out infinite',
                    }}
                  />
                  <div
                    style={{
                      height: '12px',
                      width: '55%',
                      borderRadius: '6px',
                      background: '#2A2A38',
                      animation: 'pxpulse 1.4s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      ) : null}
      {vm.list?.showItems ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '16px' }}>
          {(vm.list?.items ?? []).map((e: Loose, $index: number) => (
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
                  <span style={{ fontSize: '13px', color: '#C4B5FD', fontWeight: '700' }}>{e?.dateShort}</span>
                  <span style={{ fontSize: '20px', fontWeight: '800', fontStretch: '108%' }}>{e?.name}</span>
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
      ) : null}
      {vm.list?.showEmpty ? (
        <div
          style={{
            border: '1px dashed #3A3A4C',
            borderRadius: '16px',
            padding: '40px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: '800' }}>{vm.list?.emptyTitle}</div>
          <div style={{ fontSize: '15px', color: '#A6A6BA', maxWidth: '460px', lineHeight: '1.5' }}>
            {vm.list?.emptyText}
          </div>
          {vm.list?.hasChips ? (
            <button
              onClick={vm.list?.clear}
              style={{
                marginTop: '8px',
                height: '48px',
                padding: '0 20px',
                borderRadius: '10px',
                background: '#fff',
                color: '#0B0B10',
                border: '0',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
