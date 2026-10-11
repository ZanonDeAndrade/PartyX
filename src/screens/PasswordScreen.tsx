import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function PasswordScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label={vm.pwpage?.label}
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
        {vm.pwpage?.eyebrow ? (
          <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.08em', color: '#5B21B6' }}>
            {vm.pwpage?.eyebrow}
          </span>
        ) : null}
        <h1 style={{ margin: '0', fontSize: '28px', fontWeight: '900', fontStretch: '110%' }}>{vm.pwpage?.title}</h1>
        <p style={{ margin: '0', color: '#3F3F50', fontSize: '15px', lineHeight: '1.55' }}>{vm.pwpage?.text}</p>
        <form onSubmit={vm.pwpage?.submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={vm.pwpage?.pw ?? ''}
              onChange={vm.pwpage?.onPw}
              style={
                {
                  height: '48px',
                  border: `${vm.pwpage?.bPw ?? ''}`,
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                } as CSSProperties
              }
            />
            <span style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {(vm.pwpage?.rules ?? []).map((r: Loose, $index: number) => (
                <Fragment key={$index}>
                  <span style={{ fontSize: '13px', color: `${r?.c ?? ''}` } as CSSProperties}>
                    {r?.m} {r?.label}
                  </span>
                </Fragment>
              ))}
            </span>
            {vm.pwpage?.ePw ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.pwpage?.ePw}</span> : null}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={vm.pwpage?.pw2 ?? ''}
              onChange={vm.pwpage?.onPw2}
              style={
                {
                  height: '48px',
                  border: `${vm.pwpage?.bPw2 ?? ''}`,
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '16px',
                } as CSSProperties
              }
            />
            {vm.pwpage?.ePw2 ? <span style={{ fontSize: '13px', color: '#B91C1C' }}>{vm.pwpage?.ePw2}</span> : null}
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
            {vm.pwpage?.cta}
          </button>
        </form>
        {vm.pwpage?.hasDemo ? (
          <div
            style={{
              border: '1px dashed #E6C35C',
              background: '#FFFBEB',
              borderRadius: '12px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#854D0E',
            }}
          >
            DEMO · senha temporária usada: temp1234. Esta tela bloqueia qualquer outra área até a troca.
          </div>
        ) : null}
      </div>
    </main>
  );
}
