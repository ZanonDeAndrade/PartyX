import { type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import { GateEventSelect } from './gate/GateEventSelect';
import { GateScanner } from './gate/GateScanner';
import { GateManualSearch } from './gate/GateManualSearch';
import { GateConfirm } from './gate/GateConfirm';
import { GateResult } from './gate/GateResult';

export function GateScreen({ vm }: { vm: ViewModel }) {
  return (
    <div
      data-screen-label={vm.gv?.label}
      style={{ minHeight: '100%', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{ position: 'sticky', top: '0', zIndex: '20', background: '#0B0B10', borderBottom: '1px solid #1E1E2A' }}
      >
        <div
          style={{
            maxWidth: '960px',
            margin: '0 auto',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <img src="/brand/partyx-logo.png" width={51} height={28} alt="PartyX" style={{ display: 'block' }} />
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#A6A6BA', letterSpacing: '.08em' }}>
            PORTARIA
          </span>
          {vm.gv?.hasEvent ? (
            <>
              <div
                style={{
                  flex: '1 1 200px',
                  minWidth: '0',
                  display: 'flex',
                  flexDirection: 'column',
                  paddingLeft: '10px',
                  borderLeft: '1px solid #2C2C3A',
                }}
              >
                <span style={{ fontSize: '12px', color: '#A6A6BA' }}>Validando</span>
                <span
                  style={{
                    fontWeight: '800',
                    fontSize: '16px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {vm.gv?.evName} · {vm.gv?.evDate}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '12px', color: '#A6A6BA' }}>Entradas</span>
                <span
                  aria-live="polite"
                  style={{ fontWeight: '900', fontSize: '22px', fontVariantNumeric: 'tabular-nums', lineHeight: '1' }}
                >
                  {vm.gv?.count}
                </span>
              </div>
            </>
          ) : null}
          {vm.gv?.noEvent ? (
            <>
              <span style={{ flex: '1' }} />
              <span style={{ fontSize: '13px', color: '#A6A6BA' }}>{vm.gv?.userName}</span>
            </>
          ) : null}
        </div>
        {vm.gv?.hasEvent ? (
          <div
            style={{
              maxWidth: '960px',
              margin: '0 auto',
              padding: '0 14px 10px',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span
              style={
                {
                  fontSize: '12px',
                  fontWeight: '700',
                  padding: '5px 9px',
                  borderRadius: '6px',
                  background: `${vm.gv?.connBg ?? ''}`,
                  color: `${vm.gv?.connFg ?? ''}`,
                } as CSSProperties
              }
            >
              {vm.gv?.connLabel}
            </span>
            <button
              onClick={vm.gv?.toggleSound}
              aria-pressed={vm.gv?.sound}
              style={{
                height: '36px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #2C2C3A',
                background: 'transparent',
                color: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {vm.gv?.soundLabel}
            </button>
            <span style={{ flex: '1' }} />
            <button
              onClick={vm.gv?.change}
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #2C2C3A',
                background: 'transparent',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Trocar evento
            </button>
            {vm.gv?.isAdmin ? (
              <button
                onClick={vm.go?.ADM01}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #2C2C3A',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Painel
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {vm.gv?.offline ? (
        <div
          role="alert"
          style={{
            background: '#2A1414',
            borderBottom: '1px solid #7F1D1D',
            color: '#FECACA',
            padding: '12px 14px',
            fontSize: '14px',
            lineHeight: '1.5',
          }}
        >
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <b style={{ color: '#fff' }}>Sem internet.</b> Nenhuma leitura pode ser confirmada agora. Siga o
            procedimento de contingência da PartyX: confira pela lista impressa exportada antes do evento e avise o
            suporte da equipe.
          </div>
        </div>
      ) : null}
      {vm.is?.V01 ? <GateEventSelect vm={vm} /> : null}
      {vm.is?.V02 ? <GateScanner vm={vm} /> : null}
      {vm.is?.V03 ? <GateManualSearch vm={vm} /> : null}
      {vm.gv?.conf?.show ? <GateConfirm vm={vm} /> : null}
      {vm.gv?.res?.show ? <GateResult vm={vm} /> : null}
    </div>
  );
}
