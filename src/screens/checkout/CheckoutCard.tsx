import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function CheckoutCard({ vm }: { vm: ViewModel }) {
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
        Pague com cartão de crédito
      </h1>
      <section
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div
          style={{
            border: '2px dashed #C4B5FD',
            borderRadius: '14px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            position: 'relative',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '-11px',
              left: '12px',
              background: '#fff',
              padding: '0 6px',
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '11px',
              color: '#5B21B6',
            }}
          >
            componente seguro do gateway · tokenizado
          </span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Número do cartão</span>
            <input
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              style={
                {
                  height: '48px',
                  border: `${vm.ck?.cardBd ?? ''}`,
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                } as CSSProperties
              }
            />
            {vm.ck?.cardErr ? (
              <span role="alert" style={{ fontSize: '13px', color: '#B91C1C' }}>
                {vm.ck?.cardErr}
              </span>
            ) : null}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Nome impresso no cartão</span>
            <input
              autoComplete="cc-name"
              style={{
                height: '48px',
                border: '1px solid #D4D4DE',
                borderRadius: '10px',
                padding: '0 14px',
                fontSize: '16px',
              }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Validade</span>
              <input
                placeholder="MM/AA"
                style={{
                  height: '48px',
                  border: '1px solid #D4D4DE',
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                  minWidth: '0',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Código de segurança</span>
              <input
                inputMode="numeric"
                placeholder="CVV"
                style={{
                  height: '48px',
                  border: '1px solid #D4D4DE',
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                  minWidth: '0',
                }}
              />
            </label>
          </div>
        </div>
        {vm.ck?.inst ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Parcelamento</span>
            <select
              style={{
                height: '48px',
                border: '1px solid #D4D4DE',
                borderRadius: '10px',
                padding: '0 12px',
                fontSize: '16px',
                background: '#fff',
              }}
            >
              <option>À vista: {vm.ck?.sum?.total}</option>
              <option>Demais opções retornadas pelo gateway</option>
            </select>
            <span style={{ fontSize: '12px', color: '#5B5B6E' }}>
              Opções e eventuais juros vêm do gateway aprovado. Nenhuma condição é fixada pela plataforma.
            </span>
          </label>
        ) : null}
        <button
          onClick={vm.ck?.payCard}
          style={
            {
              height: '52px',
              borderRadius: '12px',
              background: `${vm.ck?.payBg ?? ''}`,
              color: '#fff',
              border: '0',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            } as CSSProperties
          }
        >
          {vm.ck?.payLabel}
        </button>
        <span style={{ fontSize: '13px', color: '#5B5B6E', lineHeight: '1.5' }}>
          Os dados do cartão vão direto para o gateway de pagamento e não passam pelos servidores da PartyX. Nenhum
          cartão fica salvo.
        </span>
      </section>
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
          DEMO · resultado ao pagar
        </span>
        {(vm.ck?.outcomes ?? []).map((o: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={o?.onClick}
              style={
                {
                  minHeight: '36px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E6C35C',
                  background: `${o?.bg ?? ''}`,
                  color: `${o?.fg ?? ''}`,
                  fontSize: '13px',
                  cursor: 'pointer',
                } as CSSProperties
              }
            >
              {o?.label}
            </button>
          </Fragment>
        ))}
        <button
          onClick={vm.ck?.toggleInst}
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
          {vm.ck?.instLabel}
        </button>
      </div>
    </>
  );
}
