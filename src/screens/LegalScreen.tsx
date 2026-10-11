import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function LegalScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label={vm.legal?.label}
      style={
        {
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '32px 16px 64px',
          display: 'grid',
          gridTemplateColumns: `${vm.legal?.cols ?? ''}`,
          gap: '32px',
          alignItems: 'start',
        } as CSSProperties
      }
    >
      <nav
        style={
          {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            position: `${vm.legal?.navPos ?? ''}`,
            top: '88px',
          } as CSSProperties
        }
      >
        <span
          style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.08em', color: '#5B5B6E', marginBottom: '6px' }}
        >
          DOCUMENTOS
        </span>
        {(vm.legal?.docs ?? []).map((d: Loose, $index: number) => (
          <Fragment key={$index}>
            <button
              onClick={d?.onClick}
              style={
                {
                  textAlign: 'left',
                  minHeight: '44px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '0',
                  background: `${d?.bg ?? ''}`,
                  color: '#0B0B10',
                  fontWeight: `${d?.fw ?? ''}`,
                  fontSize: '15px',
                  cursor: 'pointer',
                } as CSSProperties
              }
            >
              {d?.label}
            </button>
          </Fragment>
        ))}
      </nav>
      <article
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '20px',
          padding: 'clamp(20px,4vw,48px)',
          minWidth: '0',
        }}
      >
        <h1
          style={{
            margin: '0',
            fontSize: 'clamp(30px,4vw,42px)',
            fontWeight: '900',
            fontStretch: '110%',
            letterSpacing: '-0.02em',
            lineHeight: '1.05',
          }}
        >
          {vm.legal?.title}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '14px 0 24px' }}>
          <span
            style={{
              fontSize: '13px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#F7F7FA',
              border: '1px solid #E4E4EC',
            }}
          >
            Versão: a fornecer
          </span>
          <span
            style={{
              fontSize: '13px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#F7F7FA',
              border: '1px solid #E4E4EC',
            }}
          >
            Vigente desde: a fornecer
          </span>
        </div>
        <div
          style={{
            border: '2px dashed #C9C9D6',
            borderRadius: '16px',
            padding: '24px',
            background: 'repeating-linear-gradient(135deg,#FAFAFC 0 10px,#F4F4F8 10px 20px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: '#5B5B6E' }}>
            CONTEÚDO A FORNECER PELA PARTYX
          </span>
          <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.6', maxWidth: '640px' }}>{vm.legal?.pending}</p>
          <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.6', color: '#5B5B6E', maxWidth: '640px' }}>
            Layout de leitura previsto: título, versão e data no topo; seções numeradas com títulos de 20 px; corpo de
            16 px com linha de 1,6; largura máxima de 68 caracteres; índice lateral no desktop.
          </p>
        </div>
        <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {(vm.legal?.skeleton ?? []).map((k: Loose, $index: number) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: '800', fontSize: '18px', color: '#A6A6BA' }}>{k}</div>
                <div style={{ height: '10px', width: '96%', borderRadius: '5px', background: '#EEEEF3' }} />
                <div style={{ height: '10px', width: '88%', borderRadius: '5px', background: '#EEEEF3' }} />
                <div style={{ height: '10px', width: '64%', borderRadius: '5px', background: '#EEEEF3' }} />
              </div>
            </Fragment>
          ))}
        </div>
      </article>
    </main>
  );
}
