import { type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';

export function RecoverPasswordScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="A03 Recuperar senha"
      style={{ maxWidth: '460px', margin: '0 auto', padding: '36px 16px 24px' }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '20px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <button
          onClick={vm.go?.A01}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: '0',
            padding: '0',
            minHeight: '36px',
            color: '#5B21B6',
            fontWeight: '600',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          ‹ Voltar para entrar
        </button>
        <h1 style={{ margin: '0', fontSize: '28px', fontWeight: '900', fontStretch: '110%' }}>Recuperar senha</h1>
        <p style={{ margin: '0', color: '#3F3F50', fontSize: '15px', lineHeight: '1.55' }}>
          Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha. O link
          vale por 1 hora e só pode ser usado uma vez.
        </p>
        <form onSubmit={vm.rc?.submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>E-mail</span>
            <input
              type="email"
              value={vm.rc?.email ?? ''}
              onChange={vm.rc?.onEmail}
              placeholder="nome@example.com"
              style={
                {
                  height: '48px',
                  border: `${vm.rc?.bEmail ?? ''}`,
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                } as CSSProperties
              }
            />
            {vm.rc?.err ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.rc?.err}</span> : null}
          </label>
          <button
            type="submit"
            style={{
              height: '52px',
              borderRadius: '12px',
              background: '#7C3AED',
              color: '#fff',
              border: '0',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Enviar link
          </button>
        </form>
      </div>
    </main>
  );
}
