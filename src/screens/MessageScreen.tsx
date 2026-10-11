import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function MessageScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label={vm.msg?.label}
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '40px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div
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
              background: `${vm.msg?.iBg ?? ''}`,
              color: `${vm.msg?.iFg ?? ''}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: '900',
            } as CSSProperties
          }
        >
          {vm.msg?.icon}
        </div>
        {vm.msg?.eyebrow ? (
          <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.08em', color: '#5B5B6E' }}>
            {vm.msg?.eyebrow}
          </span>
        ) : null}
        <h1
          style={{
            margin: '0',
            fontSize: 'clamp(26px,4vw,32px)',
            lineHeight: '1.1',
            fontWeight: '900',
            fontStretch: '110%',
            letterSpacing: '-0.02em',
            textWrap: 'pretty',
          }}
        >
          {vm.msg?.title}
        </h1>
        <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.55', color: '#3F3F50', textWrap: 'pretty' }}>
          {vm.msg?.body}
        </p>
        {vm.msg?.hasList ? (
          <ul
            style={{
              margin: '0',
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '15px',
              lineHeight: '1.5',
              color: '#3F3F50',
            }}
          >
            {(vm.msg?.list ?? []).map((l: Loose, $index: number) => (
              <Fragment key={$index}>
                <li>{l}</li>
              </Fragment>
            ))}
          </ul>
        ) : null}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px', width: '100%' }}>
          {(vm.msg?.actions ?? []).map((a: Loose, $index: number) => (
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
        {vm.msg?.note ? (
          <span style={{ fontSize: '13px', color: '#5B5B6E', lineHeight: '1.5' }}>{vm.msg?.note}</span>
        ) : null}
      </div>
      {vm.msg?.hasDemo ? (
        <div
          style={{
            border: '1px dashed #E6C35C',
            background: '#FFFBEB',
            borderRadius: '14px',
            padding: '14px',
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
            DEMO · {vm.msg?.demoTitle}
          </span>
          {(vm.msg?.demo ?? []).map((d: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={d?.onClick}
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
                {d?.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </main>
  );
}
