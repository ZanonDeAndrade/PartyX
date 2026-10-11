import { Fragment } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function NotesPanel({ vm }: { vm: ViewModel }) {
  return (
    <aside
      aria-label="Anotações para desenvolvimento"
      style={{
        position: 'fixed',
        left: '12px',
        bottom: '12px',
        zIndex: '190',
        width: 'min(380px,calc(100vw - 24px))',
        maxHeight: '50vh',
        overflowY: 'auto',
        background: '#0B0B10',
        color: '#fff',
        borderRadius: '14px',
        padding: '14px',
        boxShadow: '0 12px 32px rgba(11,11,16,.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
        <b style={{ fontSize: '14px' }}>
          Anotações · <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: '#C4B5FD' }}>{vm.nt?.id}</span>
        </b>
        <button
          onClick={vm.nt?.close}
          aria-label="Fechar anotações"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid #2C2C3A',
            background: 'transparent',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <ul
        style={{
          margin: '0',
          paddingLeft: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '13px',
          lineHeight: '1.5',
          color: '#D4D4DE',
        }}
      >
        {(vm.nt?.items ?? []).map((n: Loose, $index: number) => (
          <Fragment key={$index}>
            <li>{n}</li>
          </Fragment>
        ))}
      </ul>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: '#A6A6BA' }}>{vm.nt?.refs}</div>
    </aside>
  );
}
