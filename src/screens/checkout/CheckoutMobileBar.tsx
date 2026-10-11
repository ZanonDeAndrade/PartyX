import type { ViewModel } from '../../logic/viewTypes';

export function CheckoutMobileBar({ vm }: { vm: ViewModel }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '25',
        background: '#fff',
        borderTop: '1px solid #E4E4EC',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 -8px 24px rgba(11,11,16,.06)',
      }}
    >
      <div style={{ flex: '1' }}>
        <div style={{ fontSize: '12px', color: '#5B5B6E' }}>Total</div>
        <div style={{ fontSize: '18px', fontWeight: '800' }}>{vm.ck?.sum?.total}</div>
      </div>
      <button
        onClick={vm.ck?.toPay}
        style={{
          height: '52px',
          padding: '0 20px',
          borderRadius: '12px',
          background: '#7C3AED',
          color: '#fff',
          border: '0',
          fontWeight: '700',
          fontSize: '16px',
          cursor: 'pointer',
        }}
      >
        Ir para o pagamento
      </button>
    </div>
  );
}
