import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';
import { CheckoutTimer } from './checkout/CheckoutTimer';
import { CheckoutReview } from './checkout/CheckoutReview';
import { CheckoutPayment } from './checkout/CheckoutPayment';
import { CheckoutPix } from './checkout/CheckoutPix';
import { CheckoutCard } from './checkout/CheckoutCard';
import { CheckoutProcessing } from './checkout/CheckoutProcessing';
import { CheckoutConfirmed } from './checkout/CheckoutConfirmed';
import { CheckoutResult } from './checkout/CheckoutResult';
import { CheckoutMobileBar } from './checkout/CheckoutMobileBar';

export function CheckoutScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label={vm.ck?.label}
      style={{ maxWidth: '1120px', margin: '0 auto', padding: `24px 16px ${vm.ck?.padB ?? ''}` } as CSSProperties}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(vm.ck?.steps ?? []).map((st: Loose, $index: number) => (
          <Fragment key={$index}>
            <span
              style={
                {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: `${st?.fw ?? ''}`,
                  color: `${st?.fg ?? ''}`,
                } as CSSProperties
              }
            >
              <span
                style={
                  {
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: '800',
                    background: `${st?.bg ?? ''}`,
                    color: `${st?.nfg ?? ''}`,
                  } as CSSProperties
                }
              >
                {st?.n}
              </span>
              {st?.label}
              <span style={{ color: '#C9C9D6', display: `${st?.sep ?? ''}` } as CSSProperties}>›</span>
            </span>
          </Fragment>
        ))}
      </div>
      <div
        style={
          {
            display: 'grid',
            gridTemplateColumns: `${vm.ck?.cols ?? ''}`,
            gap: '24px',
            alignItems: 'start',
          } as CSSProperties
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '0' }}>
          {vm.ck?.timer?.show ? <CheckoutTimer vm={vm} /> : null}
          {vm.is?.C02 ? <CheckoutReview vm={vm} /> : null}
          {vm.is?.C03 ? <CheckoutPayment vm={vm} /> : null}
          {vm.is?.C04 ? <CheckoutPix vm={vm} /> : null}
          {vm.is?.C05 ? <CheckoutCard vm={vm} /> : null}
          {vm.is?.C06 ? <CheckoutProcessing vm={vm} /> : null}
          {vm.is?.C07 ? <CheckoutConfirmed vm={vm} /> : null}
          {vm.ck?.res?.show ? <CheckoutResult vm={vm} /> : null}
        </div>
        <aside
          style={
            {
              background: '#fff',
              border: '1px solid #E4E4EC',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: `${vm.ck?.asidePos ?? ''}`,
              top: '88px',
            } as CSSProperties
          }
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div
              style={
                {
                  width: '64px',
                  height: '48px',
                  borderRadius: '8px',
                  flex: 'none',
                  background: `repeating-linear-gradient(135deg,${vm.ck?.sum?.c1 ?? ''} 0 6px,${vm.ck?.sum?.c2 ?? ''} 6px 12px)`,
                } as CSSProperties
              }
            />
            <div style={{ minWidth: '0' }}>
              <div style={{ fontWeight: '800' }}>{vm.ck?.sum?.event}</div>
              <div style={{ fontSize: '13px', color: '#5B5B6E' }}>{vm.ck?.sum?.date}</div>
              <div style={{ fontSize: '13px', color: '#5B5B6E' }}>{vm.ck?.sum?.venue}</div>
            </div>
          </div>
          {vm.ck?.sum?.hasBadges ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(vm.ck?.sum?.badges ?? []).map((b: Loose, $index: number) => (
                <Fragment key={$index}>
                  <span
                    style={
                      {
                        fontSize: '12px',
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
                </Fragment>
              ))}
            </div>
          ) : null}
          <div
            style={{
              borderTop: '1px solid #EEEEF3',
              paddingTop: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {(vm.ck?.sum?.lines ?? []).map((l: Loose, $index: number) => (
              <Fragment key={$index}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '14px' }}>
                  <span>
                    {l?.qty} × {l?.name}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l?.sub}</span>
                </div>
              </Fragment>
            ))}
            {vm.ck?.sum?.hasPromo ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  fontSize: '13px',
                  color: '#5B5B6E',
                }}
              >
                <span>Promoter</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{vm.ck?.sum?.promo}</span>
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTop: '1px solid #EEEEF3',
              paddingTop: '10px',
            }}
          >
            <b>Total</b>
            <b style={{ fontSize: '22px', fontVariantNumeric: 'tabular-nums' }}>{vm.ck?.sum?.total}</b>
          </div>
          <span style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.45' }}>
            Ingressos em nome de {vm.ck?.buyer?.name}. Pagamento processado pelo gateway na conta da PartyX.
          </span>
        </aside>
      </div>
      {vm.ck?.mobBar ? <CheckoutMobileBar vm={vm} /> : null}
    </main>
  );
}
