import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function CheckoutReview({ vm }: { vm: ViewModel }) {
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
        Revise seu pedido
      </h1>
      {vm.ck?.hasAlert ? (
        <div
          role="alert"
          style={{
            border: '1px solid #FDE68A',
            background: '#FFFBEB',
            color: '#854D0E',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '14px',
            lineHeight: '1.5',
          }}
        >
          <b>Atenção.</b> {vm.ck?.alert}
        </div>
      ) : null}
      <section
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>Ingressos</h2>
          <button
            onClick={vm.ck?.editSel}
            style={{
              background: 'none',
              border: '0',
              minHeight: '40px',
              color: '#5B21B6',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Alterar seleção
          </button>
        </div>
        {(vm.ck?.sum?.lines ?? []).map((l: Loose, $index: number) => (
          <Fragment key={$index}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '15px',
                padding: '10px 0',
                borderTop: '1px solid #EEEEF3',
              }}
            >
              <span>
                <b>{l?.qty} ×</b> {l?.name}
                <br />
                <span style={{ fontSize: '13px', color: '#5B5B6E' }}>{l?.unit} cada</span>
              </span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{l?.sub}</b>
            </div>
          </Fragment>
        ))}
      </section>
      <section
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>Dados do comprador</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#5B5B6E', fontWeight: '600' }}>NOME</div>
            <div style={{ fontWeight: '600', marginTop: '2px' }}>{vm.ck?.buyer?.name}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#5B5B6E', fontWeight: '600' }}>E-MAIL</div>
            <div style={{ fontWeight: '600', marginTop: '2px', overflowWrap: 'anywhere' }}>{vm.ck?.buyer?.email}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#5B5B6E', fontWeight: '600' }}>CPF</div>
            <div style={{ fontWeight: '600', marginTop: '2px' }}>{vm.ck?.buyer?.cpf}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#5B5B6E', fontWeight: '600' }}>TELEFONE</div>
            <div style={{ fontWeight: '600', marginTop: '2px' }}>{vm.ck?.buyer?.phone}</div>
          </div>
        </div>
        <div
          style={{
            fontSize: '14px',
            color: '#3F3F50',
            background: '#F7F7FA',
            borderRadius: '10px',
            padding: '10px 12px',
            lineHeight: '1.5',
          }}
        >
          Todos os ingressos deste pedido serão emitidos em nome de <b>{vm.ck?.buyer?.name}</b>.
        </div>
      </section>
      <section
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>
          Código do promoter <span style={{ fontWeight: '500', color: '#5B5B6E', fontSize: '14px' }}>(opcional)</span>
        </h2>
        <p style={{ margin: '0', fontSize: '14px', color: '#3F3F50', lineHeight: '1.5' }}>
          Se alguém indicou o evento, informe o código dessa pessoa. O código registra a indicação e não altera o valor
          do pedido.
        </p>
        {vm.ck?.promoApplied ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              border: '1px solid #BBF7D0',
              background: '#F0FDF4',
              borderRadius: '12px',
              padding: '10px 12px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '14px', color: '#14532D' }}>
              <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{vm.ck?.promoCode}</b> aplicado. Total inalterado.
            </span>
            <button
              onClick={vm.ck?.removePromo}
              style={{
                height: '40px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #BBF7D0',
                background: '#fff',
                color: '#14532D',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Remover
            </button>
          </div>
        ) : null}
        {vm.ck?.promoForm ? (
          <>
            <form onSubmit={vm.ck?.applyPromo} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Código</span>
                <input
                  value={vm.ck?.promoIn ?? ''}
                  onChange={vm.ck?.onPromo}
                  placeholder="Ex.: DUDA"
                  style={
                    {
                      height: '48px',
                      border: `${vm.ck?.promoBd ?? ''}`,
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                      textTransform: 'uppercase',
                      fontFamily: "'IBM Plex Mono',monospace",
                    } as CSSProperties
                  }
                />
              </label>
              <button
                type="submit"
                style={{
                  alignSelf: 'flex-end',
                  height: '48px',
                  padding: '0 18px',
                  borderRadius: '10px',
                  border: '1px solid #D4D4DE',
                  background: '#fff',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Aplicar
              </button>
            </form>
            {vm.ck?.promoErr ? (
              <span role="alert" style={{ fontSize: '13px', color: '#B91C1C' }}>
                {vm.ck?.promoErr}
              </span>
            ) : null}
          </>
        ) : null}
      </section>
      {vm.notMob ? (
        <button
          onClick={vm.ck?.toPay}
          style={{
            height: '52px',
            borderRadius: '12px',
            background: '#7C3AED',
            color: '#fff',
            border: '0',
            fontWeight: '700',
            fontSize: '16px',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            padding: '0 28px',
          }}
        >
          Ir para o pagamento
        </button>
      ) : null}
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
          DEMO
        </span>
        <button
          onClick={vm.ck?.simTaken}
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
          Outro comprador leva unidades antes do pagamento
        </button>
        <button
          onClick={vm.ck?.fillPromoBad}
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
          Código inválido (FESTA)
        </button>
        <button
          onClick={vm.ck?.fillPromoOff}
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
          Código desativado (THIAGO)
        </button>
        <button
          onClick={vm.ck?.fillPromoOk}
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
          Código válido (DUDA)
        </button>
      </div>
    </>
  );
}
