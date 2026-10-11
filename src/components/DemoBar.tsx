import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function DemoBar({ vm }: { vm: ViewModel }) {
  return (
    <div
      style={{
        height: '52px',
        flex: 'none',
        background: '#FFFBEB',
        borderBottom: '1px solid #F5D77A',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 10px',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        fontSize: '13px',
        color: '#3F3F50',
      }}
    >
      <span
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: '11px',
          fontWeight: '600',
          background: '#0B0B10',
          color: '#FACC15',
          padding: '4px 7px',
          borderRadius: '5px',
        }}
      >
        DEMO
      </span>
      <span style={{ fontWeight: '600', color: '#854D0E' }}>Ferramenta de demonstração (não faz parte do produto)</span>
      <span style={{ width: '1px', height: '24px', background: '#F5D77A' }} />
      <span style={{ color: '#854D0E' }}>Perfil</span>
      <div
        style={{
          display: 'flex',
          gap: '2px',
          background: '#fff',
          border: '1px solid #F5D77A',
          borderRadius: '8px',
          padding: '2px',
        }}
      >
        {(vm.demo?.roles ?? []).map((r: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={r?.onClick}
              style={
                {
                  height: '30px',
                  padding: '0 10px',
                  border: '0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  background: `${r?.bg ?? ''}`,
                  color: `${r?.fg ?? ''}`,
                } as CSSProperties
              }
            >
              {r?.label}
            </button>
          </Fragment>
        ))}
      </div>
      <span style={{ color: '#854D0E' }}>Largura</span>
      <div
        style={{
          display: 'flex',
          gap: '2px',
          background: '#fff',
          border: '1px solid #F5D77A',
          borderRadius: '8px',
          padding: '2px',
        }}
      >
        {(vm.demo?.widths ?? []).map((r: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={r?.onClick}
              style={
                {
                  height: '30px',
                  padding: '0 9px',
                  border: '0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  background: `${r?.bg ?? ''}`,
                  color: `${r?.fg ?? ''}`,
                } as CSSProperties
              }
            >
              {r?.label}
            </button>
          </Fragment>
        ))}
      </div>
      <button
        onClick={vm.demo?.toggleIndex}
        style={{
          height: '34px',
          padding: '0 12px',
          border: '0',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '700',
          background: '#0B0B10',
          color: '#fff',
        }}
      >
        Telas e estados
      </button>
      <button
        onClick={vm.demo?.toggleNotes}
        style={{
          height: '34px',
          padding: '0 12px',
          border: '1px solid #F5D77A',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '600',
          background: '#fff',
          color: '#3F3F50',
        }}
      >
        {vm.demo?.notesLabel}
      </button>
      <span
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: '12px',
          background: '#fff',
          border: '1px solid #F5D77A',
          borderRadius: '6px',
          padding: '5px 8px',
          color: '#3F3F50',
        }}
      >
        <b>{vm.demo?.id}</b> · {vm.demo?.path}
      </span>
      <button
        onClick={vm.demo?.reset}
        style={{
          height: '34px',
          padding: '0 12px',
          border: '1px solid #F5D77A',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          background: 'transparent',
          color: '#854D0E',
        }}
      >
        Reiniciar dados
      </button>
      <a href="/docs" style={{ fontSize: '13px', color: '#5B21B6', fontWeight: '600' }}>
        Documentação
      </a>
      <a href="/docs/fundamentos" style={{ fontSize: '13px', color: '#5B21B6', fontWeight: '600' }}>
        Fundamentos
      </a>
      <a href="/docs/emails" style={{ fontSize: '13px', color: '#5B21B6', fontWeight: '600' }}>
        E-mails e PDF
      </a>
    </div>
  );
}
