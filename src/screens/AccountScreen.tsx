import { type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';

export function AccountScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="U06 Minha conta"
      style={
        {
          maxWidth: '720px',
          margin: '0 auto',
          padding: `24px 16px ${vm.me?.padB ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        } as CSSProperties
      }
    >
      <h1
        style={{
          margin: '0 0 6px',
          fontSize: 'clamp(28px,4vw,38px)',
          fontWeight: '900',
          fontStretch: '110%',
          letterSpacing: '-0.02em',
        }}
      >
        {vm.ac?.title}
      </h1>
      <section
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>Dados pessoais</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>Nome completo</span>
          <input
            value={vm.ac?.name ?? ''}
            onChange={vm.ac?.onName}
            style={
              {
                height: '48px',
                border: `${vm.ac?.bName ?? ''}`,
                borderRadius: '10px',
                padding: '0 14px',
                fontSize: '16px',
              } as CSSProperties
            }
          />
          {vm.ac?.eName ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.ac?.eName}</span> : null}
        </label>
        {vm.ac?.showPhone ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Telefone com DDD</span>
            <input
              value={vm.ac?.phone ?? ''}
              onChange={vm.ac?.onPhone}
              style={
                {
                  height: '48px',
                  border: `${vm.ac?.bPhone ?? ''}`,
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                } as CSSProperties
              }
            />
            {vm.ac?.ePhone ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.ac?.ePhone}</span> : null}
          </label>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>E-mail</span>
            <span
              style={{
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                border: '1px solid #E4E4EC',
                background: '#F7F7FA',
                borderRadius: '10px',
                padding: '0 14px',
                fontSize: '16px',
                color: '#3F3F50',
                overflow: 'hidden',
              }}
            >
              {vm.ac?.email}
            </span>
          </div>
          {vm.ac?.showCpf ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>CPF</span>
              <span
                style={{
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid #E4E4EC',
                  background: '#F7F7FA',
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                  color: '#3F3F50',
                }}
              >
                {vm.ac?.cpf}
              </span>
            </div>
          ) : null}
        </div>
        <span style={{ fontSize: '13px', color: '#5B5B6E', lineHeight: '1.5' }}>{vm.ac?.roNote}</span>
        <button
          onClick={vm.ac?.save}
          style={{
            alignSelf: 'flex-start',
            height: '48px',
            padding: '0 20px',
            borderRadius: '12px',
            background: '#7C3AED',
            color: '#fff',
            border: '0',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          Salvar alterações
        </button>
      </section>
      <section
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: '0', fontSize: '18px', fontWeight: '800' }}>Senha</h2>
          <span style={{ fontSize: '14px', color: '#5B5B6E' }}>Troque sua senha a qualquer momento.</span>
        </div>
        <button
          onClick={vm.ac?.openPw}
          style={{
            height: '48px',
            padding: '0 18px',
            borderRadius: '12px',
            background: '#fff',
            border: '1px solid #D4D4DE',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          Alterar senha
        </button>
      </section>
      <button
        onClick={vm.ac?.logout}
        style={{
          alignSelf: 'flex-start',
          height: '48px',
          padding: '0 18px',
          borderRadius: '12px',
          background: '#fff',
          border: '1px solid #FECACA',
          color: '#B91C1C',
          fontWeight: '700',
          cursor: 'pointer',
        }}
      >
        Sair da conta
      </button>
    </main>
  );
}
