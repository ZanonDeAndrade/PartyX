import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function PublicHeader({ vm }: { vm: ViewModel }) {
  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: '0',
          zIndex: '30',
          background: '#0B0B10',
          color: '#fff',
          borderBottom: '1px solid #1E1E2A',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '0 16px',
          }}
        >
          <button
            onClick={vm.go?.P01}
            aria-label="PartyX, página inicial"
            style={{
              background: 'none',
              border: '0',
              color: '#fff',
              cursor: 'pointer',
              padding: '0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <img src="/brand/partyx-logo.png" width={65} height={36} alt="PartyX" style={{ display: 'block' }} />
          </button>
          {vm.hdr?.checkout ? (
            <span
              style={{
                fontSize: '13px',
                color: '#A6A6BA',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginLeft: 'auto',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }} />
              Compra segura
            </span>
          ) : null}
          {vm.hdr?.full ? (
            <>
              {vm.desk ? (
                <>
                  <button
                    onClick={vm.go?.P02}
                    style={{
                      background: 'none',
                      border: '0',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      height: '44px',
                      padding: '0 6px',
                    }}
                  >
                    Eventos
                  </button>
                  <form onSubmit={vm.hdr?.submit} style={{ flex: '1', maxWidth: '380px', display: 'flex' }}>
                    <input
                      aria-label="Buscar evento"
                      value={vm.hdr?.q ?? ''}
                      onChange={vm.hdr?.onQ}
                      placeholder="Buscar evento por nome"
                      style={{
                        flex: '1',
                        height: '40px',
                        borderRadius: '10px',
                        background: '#15151E',
                        border: '1px solid #2C2C3A',
                        color: '#fff',
                        padding: '0 14px',
                        fontSize: '14px',
                        outlineColor: '#8B5CF6',
                      }}
                    />
                  </form>
                </>
              ) : null}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {vm.hdr?.showMobSearch ? (
                  <button
                    onClick={vm.go?.P02}
                    aria-label="Buscar eventos"
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: 'transparent',
                      border: '1px solid #2C2C3A',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '16px',
                    }}
                  >
                    ⌕
                  </button>
                ) : null}
                {vm.hdr?.isCli ? (
                  <>
                    {vm.notMob ? (
                      <button
                        onClick={vm.go?.U01}
                        style={{
                          background: 'none',
                          border: '0',
                          color: '#fff',
                          fontSize: '15px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          height: '44px',
                          padding: '0 8px',
                        }}
                      >
                        Meus ingressos
                      </button>
                    ) : null}
                    <button
                      onClick={vm.hdr?.openMenu}
                      aria-label="Menu da conta"
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: '#2A2A38',
                        border: '0',
                        color: '#fff',
                        fontWeight: '700',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      {vm.hdr?.initials}
                    </button>
                  </>
                ) : null}
                {vm.hdr?.isGuest ? (
                  <>
                    <button
                      onClick={vm.go?.A01}
                      style={{
                        height: '40px',
                        padding: '0 14px',
                        borderRadius: '10px',
                        background: '#fff',
                        color: '#0B0B10',
                        border: '0',
                        fontWeight: '700',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      Entrar
                    </button>
                    {vm.mob ? (
                      <button
                        onClick={vm.hdr?.openMenu}
                        aria-label="Abrir menu"
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '10px',
                          background: 'transparent',
                          border: '1px solid #2C2C3A',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '18px',
                        }}
                      >
                        ≡
                      </button>
                    ) : null}
                  </>
                ) : null}
                {vm.hdr?.isStaff ? (
                  <button
                    onClick={vm.hdr?.staffHome}
                    style={{
                      height: '40px',
                      padding: '0 14px',
                      borderRadius: '10px',
                      background: '#7C3AED',
                      color: '#fff',
                      border: '0',
                      fontWeight: '700',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    {vm.hdr?.staffLabel}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </header>
      {vm.me?.showTabs ? (
        <div style={{ background: '#fff', borderBottom: '1px solid #E4E4EC' }}>
          <div
            style={{
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '0 16px',
              display: 'flex',
              gap: '4px',
              overflowX: 'auto',
            }}
          >
            {(vm.me?.tabs ?? []).map((t: Loose, $index: number) => (
              <Fragment key={$index}>
                <button
                  onClick={t?.onClick}
                  style={
                    {
                      height: '52px',
                      padding: '0 12px',
                      background: 'none',
                      border: '0',
                      borderBottom: `2px solid ${t?.bc ?? ''}`,
                      fontSize: '15px',
                      fontWeight: `${t?.fw ?? ''}`,
                      color: `${t?.fg ?? ''}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    } as CSSProperties
                  }
                >
                  {t?.label}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
