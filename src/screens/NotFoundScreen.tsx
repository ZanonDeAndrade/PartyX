import type { ViewModel } from '../logic/viewTypes';

export function NotFoundScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="P07 Não encontrado"
      style={{
        color: '#fff',
        maxWidth: '720px',
        margin: '0 auto',
        padding: '72px 16px 96px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#C4B5FD' }}>Erro 404</span>
      <h1
        style={{
          margin: '0',
          fontSize: 'clamp(36px,6vw,60px)',
          lineHeight: '1',
          fontWeight: '900',
          fontStretch: '114%',
          letterSpacing: '-0.03em',
        }}
      >
        Não encontramos esta página
      </h1>
      <p style={{ margin: '0', fontSize: '17px', lineHeight: '1.55', color: '#D4D4DE', maxWidth: '560px' }}>
        O endereço pode estar incorreto ou o evento não está disponível no site. Eventos que já aconteceram continuam
        acessíveis pelo link original, com o aviso de evento encerrado.
      </p>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
        <button
          onClick={vm.go?.P02}
          style={{
            height: '52px',
            padding: '0 22px',
            borderRadius: '12px',
            background: '#7C3AED',
            color: '#fff',
            border: '0',
            fontWeight: '700',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Ver eventos
        </button>
        <button
          onClick={vm.go?.P01}
          style={{
            height: '52px',
            padding: '0 22px',
            borderRadius: '12px',
            background: 'transparent',
            color: '#fff',
            border: '1px solid #3A3A4C',
            fontWeight: '700',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Página inicial
        </button>
      </div>
    </main>
  );
}
