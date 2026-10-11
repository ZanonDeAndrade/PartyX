import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function ScreenIndexPanel({ vm }: { vm: ViewModel }) {
  return (
    <aside
      aria-label="Telas e estados"
      style={{
        position: 'fixed',
        top: '52px',
        right: '0',
        bottom: '0',
        zIndex: '200',
        width: 'min(400px,100vw)',
        background: '#fff',
        borderLeft: '1px solid #E4E4EC',
        boxShadow: '-12px 0 32px rgba(11,11,16,.15)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #E4E4EC',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: '#FFFBEB',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: '15px' }}>
            Telas e estados{' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: '#854D0E' }}>DEMO</span>
          </b>
          <button
            onClick={vm.idx?.close}
            aria-label="Fechar"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #F5D77A',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        <input
          value={vm.idx?.q ?? ''}
          onChange={vm.idx?.onQ}
          placeholder="Filtrar por ID ou nome (ex.: V06, Pix)"
          style={{
            height: '40px',
            border: '1px solid #F5D77A',
            borderRadius: '8px',
            padding: '0 10px',
            fontSize: '14px',
          }}
        />
        <span style={{ fontSize: '12px', color: '#854D0E', lineHeight: '1.4' }}>
          Cada item troca o perfil de demonstração quando necessário e abre a tela com o estado pronto.
        </span>
      </div>
      <div style={{ flex: '1', overflowY: 'auto', padding: '8px 10px 20px' }}>
        {(vm.idx?.groups ?? []).map((g: Loose, $index: number) => (
          <Fragment key={$index}>
            <div style={{ marginTop: '10px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '800',
                  letterSpacing: '.08em',
                  color: '#5B5B6E',
                  padding: '4px 6px',
                }}
              >
                {g?.name}
              </div>
              {(g?.items ?? []).map((i: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    onClick={i?.onClick}
                    style={
                      {
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'baseline',
                        padding: '7px 6px',
                        border: '0',
                        borderRadius: '6px',
                        background: `${i?.bg ?? ''}`,
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#0B0B10',
                      } as CSSProperties
                    }
                  >
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#5B21B6',
                        minWidth: '52px',
                      }}
                    >
                      {i?.id}
                    </span>
                    <span>{i?.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </aside>
  );
}
