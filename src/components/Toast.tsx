import { type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';

export function Toast({ vm }: { vm: ViewModel }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={
        {
          position: 'fixed',
          left: '50%',
          bottom: `${vm.tst?.bottom ?? ''}`,
          transform: 'translateX(-50%)',
          zIndex: '80',
          width: 'max-content',
          maxWidth: 'calc(100% - 24px)',
          background: `${vm.tst?.bg ?? ''}`,
          color: '#fff',
          borderRadius: '12px',
          padding: '12px 14px',
          fontSize: '14px',
          lineHeight: '1.45',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          boxShadow: '0 12px 32px rgba(11,11,16,.25)',
        } as CSSProperties
      }
    >
      <span>{vm.tst?.text}</span>
      {vm.tst?.hasAction ? (
        <a href={vm.tst?.href} style={{ color: '#C4B5FD', fontWeight: '700', whiteSpace: 'nowrap' }}>
          {vm.tst?.label}
        </a>
      ) : null}
      <button
        onClick={vm.tst?.close}
        aria-label="Fechar aviso"
        style={{
          background: 'none',
          border: '0',
          color: '#C4B5FD',
          fontWeight: '700',
          cursor: 'pointer',
          minHeight: '32px',
        }}
      >
        Fechar
      </button>
    </div>
  );
}
