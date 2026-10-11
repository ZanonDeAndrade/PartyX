import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function MyOrdersScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="U02 Minhas compras"
      style={
        {
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `24px 16px ${vm.me?.padB ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        } as CSSProperties
      }
    >
      <h1
        style={{
          margin: '0 0 6px',
          fontSize: 'clamp(28px,4vw,38px)',
          fontWeight: '900',
          fontStretch: '110%',
          letterSpacing: '-0.02em',
        }}
      >
        Minhas compras
      </h1>
      {vm.me?.noOrders ? (
        <div
          style={{
            background: '#fff',
            border: '1px dashed #C9C9D6',
            borderRadius: '16px',
            padding: '36px 20px',
            textAlign: 'center',
          }}
        >
          <b style={{ fontSize: '18px' }}>Você ainda não fez nenhuma compra</b>
        </div>
      ) : null}
      {(vm.me?.orders ?? []).map((o: Loose, $index: number) => (
        <Fragment key={$index}>
          <button
            onClick={o?.onClick}
            style={
              {
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '14px',
                padding: '16px',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: `${vm.me?.oCols ?? ''}`,
                gap: '10px 16px',
                alignItems: 'center',
                color: '#0B0B10',
              } as CSSProperties
            }
          >
            <span style={{ minWidth: '0' }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#5B5B6E' }}>
                {o?.num} · {o?.date}
              </span>
              <br />
              <b style={{ fontSize: '17px' }}>{o?.event}</b>
            </span>
            <span style={{ fontSize: '14px', color: '#3F3F50' }}>
              {o?.qty} · {o?.method}
            </span>
            <b style={{ fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>{o?.total}</b>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span
                style={
                  {
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: `${o?.ob?.bg ?? ''}`,
                    color: `${o?.ob?.fg ?? ''}`,
                  } as CSSProperties
                }
              >
                Pedido: {o?.ob?.label}
              </span>
              <span
                style={
                  {
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: `${o?.pb?.bg ?? ''}`,
                    color: `${o?.pb?.fg ?? ''}`,
                  } as CSSProperties
                }
              >
                Pagamento: {o?.pb?.label}
              </span>
            </span>
          </button>
        </Fragment>
      ))}
    </main>
  );
}
