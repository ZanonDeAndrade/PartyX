import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function OrderDetailScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="U03 Detalhe da compra"
      style={
        {
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `20px 16px ${vm.me?.padB ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        } as CSSProperties
      }
    >
      <button
        onClick={vm.go?.U02}
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
        ‹ Minhas compras
      </button>
      <div>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#5B5B6E' }}>
          Pedido {vm.od?.num} · {vm.od?.created}
        </span>
        <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(26px,4vw,34px)', fontWeight: '900', fontStretch: '110%' }}>
          {vm.od?.event}
        </h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px' }}>
        {(vm.od?.status ?? []).map((b: Loose, $index: number) => (
          <Fragment key={$index}>
            <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#5B5B6E', fontWeight: '600' }}>{b?.k}</div>
              <span
                style={
                  {
                    display: 'inline-block',
                    marginTop: '6px',
                    fontSize: '13px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: `${b?.bg ?? ''}`,
                    color: `${b?.fg ?? ''}`,
                  } as CSSProperties
                }
              >
                {b?.label}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
      {vm.od?.cta?.show ? (
        <div
          style={
            {
              borderRadius: '14px',
              padding: '14px 16px',
              background: `${vm.od?.cta?.bg ?? ''}`,
              color: `${vm.od?.cta?.fg ?? ''}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            } as CSSProperties
          }
        >
          <span style={{ fontSize: '15px', lineHeight: '1.5', flex: '1 1 260px' }}>{vm.od?.cta?.text}</span>
          <button
            onClick={vm.od?.cta?.onClick}
            style={{
              height: '48px',
              padding: '0 18px',
              borderRadius: '10px',
              background: '#0B0B10',
              color: '#fff',
              border: '0',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            {vm.od?.cta?.label}
          </button>
        </div>
      ) : null}
      <div
        style={
          {
            display: 'grid',
            gridTemplateColumns: `${vm.od?.cols ?? ''}`,
            gap: '14px',
            alignItems: 'start',
          } as CSSProperties
        }
      >
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
          <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>Resumo</h2>
          {(vm.od?.lines ?? []).map((l: Loose, $index: number) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px' }}>
                <span>
                  {l?.qty} × {l?.name}
                </span>
                <span>{l?.sub}</span>
              </div>
            </Fragment>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid #EEEEF3',
              paddingTop: '10px',
              fontSize: '17px',
            }}
          >
            <b>Total</b>
            <b>{vm.od?.total}</b>
          </div>
          <div style={{ fontSize: '14px', color: '#3F3F50' }}>Pagamento: {vm.od?.method}</div>
          {vm.od?.hasPromo ? (
            <div style={{ fontSize: '14px', color: '#3F3F50' }}>
              Código do promoter: <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{vm.od?.promo}</span>
            </div>
          ) : null}
        </section>
        <section
          style={{
            background: '#fff',
            border: '1px solid #E4E4EC',
            borderRadius: '16px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>Ingressos</h2>
          {vm.od?.noTickets ? (
            <span style={{ fontSize: '14px', color: '#5B5B6E', lineHeight: '1.5' }}>{vm.od?.noTicketsText}</span>
          ) : null}
          {(vm.od?.tickets ?? []).map((k: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={k?.onClick}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 0',
                  border: '0',
                  borderTop: '1px solid #EEEEF3',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: '#0B0B10',
                }}
              >
                <span>
                  <b>{k?.type}</b>
                  <br />
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#5B5B6E' }}>
                    {k?.code}
                  </span>
                </span>
                <span
                  style={
                    {
                      fontSize: '12px',
                      fontWeight: '700',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: `${k?.b?.bg ?? ''}`,
                      color: `${k?.b?.fg ?? ''}`,
                    } as CSSProperties
                  }
                >
                  {k?.b?.label}
                </span>
              </button>
            </Fragment>
          ))}
          {vm.od?.canDl ? (
            <button
              onClick={vm.od?.dl}
              style={{
                marginTop: '6px',
                height: '44px',
                borderRadius: '10px',
                background: '#fff',
                border: '1px solid #D4D4DE',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Baixar PDF com todos os ingressos
            </button>
          ) : null}
        </section>
      </div>
      <section style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', padding: '18px' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: '800' }}>Histórico</h2>
        {(vm.od?.hist ?? []).map((h: Loose, $index: number) => (
          <Fragment key={$index}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: '10px',
                fontSize: '14px',
                padding: '6px 0',
                borderTop: '1px solid #F1F1F5',
              }}
            >
              <span style={{ color: '#5B5B6E', fontVariantNumeric: 'tabular-nums' }}>{h?.t}</span>
              <span>{h?.l}</span>
            </div>
          </Fragment>
        ))}
      </section>
      <div
        style={{
          fontSize: '14px',
          color: '#3F3F50',
          lineHeight: '1.55',
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '14px',
          padding: '14px',
        }}
      >
        Precisa cancelar ou pedir reembolso? Esses pedidos são atendidos pela PartyX conforme a{' '}
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
        . Contato de atendimento: a fornecer pela PartyX.
      </div>
    </main>
  );
}
