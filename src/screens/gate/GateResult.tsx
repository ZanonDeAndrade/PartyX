import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function GateResult({ vm }: { vm: ViewModel }) {
  return (
    <div
      data-screen-label={vm.gv?.res?.label}
      role="alert"
      style={
        {
          position: 'fixed',
          inset: '0',
          zIndex: '50',
          background: `${vm.gv?.res?.bg ?? ''}`,
          color: `${vm.gv?.res?.fg ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        } as CSSProperties
      }
    >
      <div
        style={
          {
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: '700',
            borderBottom: `1px solid ${vm.gv?.res?.line ?? ''}`,
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
          } as CSSProperties
        }
      >
        <span>
          Validando: {vm.gv?.evName} · {vm.gv?.evDate}
        </span>
        <span>Entradas {vm.gv?.count}</span>
      </div>
      <div
        style={{
          flex: '1',
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto',
          padding: '28px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            border: '6px solid currentColor',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '54px',
            fontWeight: '900',
            lineHeight: '1',
          }}
        >
          {vm.gv?.res?.icon}
        </div>
        <h1
          style={{
            margin: '0',
            fontSize: 'clamp(38px,9vw,56px)',
            lineHeight: '1',
            fontWeight: '900',
            fontStretch: '112%',
            letterSpacing: '-0.02em',
          }}
        >
          {vm.gv?.res?.title}
        </h1>
        {vm.gv?.res?.big ? (
          <div
            style={
              {
                fontSize: 'clamp(28px,7vw,40px)',
                fontWeight: '900',
                padding: '10px 14px',
                borderRadius: '12px',
                background: `${vm.gv?.res?.bigBg ?? ''}`,
                alignSelf: 'flex-start',
              } as CSSProperties
            }
          >
            {vm.gv?.res?.big}
          </div>
        ) : null}
        <p style={{ margin: '0', fontSize: '18px', lineHeight: '1.45', fontWeight: '600' }}>{vm.gv?.res?.sub}</p>
        <dl
          style={{
            margin: '0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: '10px',
          }}
        >
          {(vm.gv?.res?.lines ?? []).map((l: Loose, $index: number) => (
            <Fragment key={$index}>
              <div>
                <dt style={{ fontSize: '12px', fontWeight: '700', opacity: '.85' }}>{l?.k}</dt>
                <dd style={{ margin: '2px 0 0', fontSize: '17px', fontWeight: '700', overflowWrap: 'anywhere' }}>
                  {l?.v}
                </dd>
              </div>
            </Fragment>
          ))}
        </dl>
        {vm.gv?.res?.hint ? (
          <div
            style={
              {
                borderRadius: '12px',
                padding: '12px 14px',
                background: `${vm.gv?.res?.hintBg ?? ''}`,
                fontSize: '15px',
                lineHeight: '1.5',
                fontWeight: '600',
              } as CSSProperties
            }
          >
            {vm.gv?.res?.hint}
          </div>
        ) : null}
        <span style={{ fontSize: '13px', fontWeight: '700', opacity: '.9' }}>{vm.gv?.res?.sound}</span>
      </div>
      <div
        style={{
          padding: '14px 18px 22px',
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {(vm.gv?.res?.extra ?? []).map((a: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={a?.onClick}
              style={{
                height: '56px',
                borderRadius: '14px',
                background: 'transparent',
                color: 'inherit',
                border: '2px solid currentColor',
                fontWeight: '800',
                fontSize: '17px',
                cursor: 'pointer',
              }}
            >
              {a?.label}
            </button>
          </Fragment>
        ))}
        <button
          onClick={vm.gv?.res?.next}
          aria-disabled={vm.gv?.res?.cooling}
          style={
            {
              height: '68px',
              borderRadius: '16px',
              background: `${vm.gv?.res?.btnBg ?? ''}`,
              color: `${vm.gv?.res?.btnFg ?? ''}`,
              border: '0',
              fontWeight: '900',
              fontSize: '20px',
              cursor: 'pointer',
              opacity: `${vm.gv?.res?.btnOp ?? ''}`,
            } as CSSProperties
          }
        >
          {vm.gv?.res?.nextLabel}
        </button>
      </div>
    </div>
  );
}
