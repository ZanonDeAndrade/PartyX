import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function CheckoutConfirmed({ vm }: { vm: ViewModel }) {
  return (
    <>
      {vm.ck?.issuing ? (
        <section
          aria-live="polite"
          style={{
            background: '#fff',
            border: '1px solid #E4E4EC',
            borderRadius: '20px',
            padding: '28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#DCFCE7',
              color: '#14532D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: '900',
            }}
          >
            ✓
          </div>
          <h1 style={{ margin: '0', fontSize: 'clamp(26px,4vw,32px)', fontWeight: '900', fontStretch: '110%' }}>
            Pagamento confirmado. Preparando seus ingressos
          </h1>
          <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.55', color: '#3F3F50' }}>
            Estamos emitindo um ingresso para cada unidade. Os QR Codes aparecem aqui assim que estiverem prontos.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(vm.ck?.skel ?? []).map((_k: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    height: '56px',
                    borderRadius: '12px',
                    background: '#EEEEF3',
                    animation: 'pxpulse 1.4s ease-in-out infinite',
                  }}
                />
              </Fragment>
            ))}
          </div>
        </section>
      ) : null}
      {vm.ck?.issued ? (
        <>
          <section
            style={{
              background: '#fff',
              border: '1px solid #E4E4EC',
              borderRadius: '20px',
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#DCFCE7',
                color: '#14532D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                fontWeight: '900',
              }}
            >
              ✓
            </div>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#5B5B6E' }}>
              Pedido {vm.ck?.num}
            </span>
            <h1
              style={{
                margin: '0',
                fontSize: 'clamp(28px,4vw,36px)',
                fontWeight: '900',
                fontStretch: '110%',
                letterSpacing: '-0.02em',
              }}
            >
              Compra confirmada
            </h1>
            <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.55', color: '#3F3F50' }}>
              Seus {vm.ck?.units} para {vm.ck?.sum?.event} estão em Meus ingressos. Enviamos a confirmação com o link de
              acesso para <b>{vm.ck?.mEmail}</b>.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #E4E4EC',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              {(vm.ck?.tickets ?? []).map((k: Loose, $index: number) => (
                <Fragment key={$index}>
                  <button
                    onClick={k?.onClick}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 14px',
                      background: '#fff',
                      border: '0',
                      borderBottom: '1px solid #EEEEF3',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: '#0B0B10',
                    }}
                  >
                    <span>
                      <b>{k?.type}</b>
                      <br />
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#5B5B6E' }}>
                        {k?.code} · {k?.pos}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#DCFCE7',
                        color: '#14532D',
                      }}
                    >
                      Válido
                    </span>
                  </button>
                </Fragment>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={vm.go?.U01}
                style={
                  {
                    height: '52px',
                    padding: '0 22px',
                    borderRadius: '12px',
                    background: '#7C3AED',
                    color: '#fff',
                    border: '0',
                    fontWeight: '700',
                    fontSize: '16px',
                    cursor: 'pointer',
                    flex: `${vm.ck?.btnFlex ?? ''}`,
                  } as CSSProperties
                }
              >
                Ver meus ingressos
              </button>
              <button
                onClick={vm.ck?.dl}
                style={
                  {
                    height: '52px',
                    padding: '0 22px',
                    borderRadius: '12px',
                    background: '#fff',
                    color: '#0B0B10',
                    border: '1px solid #D4D4DE',
                    fontWeight: '700',
                    fontSize: '16px',
                    cursor: 'pointer',
                    flex: `${vm.ck?.btnFlex ?? ''}`,
                  } as CSSProperties
                }
              >
                Baixar ingressos (PDF)
              </button>
            </div>
          </section>
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
              DEMO · CA-P3
            </span>
            <button
              onClick={vm.ck?.simRepeat}
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
              Gateway reenviar a mesma confirmação
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
