import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function CheckoutPayment({ vm }: { vm: ViewModel }) {
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
        Como você quer pagar?
      </h1>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(vm.ck?.methods ?? []).map((m: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              role="radio"
              aria-checked={m?.on}
              onClick={m?.onClick}
              style={
                {
                  textAlign: 'left',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start',
                  padding: '16px',
                  borderRadius: '14px',
                  background: '#fff',
                  border: `2px solid ${m?.bd ?? ''}`,
                  cursor: 'pointer',
                  color: '#0B0B10',
                } as CSSProperties
              }
            >
              <span
                style={
                  {
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    border: `2px solid ${m?.rb ?? ''}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                    marginTop: '2px',
                  } as CSSProperties
                }
              >
                <span
                  style={
                    {
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: `${m?.dot ?? ''}`,
                    } as CSSProperties
                  }
                />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <b style={{ fontSize: '17px' }}>{m?.label}</b>
                <span style={{ fontSize: '14px', color: '#3F3F50', lineHeight: '1.45' }}>{m?.text}</span>
              </span>
            </button>
          </Fragment>
        ))}
      </div>
      <div
        style={{
          fontSize: '14px',
          color: '#3F3F50',
          lineHeight: '1.5',
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '12px',
          padding: '12px 14px',
        }}
      >
        O pagamento é processado pelo gateway na conta da PartyX. Ao continuar, seus ingressos ficam reservados pelo
        prazo exibido. Leia a{' '}
        <button
          onClick={vm.go?.P06}
          style={{
            background: 'none',
            border: '0',
            padding: '0',
            color: '#5B21B6',
            textDecoration: 'underline',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Política de Cancelamento, Troca e Reembolso
        </button>
        .
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={vm.ck?.startPay}
          style={
            {
              height: '52px',
              borderRadius: '12px',
              background: '#7C3AED',
              color: '#fff',
              border: '0',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '0 28px',
              flex: `${vm.ck?.btnFlex ?? ''}`,
            } as CSSProperties
          }
        >
          {vm.ck?.startLabel}
        </button>
        <button
          onClick={vm.go?.C02}
          style={
            {
              height: '52px',
              borderRadius: '12px',
              background: '#fff',
              color: '#0B0B10',
              border: '1px solid #D4D4DE',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '0 20px',
              flex: `${vm.ck?.btnFlex ?? ''}`,
            } as CSSProperties
          }
        >
          Voltar à revisão
        </button>
      </div>
    </>
  );
}
