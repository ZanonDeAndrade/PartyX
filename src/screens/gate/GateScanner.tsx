import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function GateScanner({ vm }: { vm: ViewModel }) {
  return (
    <main
      style={{
        maxWidth: '560px',
        width: '100%',
        margin: '0 auto',
        padding: '16px 14px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'repeating-linear-gradient(135deg,#0E0E14 0 12px,#12121A 12px 24px)',
          border: '1px solid #1E1E2A',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: '11px',
            color: '#8A8A9E',
          }}
        >
          câmera simulada
        </span>
        {vm.gv?.camReading ? (
          <>
            <div
              style={{
                position: 'absolute',
                inset: '14%',
                borderRadius: '12px',
                boxShadow: '0 0 0 2000px rgba(0,0,0,.35)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '36px',
                  height: '36px',
                  borderTop: '4px solid #fff',
                  borderLeft: '4px solid #fff',
                  borderRadius: '10px 0 0 0',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: '0',
                  right: '0',
                  width: '36px',
                  height: '36px',
                  borderTop: '4px solid #fff',
                  borderRight: '4px solid #fff',
                  borderRadius: '0 10px 0 0',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '0',
                  width: '36px',
                  height: '36px',
                  borderBottom: '4px solid #fff',
                  borderLeft: '4px solid #fff',
                  borderRadius: '0 0 0 10px',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '0',
                  width: '36px',
                  height: '36px',
                  borderBottom: '4px solid #fff',
                  borderRight: '4px solid #fff',
                  borderRadius: '0 0 10px 0',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: '6%',
                  right: '6%',
                  height: '2px',
                  background: '#8B5CF6',
                  animation: 'pxscan 2.4s ease-in-out infinite',
                }}
              />
            </div>
            <span
              style={{
                position: 'absolute',
                bottom: '14px',
                left: '0',
                right: '0',
                textAlign: 'center',
                fontWeight: '700',
                fontSize: '16px',
              }}
            >
              Aponte a câmera para o QR do ingresso
            </span>
          </>
        ) : null}
        {vm.gv?.camQuery ? (
          <div
            style={{
              position: 'absolute',
              inset: '0',
              background: 'rgba(0,0,0,.72)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
            }}
            aria-live="assertive"
          >
            <span
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                border: '5px solid #2C2C3A',
                borderTopColor: '#8B5CF6',
                animation: 'pxspin 1s linear infinite',
              }}
            />
            <b style={{ fontSize: '20px' }}>Consultando ingresso…</b>
            <span style={{ fontSize: '14px', color: '#A6A6BA' }}>Novas leituras ficam bloqueadas até a resposta.</span>
          </div>
        ) : null}
        {vm.gv?.camMsg?.show ? (
          <div
            style={{
              position: 'absolute',
              inset: '0',
              background: 'rgba(0,0,0,.82)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            {vm.gv?.camMsg?.spin ? (
              <span
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: '5px solid #2C2C3A',
                  borderTopColor: '#fff',
                  animation: 'pxspin 1s linear infinite',
                }}
              />
            ) : null}
            <b style={{ fontSize: '22px', lineHeight: '1.2' }}>{vm.gv?.camMsg?.title}</b>
            <span style={{ fontSize: '15px', color: '#D4D4DE', lineHeight: '1.5', maxWidth: '380px' }}>
              {vm.gv?.camMsg?.text}
            </span>
            {vm.gv?.camMsg?.hasSteps ? (
              <div
                style={{
                  textAlign: 'left',
                  background: '#15151E',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  lineHeight: '1.55',
                  color: '#D4D4DE',
                  maxWidth: '400px',
                }}
              >
                {(vm.gv?.camMsg?.steps ?? []).map((x: Loose, $index: number) => (
                  <Fragment key={$index}>
                    <div>
                      <b style={{ color: '#fff' }}>{x?.k}</b> {x?.v}
                    </div>
                  </Fragment>
                ))}
              </div>
            ) : null}
            {vm.gv?.camMsg?.hasBtn ? (
              <button
                onClick={vm.gv?.camMsg?.onClick}
                style={{
                  height: '56px',
                  padding: '0 24px',
                  borderRadius: '12px',
                  background: '#7C3AED',
                  color: '#fff',
                  border: '0',
                  fontWeight: '800',
                  fontSize: '17px',
                  cursor: 'pointer',
                }}
              >
                {vm.gv?.camMsg?.btn}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `${vm.gv?.btnCols ?? ''}`, gap: '10px' } as CSSProperties}>
        <button
          onClick={vm.gv?.toManual}
          style={{
            height: '60px',
            borderRadius: '14px',
            background: '#fff',
            color: '#0B0B10',
            border: '0',
            fontWeight: '800',
            fontSize: '17px',
            cursor: 'pointer',
          }}
        >
          Busca manual
        </button>
        {vm.gv?.multiCam ? (
          <button
            onClick={vm.gv?.switchCam}
            style={{
              height: '60px',
              borderRadius: '14px',
              background: 'transparent',
              color: '#fff',
              border: '1px solid #3A3A4C',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Alternar câmera
          </button>
        ) : null}
      </div>
      <div
        style={{
          border: '1px dashed #6B5A1E',
          background: '#1A1608',
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
            color: '#FACC15',
            fontFamily: "'IBM Plex Mono',monospace",
            width: '100%',
          }}
        >
          DEMO · simular leitura ou condição
        </span>
        {(vm.gv?.sims ?? []).map((d: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={d?.onClick}
              style={{
                minHeight: '40px',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid #6B5A1E',
                background: '#0B0B10',
                color: '#FDE68A',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {d?.label}
            </button>
          </Fragment>
        ))}
      </div>
    </main>
  );
}
