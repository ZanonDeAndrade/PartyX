import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function LoginScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="A01 Entrar"
      style={{
        maxWidth: '460px',
        margin: '0 auto',
        padding: '36px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {vm.au?.hasReturn ? (
        <div
          style={{
            background: '#EDE9FE',
            color: '#4C1D95',
            border: '1px solid #DDD6FE',
            borderRadius: '14px',
            padding: '14px 16px',
            fontSize: '15px',
            lineHeight: '1.5',
          }}
        >
          <b>Entre para continuar sua compra.</b> {vm.au?.returnText}
        </div>
      ) : null}
      <div
        style={{
          background: '#fff',
          border: '1px solid #E4E4EC',
          borderRadius: '20px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div>
          <h1
            style={{ margin: '0', fontSize: '30px', fontWeight: '900', fontStretch: '110%', letterSpacing: '-0.02em' }}
          >
            Entrar
          </h1>
          <p style={{ margin: '6px 0 0', color: '#5B5B6E', fontSize: '15px' }}>
            Use o e-mail e a senha da sua conta PartyX.
          </p>
        </div>
        {vm.au?.hasErr ? (
          <div
            role="alert"
            style={
              {
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '14px',
                lineHeight: '1.5',
                background: `${vm.au?.errBg ?? ''}`,
                color: `${vm.au?.errFg ?? ''}`,
                border: `1px solid ${vm.au?.errBd ?? ''}`,
              } as CSSProperties
            }
          >
            <b>{vm.au?.errTitle}</b> {vm.au?.errText}
          </div>
        ) : null}
        <form onSubmit={vm.au?.submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={vm.au?.email ?? ''}
              onChange={vm.au?.onEmail}
              placeholder="nome@example.com"
              style={{
                height: '48px',
                border: '1px solid #D4D4DE',
                borderRadius: '10px',
                padding: '0 14px',
                fontSize: '16px',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Senha</span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid #D4D4DE',
                borderRadius: '10px',
                height: '48px',
                padding: '0 4px 0 14px',
                background: '#fff',
              }}
            >
              <input
                type={vm.au?.pwType}
                autoComplete="current-password"
                value={vm.au?.pw ?? ''}
                onChange={vm.au?.onPw}
                style={{ border: '0', outline: '0', flex: '1', fontSize: '16px', minWidth: '0', height: '44px' }}
              />
              <button
                type="button"
                onClick={vm.au?.togglePw}
                style={{
                  height: '40px',
                  border: '0',
                  background: 'transparent',
                  color: '#5B21B6',
                  fontWeight: '600',
                  fontSize: '14px',
                  padding: '0 10px',
                  cursor: 'pointer',
                }}
              >
                {vm.au?.pwLabel}
              </button>
            </span>
          </label>
          <button
            type="button"
            onClick={vm.go?.A03}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: '0',
              padding: '0',
              minHeight: '36px',
              color: '#5B21B6',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              cursor: 'pointer',
            }}
          >
            Esqueci minha senha
          </button>
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
            Entrar
          </button>
        </form>
        <div
          style={{
            borderTop: '1px solid #EEEEF3',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'stretch',
          }}
        >
          <span style={{ fontSize: '14px', color: '#5B5B6E', textAlign: 'center' }}>Ainda não tem conta?</span>
          <button
            onClick={vm.go?.A02}
            style={{
              height: '48px',
              borderRadius: '12px',
              background: '#fff',
              color: '#0B0B10',
              border: '1px solid #D4D4DE',
              fontWeight: '700',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Criar conta
          </button>
        </div>
      </div>
      <div
        style={{
          border: '1px dashed #E6C35C',
          background: '#FFFBEB',
          borderRadius: '14px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <span
          style={{ fontSize: '12px', fontWeight: '700', color: '#854D0E', fontFamily: "'IBM Plex Mono',monospace" }}
        >
          DEMO · contas fictícias (senha demo1234)
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(vm.au?.demo ?? []).map((d: Loose, $index: number) => (
            <Fragment key={$index}>
              <button
                onClick={d?.onClick}
                style={{
                  minHeight: '36px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E6C35C',
                  background: '#fff',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: '#3F3F50',
                }}
              >
                {d?.label}
              </button>
            </Fragment>
          ))}
        </div>
        <span style={{ fontSize: '12px', color: '#854D0E', lineHeight: '1.45' }}>
          Senha errada 5 vezes bloqueia por 15 minutos (RF-10, premissa do exemplo da documentação).
        </span>
      </div>
    </main>
  );
}
