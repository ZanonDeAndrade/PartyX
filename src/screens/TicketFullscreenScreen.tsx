import { type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';

export function TicketFullscreenScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="U05 Ingresso em tela cheia"
      style={{
        minHeight: '100%',
        background: '#fff',
        color: '#0B0B10',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 16px 24px',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '14px', color: '#5B5B6E' }}>{vm.tk?.pos}</span>
        <button
          onClick={vm.tk?.close}
          style={{
            height: '48px',
            padding: '0 16px',
            borderRadius: '12px',
            border: '1px solid #D4D4DE',
            background: '#fff',
            fontWeight: '700',
            fontSize: '15px',
            cursor: 'pointer',
          }}
        >
          Fechar ×
        </button>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: '900', fontSize: '24px', fontStretch: '108%' }}>{vm.tk?.event}</div>
        <div style={{ fontSize: '15px', color: '#3F3F50' }}>
          {vm.tk?.date} · {vm.tk?.time}
        </div>
      </div>
      <div
        style={{
          fontSize: '28px',
          fontWeight: '900',
          padding: '6px 14px',
          borderRadius: '10px',
          background: '#0B0B10',
          color: '#fff',
        }}
      >
        {vm.tk?.type}
      </div>
      {vm.tk?.valid ? (
        <>
          <div
            style={{
              width: 'min(88vw,360px)',
              aspectRatio: '1',
              background: '#fff',
              padding: '24px',
              border: '1px solid #E4E4EC',
              borderRadius: '12px',
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
          <div
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '22px',
              fontWeight: '600',
              letterSpacing: '.05em',
            }}
          >
            {vm.tk?.code}
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>{vm.tk?.holder}</div>
          <div
            style={{
              fontSize: '14px',
              color: '#3F3F50',
              background: '#F7F7FA',
              borderRadius: '10px',
              padding: '10px 14px',
              textAlign: 'center',
              maxWidth: '360px',
              lineHeight: '1.45',
            }}
          >
            Aumente o brilho da tela e segure o celular parado para facilitar a leitura.
          </div>
        </>
      ) : null}
      {vm.tk?.invalid ? (
        <>
          <div
            style={
              {
                width: 'min(88vw,360px)',
                aspectRatio: '1',
                borderRadius: '16px',
                background: `${vm.tk?.stBg ?? ''}`,
                color: `${vm.tk?.stFg ?? ''}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '24px',
                textAlign: 'center',
              } as CSSProperties
            }
          >
            <b style={{ fontSize: '28px', lineHeight: '1.1' }}>{vm.tk?.stTitle}</b>
            <span style={{ fontSize: '15px', lineHeight: '1.5' }}>{vm.tk?.stText}</span>
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '18px',
              color: '#5B5B6E',
              textDecoration: 'line-through',
            }}
          >
            {vm.tk?.code}
          </div>
        </>
      ) : null}
      {vm.tk?.multi ? (
        <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '360px' }}>
          <button
            onClick={vm.tk?.prev}
            style={
              {
                flex: '1',
                height: '52px',
                borderRadius: '12px',
                border: '1px solid #D4D4DE',
                background: '#fff',
                fontWeight: '700',
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
                flex: '1',
                height: '52px',
                borderRadius: '12px',
                border: '1px solid #D4D4DE',
                background: '#fff',
                fontWeight: '700',
                cursor: 'pointer',
                opacity: `${vm.tk?.nextOp ?? ''}`,
              } as CSSProperties
            }
          >
            Próximo ›
          </button>
        </div>
      ) : null}
      <span style={{ fontSize: '12px', color: '#5B5B6E' }}>QR demonstrativo · sem validade real</span>
    </main>
  );
}
