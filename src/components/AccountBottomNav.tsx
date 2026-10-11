import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function AccountBottomNav({ vm }: { vm: ViewModel }) {
  return (
    <nav
      aria-label="Área do cliente"
      style={{
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '25',
        background: '#fff',
        borderTop: '1px solid #E4E4EC',
        display: 'grid',
        gridTemplateColumns: 'repeat(3,1fr)',
      }}
    >
      {(vm.me?.tabs ?? []).map((t: Loose, $index: number) => (
        <Fragment key={$index}>
          <button
            onClick={t?.onClick}
            style={
              {
                height: '64px',
                border: '0',
                background: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: `${t?.fw ?? ''}`,
                color: `${t?.fg ?? ''}`,
                cursor: 'pointer',
                boxShadow: `inset 0 3px 0 ${t?.bc ?? ''}`,
              } as CSSProperties
            }
          >
            <span style={{ fontSize: '18px', lineHeight: '1' }}>{t?.icon}</span>
            {t?.label}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
