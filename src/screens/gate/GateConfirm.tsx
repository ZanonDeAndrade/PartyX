import type { ViewModel } from '../../logic/viewTypes';

export function GateConfirm({ vm }: { vm: ViewModel }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        zIndex: '45',
        background: 'rgba(0,0,0,.7)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: '#15151E',
          borderTop: '1px solid #2C2C3A',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: '640px',
          padding: '20px 16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '13px', color: '#A6A6BA' }}>Confirmar entrada manual</span>
        <b style={{ fontSize: '24px', lineHeight: '1.15' }}>{vm.gv?.conf?.name}</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '15px' }}>
          <div>
            <span style={{ color: '#A6A6BA', fontSize: '12px' }}>TIPO</span>
            <br />
            <b>{vm.gv?.conf?.type}</b>
          </div>
          <div>
            <span style={{ color: '#A6A6BA', fontSize: '12px' }}>CÓDIGO</span>
            <br />
            <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{vm.gv?.conf?.code}</b>
          </div>
          <div>
            <span style={{ color: '#A6A6BA', fontSize: '12px' }}>CPF</span>
            <br />
            {vm.gv?.conf?.cpf}
          </div>
          <div>
            <span style={{ color: '#A6A6BA', fontSize: '12px' }}>EVENTO</span>
            <br />
            {vm.gv?.evName}
          </div>
        </div>
        <span style={{ fontSize: '13px', color: '#D4D4DE', lineHeight: '1.5' }}>
          Confira o documento da pessoa. Ao confirmar, o servidor registra a entrada deste ingresso uma única vez.
        </span>
        <button
          onClick={vm.gv?.conf?.ok}
          style={{
            height: '60px',
            borderRadius: '14px',
            background: '#7C3AED',
            color: '#fff',
            border: '0',
            fontWeight: '800',
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          Confirmar entrada
        </button>
        <button
          onClick={vm.gv?.conf?.cancel}
          style={{
            height: '52px',
            borderRadius: '14px',
            background: 'transparent',
            color: '#fff',
            border: '1px solid #3A3A4C',
            fontWeight: '700',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Voltar aos resultados
        </button>
      </div>
    </div>
  );
}
