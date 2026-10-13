import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function SignupScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="A02 Criar conta"
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '36px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {vm.rg?.hasReturn ? (
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
          <b>Sua seleção está guardada.</b> Depois de criar a conta, você volta para o pedido.
        </div>
      ) : null}
      {vm.rg?.done ? (
        <div
          style={{
            background: '#fff',
            border: '1px solid #E4E4EC',
            borderRadius: '20px',
            padding: '28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#DCFCE7',
              color: '#14532D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: '900',
            }}
          >
            ✓
          </div>
          <h1 style={{ margin: '0', fontSize: '28px', fontWeight: '900', fontStretch: '110%' }}>Conta criada</h1>
          <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.55', color: '#3F3F50' }}>
            Você já está conectado. Enviamos uma confirmação de cadastro para <b>{vm.rg?.maskedEmail}</b>. Não é preciso
            confirmar o e-mail para continuar.
          </p>
          <button
            onClick={vm.rg?.next}
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
            {vm.rg?.nextLabel}
          </button>
        </div>
      ) : null}
      {vm.rg?.form ? (
        <>
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
                style={{
                  margin: '0',
                  fontSize: '30px',
                  fontWeight: '900',
                  fontStretch: '110%',
                  letterSpacing: '-0.02em',
                }}
              >
                Criar conta
              </h1>
              <p style={{ margin: '6px 0 0', color: '#5B5B6E', fontSize: '15px', lineHeight: '1.5' }}>
                Seus ingressos são emitidos no nome informado aqui.
              </p>
            </div>
            {vm.rg?.hasErrors ? (
              <div
                role="alert"
                style={{
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: '#991B1B',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                }}
              >
                <b>Revise os campos destacados.</b> {vm.rg?.errCount}
              </div>
            ) : null}
            <form
              onSubmit={vm.rg?.submit}
              style={{ display: 'grid', gridTemplateColumns: `${vm.rg?.cols ?? ''}`, gap: '16px' } as CSSProperties}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Nome completo</span>
                <input
                  autoComplete="name"
                  value={vm.rg?.name ?? ''}
                  onChange={vm.rg?.onName}
                  style={
                    {
                      height: '48px',
                      border: `${vm.rg?.bName ?? ''}`,
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                    } as CSSProperties
                  }
                />
                {vm.rg?.eName ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.rg?.eName}</span> : null}
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>E-mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={vm.rg?.email ?? ''}
                  onChange={vm.rg?.onEmail}
                  placeholder="nome@example.com"
                  style={
                    {
                      height: '48px',
                      border: `${vm.rg?.bEmail ?? ''}`,
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                    } as CSSProperties
                  }
                />
                {vm.rg?.eEmail ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.rg?.eEmail}</span> : null}
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>CPF</span>
                <input
                  inputMode="numeric"
                  value={vm.rg?.cpf ?? ''}
                  onChange={vm.rg?.onCpf}
                  placeholder="000.000.000-00"
                  style={
                    {
                      height: '48px',
                      border: `${vm.rg?.bCpf ?? ''}`,
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                    } as CSSProperties
                  }
                />
                {vm.rg?.eCpf ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.rg?.eCpf}</span> : null}
                <span style={{ fontSize: '12px', color: '#5B5B6E' }}>
                  Usado para identificar sua conta. Não aparece no ingresso.
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Telefone com DDD</span>
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  value={vm.rg?.phone ?? ''}
                  onChange={vm.rg?.onPhone}
                  placeholder="(55) 99999-9999"
                  style={
                    {
                      height: '48px',
                      border: `${vm.rg?.bPhone ?? ''}`,
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                    } as CSSProperties
                  }
                />
                {vm.rg?.ePhone ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.rg?.ePhone}</span> : null}
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Senha</span>
                <span
                  style={
                    {
                      display: 'flex',
                      alignItems: 'center',
                      border: `${vm.rg?.bPw ?? ''}`,
                      borderRadius: '10px',
                      height: '48px',
                      padding: '0 4px 0 14px',
                    } as CSSProperties
                  }
                >
                  <input
                    type={vm.rg?.pwType}
                    autoComplete="new-password"
                    value={vm.rg?.pw ?? ''}
                    onChange={vm.rg?.onPw}
                    style={{ border: '0', outline: '0', flex: '1', fontSize: '16px', minWidth: '0', height: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={vm.rg?.togglePw}
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
                    {vm.rg?.pwLabel}
                  </button>
                </span>
                <span style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {(vm.rg?.rules ?? []).map((r: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <span style={{ fontSize: '13px', color: `${r?.c ?? ''}` } as CSSProperties}>
                        {r?.m} {r?.label}
                      </span>
                    </Fragment>
                  ))}
                </span>
                {vm.rg?.ePw ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.rg?.ePw}</span> : null}
              </label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={vm.rg?.accept}
                    aria-label="Aceito os Termos de Uso e a Política de Privacidade"
                    onClick={vm.rg?.toggleAccept}
                    style={
                      {
                        width: '28px',
                        height: '28px',
                        flex: 'none',
                        borderRadius: '7px',
                        border: `2px solid ${vm.rg?.accBd ?? ''}`,
                        background: `${vm.rg?.accBg ?? ''}`,
                        color: '#fff',
                        fontWeight: '900',
                        fontSize: '15px',
                        cursor: 'pointer',
                        marginTop: '1px',
                        padding: '0',
                      } as CSSProperties
                    }
                  >
                    {vm.rg?.accMark}
                  </button>
                  <span style={{ fontSize: '15px', lineHeight: '1.5' }}>
                    Li e aceito os{' '}
                    <button
                      type="button"
                      onClick={vm.rg?.openTerms}
                      style={{
                        background: 'none',
                        border: '0',
                        padding: '0',
                        color: '#5B21B6',
                        fontSize: '15px',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                      }}
                    >
                      Termos de Uso
                    </button>{' '}
                    e a{' '}
                    <button
                      type="button"
                      onClick={vm.rg?.openPriv}
                      style={{
                        background: 'none',
                        border: '0',
                        padding: '0',
                        color: '#5B21B6',
                        fontSize: '15px',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                      }}
                    >
                      Política de Privacidade
                    </button>
                    .
                  </span>
                </div>
                {vm.rg?.eAccept ? (
                  <span style={{ fontSize: '13px', color: '#B91C1C', paddingLeft: '40px' }}>{vm.rg?.eAccept}</span>
                ) : null}
                <span style={{ fontSize: '12px', color: '#5B5B6E', paddingLeft: '40px' }}>
                  Registramos a versão dos documentos, a data e o IP do aceite.
                </span>
              </div>
              <button
                type="submit"
                style={{
                  gridColumn: '1 / -1',
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
                Criar conta
              </button>
            </form>
            <div
              style={{
                borderTop: '1px solid #EEEEF3',
                paddingTop: '14px',
                fontSize: '14px',
                color: '#5B5B6E',
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              Já tem conta?{' '}
              <button
                onClick={vm.go?.A01}
                style={{
                  background: 'none',
                  border: '0',
                  minHeight: '40px',
                  color: '#5B21B6',
                  fontWeight: '700',
                  fontSize: '14px',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Entrar
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
              flexWrap: 'wrap',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#854D0E',
                fontFamily: "'IBM Plex Mono',monospace",
                width: '100%',
              }}
            >
              DEMO
            </span>
            <button
              onClick={vm.rg?.fillOk}
              style={{
                minHeight: '36px',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid #E6C35C',
                background: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Preencher dados válidos
            </button>
            <button
              onClick={vm.rg?.fillBad}
              style={{
                minHeight: '36px',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid #E6C35C',
                background: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              CPF inválido e telefone incompleto
            </button>
            <button
              onClick={vm.rg?.fillDup}
              style={{
                minHeight: '36px',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid #E6C35C',
                background: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              E-mail e CPF já cadastrados
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
