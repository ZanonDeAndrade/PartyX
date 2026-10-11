import type { ViewModel } from '../logic/viewTypes';

export function MaintenanceScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="G06 Manutenção"
      style={{
        minHeight: '100%',
        background: '#0B0B10',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <img src="/brand/partyx-logo.png" width={80} height={44} alt="PartyX" style={{ display: 'block' }} />
        <h1
          style={{
            margin: '0',
            fontSize: 'clamp(32px,6vw,48px)',
            lineHeight: '1.02',
            fontWeight: '900',
            fontStretch: '112%',
          }}
        >
          Estamos em manutenção
        </h1>
        <p style={{ margin: '0', fontSize: '17px', lineHeight: '1.55', color: '#D4D4DE' }}>
          O site está temporariamente indisponível para ajustes. Tente novamente em alguns minutos. Nenhuma compra é
          iniciada durante a manutenção.
        </p>
        <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#A6A6BA' }}>
          Dúvidas sobre uma compra: atendimento da PartyX, contato a fornecer.
        </p>
        <button
          onClick={vm.go?.P01}
          style={{
            alignSelf: 'flex-start',
            height: '52px',
            padding: '0 20px',
            borderRadius: '12px',
            background: '#fff',
            color: '#0B0B10',
            border: '0',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
        <span style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", color: '#8A8A9E' }}>
          DEMO · estado G06
        </span>
      </div>
    </main>
  );
}
