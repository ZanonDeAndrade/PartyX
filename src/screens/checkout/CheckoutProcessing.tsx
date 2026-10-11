import type { ViewModel } from '../../logic/viewTypes';

export function CheckoutProcessing({ vm }: { vm: ViewModel }) {
  return (
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
        alignItems: 'flex-start',
      }}
    >
      <span
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '4px solid #EDE9FE',
          borderTopColor: '#7C3AED',
          animation: 'pxspin 1s linear infinite',
        }}
      />
      <h1 style={{ margin: '0', fontSize: 'clamp(26px,4vw,32px)', fontWeight: '900', fontStretch: '110%' }}>
        Confirmando seu pagamento
      </h1>
      <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.55', color: '#3F3F50' }}>
        Estamos aguardando a resposta do gateway. Isso leva alguns segundos. Não feche esta página e não faça um novo
        pagamento.
      </p>
      <span style={{ fontSize: '13px', color: '#5B5B6E', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#8B5CF6',
            animation: 'pxpulse 1.4s infinite',
          }}
        />
        Atualizando automaticamente
      </span>
      <button
        onClick={vm.ck?.viewOrder}
        style={{
          height: '48px',
          padding: '0 18px',
          borderRadius: '12px',
          background: '#fff',
          color: '#0B0B10',
          border: '1px solid #D4D4DE',
          fontWeight: '700',
          cursor: 'pointer',
        }}
      >
        Ver pedido
      </button>
    </section>
  );
}
