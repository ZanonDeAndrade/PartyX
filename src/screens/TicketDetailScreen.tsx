import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function TicketDetailScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="U04 Detalhe do ingresso"
      style={
        {
          maxWidth: '560px',
          margin: '0 auto',
          padding: `20px 16px ${vm.me?.padB ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        } as CSSProperties
      }
    >
      <button
        onClick={vm.go?.U01}
        style={{
          alignSelf: 'flex-start',
          background: 'none',
          border: '0',
          padding: '0',
          minHeight: '40px',
          color: '#5B21B6',
          fontWeight: '600',
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        ‹ Meus ingressos
      </button>
      <article style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '20px', overflow: 'hidden' }}>
        <div
          style={
            {
              background: `${vm.tk?.headBg ?? ''}`,
              color: `${vm.tk?.headFg ?? ''}`,
              padding: '16px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '10px',
            } as CSSProperties
          }
        >
          <div>
            <div style={{ fontSize: '13px', opacity: '.85' }}>{vm.tk?.pos}</div>
            <div style={{ fontWeight: '900', fontSize: '22px', fontStretch: '108%' }}>{vm.tk?.event}</div>
            <div style={{ fontWeight: '700', fontSize: '16px', marginTop: '2px' }}>{vm.tk?.type}</div>
          </div>
          <span
            style={
              {
                fontSize: '13px',
                fontWeight: '800',
                padding: '5px 9px',
                borderRadius: '6px',
                background: `${vm.tk?.b?.bg ?? ''}`,
                color: `${vm.tk?.b?.fg ?? ''}`,
              } as CSSProperties
            }
          >
            {vm.tk?.b?.label}
          </span>
        </div>
        <div
          style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}
        >
          {vm.tk?.valid ? (
            <>
              <div
                style={{
                  background: '#fff',
                  padding: '16px',
                  border: '1px solid #E4E4EC',
                  borderRadius: '10px',
                  width: 'min(100%,264px)',
                  aspectRatio: '1',
                }}
              >
                <svg
                  viewBox="-2 -2 29 29"
                  width="100%"
                  height="100%"
                  role="img"
                  aria-label="QR Code do ingresso"
                  style={{ display: 'block' }}
                >
                  <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
                  <path d={vm.tk?.qr} fill="#000" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: '18px',
                  fontWeight: '600',
                  letterSpacing: '.04em',
                }}
              >
                {vm.tk?.code}
              </span>
              <span style={{ fontSize: '12px', color: '#5B5B6E' }}>QR demonstrativo · sem validade real</span>
            </>
          ) : null}
          {vm.tk?.invalid ? (
            <>
              <div
                style={
                  {
                    width: '100%',
                    borderRadius: '14px',
                    padding: '20px',
                    background: `${vm.tk?.stBg ?? ''}`,
                    color: `${vm.tk?.stFg ?? ''}`,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  } as CSSProperties
                }
              >
                <b style={{ fontSize: '20px' }}>{vm.tk?.stTitle}</b>
                <span style={{ fontSize: '14px', lineHeight: '1.5' }}>{vm.tk?.stText}</span>
              </div>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: '16px',
                  color: '#5B5B6E',
                  textDecoration: 'line-through',
                }}
              >
                {vm.tk?.code}
              </span>
            </>
          ) : null}
        </div>
        <dl
          style={{
            margin: '0',
            padding: '0 18px 18px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px 16px',
          }}
        >
          {(vm.tk?.fields ?? []).map((f: Loose, $index: number) => (
            <Fragment key={$index}>
              <div style={{ gridColumn: `${f?.span ?? ''}` } as CSSProperties}>
                <dt style={{ fontSize: '12px', color: '#5B5B6E', fontWeight: '600' }}>{f?.k}</dt>
                <dd style={{ margin: '2px 0 0', fontWeight: '600', fontSize: '15px' }}>{f?.v}</dd>
              </div>
            </Fragment>
          ))}
        </dl>
        <div style={{ display: 'flex', gap: '10px', padding: '0 18px 18px', flexWrap: 'wrap' }}>
          {vm.tk?.valid ? (
            <button
              onClick={vm.tk?.full}
              style={{
                flex: '1 1 160px',
                height: '52px',
                borderRadius: '12px',
                background: '#7C3AED',
                color: '#fff',
                border: '0',
                fontWeight: '700',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              Abrir em tela cheia
            </button>
          ) : null}
          <button
            onClick={vm.tk?.dl}
            style={{
              flex: '1 1 160px',
              height: '52px',
              borderRadius: '12px',
              background: '#fff',
              color: '#0B0B10',
              border: '1px solid #D4D4DE',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Baixar PDF
          </button>
        </div>
      </article>
      {vm.tk?.multi ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <button
            onClick={vm.tk?.prev}
            style={
              {
                height: '48px',
                padding: '0 16px',
                borderRadius: '10px',
                background: '#fff',
                border: '1px solid #D4D4DE',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: `${vm.tk?.prevOp ?? ''}`,
              } as CSSProperties
            }
          >
            ‹ Anterior
          </button>
          <button
            onClick={vm.tk?.next}
            style={
              {
                height: '48px',
                padding: '0 16px',
                borderRadius: '10px',
                background: '#fff',
                border: '1px solid #D4D4DE',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: `${vm.tk?.nextOp ?? ''}`,
              } as CSSProperties
            }
          >
            Próximo ›
          </button>
        </div>
      ) : null}
    </main>
  );
}
