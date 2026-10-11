import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function CheckoutResult({ vm }: { vm: ViewModel }) {
  return (
    <section
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
      <div
        style={
          {
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: `${vm.ck?.res?.iBg ?? ''}`,
            color: `${vm.ck?.res?.iFg ?? ''}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            fontWeight: '900',
          } as CSSProperties
        }
      >
        {vm.ck?.res?.icon}
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#5B5B6E' }}>
        Pedido {vm.ck?.num}
      </span>
      <h1
        style={{
          margin: '0',
          fontSize: 'clamp(26px,4vw,32px)',
          lineHeight: '1.1',
          fontWeight: '900',
          fontStretch: '110%',
          textWrap: 'pretty',
        }}
      >
        {vm.ck?.res?.title}
      </h1>
      <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.55', color: '#3F3F50', textWrap: 'pretty' }}>
        {vm.ck?.res?.body}
      </p>
      {vm.ck?.res?.hasBox ? (
        <div
          style={
            {
              width: '100%',
              borderRadius: '12px',
              padding: '14px',
              background: `${vm.ck?.res?.boxBg ?? ''}`,
              color: `${vm.ck?.res?.boxFg ?? ''}`,
              fontSize: '14px',
              lineHeight: '1.55',
            } as CSSProperties
          }
        >
          <b>{vm.ck?.res?.boxTitle}</b>
          <br />
          {vm.ck?.res?.box}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
        {(vm.ck?.res?.actions ?? []).map((a: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={a?.onClick}
              style={
                {
                  height: '52px',
                  padding: '0 20px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  fontSize: '16px',
                  cursor: 'pointer',
                  background: `${a?.bg ?? ''}`,
                  color: `${a?.fg ?? ''}`,
                  border: `${a?.bd ?? ''}`,
                  flex: `${a?.flex ?? ''}`,
                } as CSSProperties
              }
            >
              {a?.label}
            </button>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
