import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';
import type { Loose } from '../../types';

export function GateManualSearch({ vm }: { vm: ViewModel }) {
  return (
    <main
      style={{
        maxWidth: '720px',
        width: '100%',
        margin: '0 auto',
        padding: '16px 14px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <h1 style={{ margin: '0', fontSize: '26px', fontWeight: '900', fontStretch: '108%' }}>Busca manual</h1>
        <button
          onClick={vm.gv?.toCam}
          style={{
            height: '44px',
            padding: '0 14px',
            borderRadius: '10px',
            border: '1px solid #3A3A4C',
            background: 'transparent',
            color: '#fff',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          Voltar à câmera
        </button>
      </div>
      <form onSubmit={vm.gv?.search} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>Código do ingresso, nome, CPF ou e-mail</span>
          <input
            value={vm.gv?.mq ?? ''}
            onChange={vm.gv?.onMq}
            placeholder="Ex.: PX-7K4M-2Q9D ou Marina Costa"
            style={{
              height: '56px',
              borderRadius: '12px',
              border: '1px solid #3A3A4C',
              background: '#15151E',
              color: '#fff',
              padding: '0 14px',
              fontSize: '18px',
            }}
          />
        </label>
        <span style={{ fontSize: '13px', color: '#A6A6BA', lineHeight: '1.45' }}>
          Digite pelo menos 3 caracteres. CPF completo, com ou sem pontuação. Buscar ou abrir um resultado não registra
          entrada.
        </span>
        <button
          type="submit"
          style={{
            height: '56px',
            borderRadius: '12px',
            background: '#7C3AED',
            color: '#fff',
            border: '0',
            fontWeight: '800',
            fontSize: '17px',
            cursor: 'pointer',
          }}
        >
          Buscar
        </button>
      </form>
      {vm.gv?.mbusy ? (
        <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#D4D4DE' }}>
          <span
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: '3px solid #2C2C3A',
              borderTopColor: '#8B5CF6',
              animation: 'pxspin 1s linear infinite',
            }}
          />
          Consultando…
        </div>
      ) : null}
      {vm.gv?.merr ? (
        <div
          role="alert"
          style={{
            border: '1px solid #7F1D1D',
            background: '#2A1414',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '14px',
            color: '#FECACA',
          }}
        >
          {vm.gv?.merr}
        </div>
      ) : null}
      {vm.gv?.hasRes ? (
        <div
          data-screen-label="V04 Resultado da busca"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          <span style={{ fontSize: '14px', color: '#A6A6BA' }}>{vm.gv?.resCount}</span>
          {(vm.gv?.mres ?? []).map((r: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={r?.onClick}
                style={
                  {
                    textAlign: 'left',
                    background: '#15151E',
                    border: `1px solid ${r?.bd ?? ''}`,
                    borderRadius: '14px',
                    padding: '14px',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  } as CSSProperties
                }
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}
                >
                  <div style={{ minWidth: '0' }}>
                    <div style={{ fontWeight: '800', fontSize: '18px' }}>{r?.name}</div>
                    <div style={{ fontSize: '13px', color: '#A6A6BA' }}>
                      CPF {r?.cpf} · {r?.email}
                    </div>
                  </div>
                  <span
                    style={
                      {
                        fontSize: '12px',
                        fontWeight: '800',
                        padding: '5px 9px',
                        borderRadius: '6px',
                        background: `${r?.b?.bg ?? ''}`,
                        color: `${r?.b?.fg ?? ''}`,
                        flex: 'none',
                      } as CSSProperties
                    }
                  >
                    {r?.b?.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap', fontSize: '14px' }}>
                  <span>
                    <span style={{ color: '#A6A6BA' }}>Tipo</span> <b>{r?.type}</b>
                  </span>
                  <span>
                    <span style={{ color: '#A6A6BA' }}>Código</span>{' '}
                    <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r?.code}</b>
                  </span>
                  <span>
                    <span style={{ color: '#A6A6BA' }}>Pedido</span> {r?.num} · {r?.pos}
                  </span>
                </div>
                {r?.other ? (
                  <span style={{ fontSize: '13px', color: '#FCA5A5' }}>
                    Ingresso de {r?.evName}. Não é deste evento.
                  </span>
                ) : null}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </main>
  );
}
