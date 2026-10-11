import { type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';

export function CheckoutPix({ vm }: { vm: ViewModel }) {
  return (
    <>
      <h1
        style={{
          margin: '0',
          fontSize: 'clamp(26px,4vw,34px)',
          fontWeight: '900',
          fontStretch: '110%',
          letterSpacing: '-0.02em',
        }}
      >
        Pague com Pix
      </h1>
      <div
        style={
          {
            display: 'grid',
            gridTemplateColumns: `${vm.ck?.pixCols ?? ''}`,
            gap: '16px',
            alignItems: 'start',
          } as CSSProperties
        }
      >
        <div
          style={{
            background: '#7C3AED',
            borderRadius: '18px',
            padding: '16px',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              alignSelf: 'stretch',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: '800',
              letterSpacing: '.06em',
            }}
          >
            <span>PAGAMENTO PIX</span>
            <span>{vm.ck?.sum?.total}</span>
          </div>
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '12px',
              width: '228px',
              height: '228px',
              position: 'relative',
            }}
          >
            <svg
              viewBox="-2 -2 29 29"
              width="100%"
              height="100%"
              role="img"
              aria-label="QR Code Pix de pagamento"
              style={{ display: 'block' }}
            >
              <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
              <path d={vm.ck?.pixQR} fill="#0B0B10" />
            </svg>
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%,-50%)',
                background: '#fff',
                padding: '4px 6px',
                borderRadius: '4px',
                fontWeight: '900',
                fontSize: '14px',
                color: '#5B21B6',
              }}
            >
              Pix
            </span>
          </div>
          <span style={{ fontSize: '13px', textAlign: 'center', lineHeight: '1.4' }}>
            QR de pagamento. Não é o seu ingresso.
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid #E4E4EC',
              borderRadius: '14px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: '700' }}>Pix copia e cola</span>
            <div
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: '13px',
                background: '#F7F7FA',
                border: '1px solid #E4E4EC',
                borderRadius: '10px',
                padding: '10px',
                overflowWrap: 'anywhere',
                lineHeight: '1.45',
                color: '#3F3F50',
              }}
            >
              {vm.ck?.pixCode}
            </div>
            <button
              onClick={vm.ck?.copyPix}
              style={{
                height: '48px',
                borderRadius: '10px',
                background: '#0B0B10',
                color: '#fff',
                border: '0',
                fontWeight: '700',
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              Copiar código Pix
            </button>
          </div>
          <ol
            style={{
              margin: '0',
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '15px',
              lineHeight: '1.5',
              color: '#3F3F50',
            }}
          >
            <li>Abra o aplicativo do seu banco e escolha pagar com Pix.</li>
            <li>Leia o QR Code ou cole o código copiado.</li>
            <li>Confirme o valor de {vm.ck?.sum?.total} e conclua.</li>
          </ol>
          <div
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '12px',
              padding: '12px 14px',
              color: '#854D0E',
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#EAB308',
                animation: 'pxpulse 1.4s ease-in-out infinite',
                flex: 'none',
              }}
            />
            <span style={{ fontSize: '14px', lineHeight: '1.45' }}>
              <b>Aguardando pagamento.</b> Esta página atualiza sozinha quando o gateway confirmar. Os ingressos são
              liberados depois da confirmação.
            </span>
          </div>
          <button
            onClick={vm.go?.C03}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: '0',
              minHeight: '40px',
              color: '#5B21B6',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            Trocar forma de pagamento
          </button>
        </div>
      </div>
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
          DEMO · resposta do gateway
        </span>
        <button
          onClick={vm.ck?.simApprove}
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
          Pix pago
        </button>
        <button
          onClick={vm.ck?.simExpire}
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
          Prazo expira
        </button>
        <button
          onClick={vm.ck?.simLateNo}
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
          Pago após expirar, sem estoque
        </button>
        <button
          onClick={vm.ck?.simLateYes}
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
          Pago após expirar, com estoque
        </button>
      </div>
    </>
  );
}
