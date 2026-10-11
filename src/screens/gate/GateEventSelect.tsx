import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function GateEventSelect({ vm }: { vm: ViewModel }) {
  return (
    <main
      style={{
        maxWidth: '720px',
        width: '100%',
        margin: '0 auto',
        padding: '24px 14px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <h1
        style={{
          margin: '0',
          fontSize: 'clamp(28px,5vw,40px)',
          fontWeight: '900',
          fontStretch: '112%',
          letterSpacing: '-0.02em',
        }}
      >
        Escolha o evento
      </h1>
      <p style={{ margin: '0', color: '#A6A6BA', fontSize: '15px', lineHeight: '1.5' }}>
        Confira nome, data e local antes de começar. Ingressos de outros eventos serão recusados.
      </p>
      {(vm.gv?.events ?? []).map((e: Loose, $index: number) => (
        <Fragment key={$index}>
          <div
            style={
              {
                background: '#15151E',
                border: `1px solid ${e?.bd ?? ''}`,
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              } as CSSProperties
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: '900', fontSize: '22px', fontStretch: '108%' }}>{e?.name}</div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '2px' }}>{e?.date}</div>
                <div style={{ fontSize: '14px', color: '#A6A6BA', marginTop: '2px' }}>{e?.venue}</div>
              </div>
              {e?.today ? (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: '800',
                    padding: '5px 9px',
                    borderRadius: '6px',
                    background: '#DCFCE7',
                    color: '#14532D',
                    flex: 'none',
                  }}
                >
                  HOJE
                </span>
              ) : null}
            </div>
            <button
              onClick={e?.onClick}
              style={
                {
                  height: '56px',
                  borderRadius: '12px',
                  background: `${e?.btnBg ?? ''}`,
                  color: '#fff',
                  border: `${e?.btnBd ?? ''}`,
                  fontWeight: '800',
                  fontSize: '17px',
                  cursor: 'pointer',
                } as CSSProperties
              }
            >
              Validar neste evento
            </button>
          </div>
        </Fragment>
      ))}
      <button
        onClick={vm.gv?.logout}
        style={{
          alignSelf: 'flex-start',
          height: '44px',
          padding: '0 14px',
          borderRadius: '10px',
          border: '1px solid #2C2C3A',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Sair
      </button>
    </main>
  );
}
