import { type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';

export function SiteFooter({ vm }: { vm: ViewModel }) {
  return (
    <footer
      style={
        {
          background: '#0B0B10',
          color: '#D4D4DE',
          borderTop: '1px solid #1E1E2A',
          marginTop: `${vm.footMt ?? ''}`,
        } as CSSProperties
      }
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '36px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: '28px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <img src="/brand/partyx-logo.png" width={58} height={32} alt="PartyX" style={{ display: 'block' }} loading="lazy" />
          <span style={{ fontSize: '14px', lineHeight: '1.5' }}>Razão social e CNPJ: a fornecer pela PartyX</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
          <b style={{ color: '#fff' }}>Atendimento ao comprador</b>
          <span>E-mail: a fornecer pela PartyX</span>
          <span>WhatsApp: a fornecer pela PartyX</span>
          <span style={{ color: '#A6A6BA' }}>Horário de atendimento: a definir</span>
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '14px', alignItems: 'flex-start' }}
        >
          <b style={{ color: '#fff', marginBottom: '6px' }}>Documentos</b>
          <button
            onClick={vm.go?.P04}
            style={{
              background: 'none',
              border: '0',
              color: '#D4D4DE',
              padding: '0',
              minHeight: '36px',
              fontSize: '14px',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Termos de Uso
          </button>
          <button
            onClick={vm.go?.P05}
            style={{
              background: 'none',
              border: '0',
              color: '#D4D4DE',
              padding: '0',
              minHeight: '36px',
              fontSize: '14px',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Política de Privacidade
          </button>
          <button
            onClick={vm.go?.P06}
            style={{
              background: 'none',
              border: '0',
              color: '#D4D4DE',
              padding: '0',
              minHeight: '36px',
              fontSize: '14px',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Cancelamento, troca e reembolso
          </button>
        </div>
      </div>
    </footer>
  );
}
