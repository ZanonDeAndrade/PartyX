import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function EventScreen({ vm }: { vm: ViewModel }) {
  return (
    <main
      data-screen-label="P03 Página do evento"
      style={{ color: '#fff', paddingBottom: `${vm.evp?.padBottom ?? ''}` } as CSSProperties}
    >
      {vm.evp?.isPreview ? (
        <div
          style={{
            background: '#FACC15',
            color: '#0B0B10',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>Pré-visualização. Este evento está em rascunho e não aparece no site.</span>
          <button
            onClick={vm.evp?.backToEditor}
            style={{
              height: '36px',
              padding: '0 12px',
              borderRadius: '8px',
              background: '#0B0B10',
              color: '#fff',
              border: '0',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Voltar ao editor
          </button>
        </div>
      ) : null}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 16px 0' }}>
        <div
          style={
            {
              aspectRatio: `${vm.evp?.ratio ?? ''}`,
              borderRadius: '20px',
              background: `repeating-linear-gradient(135deg,${vm.evp?.c1 ?? ''} 0 14px,${vm.evp?.c2 ?? ''} 14px 28px)`,
              display: 'flex',
              alignItems: 'flex-end',
              padding: '14px',
              position: 'relative',
            } as CSSProperties
          }
        >
          <span
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '11px',
              color: '#A6A6BA',
              background: '#0B0B10CC',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            banner do evento · 16:9 · a fornecer
          </span>
          {vm.evp?.isEnded ? (
            <span
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                fontSize: '13px',
                fontWeight: '800',
                padding: '6px 10px',
                borderRadius: '8px',
                background: '#E4E4EC',
                color: '#0B0B10',
              }}
            >
              EVENTO ENCERRADO
            </span>
          ) : null}
        </div>
      </div>
      <div
        style={
          {
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '24px 16px 48px',
            display: 'grid',
            gridTemplateColumns: `${vm.evp?.cols ?? ''}`,
            gap: '32px',
            alignItems: 'start',
          } as CSSProperties
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: '0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h1
              style={{
                margin: '0',
                fontSize: 'clamp(36px,6vw,64px)',
                lineHeight: '.98',
                fontWeight: '900',
                fontStretch: '114%',
                letterSpacing: '-0.03em',
              }}
            >
              {vm.evp?.name}
            </h1>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                gap: '12px',
                marginTop: '8px',
              }}
            >
              <div style={{ background: '#15151E', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '12px', color: '#A6A6BA', fontWeight: '600' }}>DATA E HORÁRIO</div>
                <div style={{ fontWeight: '700', marginTop: '4px', lineHeight: '1.35' }}>{vm.evp?.dateLong}</div>
                <div style={{ color: '#D4D4DE', fontSize: '15px' }}>{vm.evp?.time}</div>
              </div>
              <div style={{ background: '#15151E', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '12px', color: '#A6A6BA', fontWeight: '600' }}>LOCAL</div>
                <div style={{ fontWeight: '700', marginTop: '4px' }}>{vm.evp?.venue}</div>
                <div style={{ color: '#D4D4DE', fontSize: '14px', lineHeight: '1.4' }}>{vm.evp?.address}</div>
              </div>
              <div style={{ background: '#15151E', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '12px', color: '#A6A6BA', fontWeight: '600' }}>CLASSIFICAÇÃO</div>
                <div style={{ fontWeight: '700', marginTop: '4px' }}>{vm.evp?.age}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button
                onClick={vm.evp?.share}
                style={{
                  height: '44px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid #3A3A4C',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Compartilhar
              </button>
              <button
                onClick={vm.evp?.copy}
                style={{
                  height: '44px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid #3A3A4C',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Copiar link
              </button>
            </div>
          </div>
          {vm.evp?.notice?.show ? (
            <div
              style={
                {
                  borderRadius: '14px',
                  padding: '16px',
                  background: `${vm.evp?.notice?.bg ?? ''}`,
                  color: `${vm.evp?.notice?.fg ?? ''}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                } as CSSProperties
              }
            >
              <b style={{ fontSize: '16px' }}>{vm.evp?.notice?.title}</b>
              <span style={{ fontSize: '15px', lineHeight: '1.5' }}>{vm.evp?.notice?.text}</span>
              {vm.evp?.isEnded ? (
                <button
                  onClick={vm.go?.P02}
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: '6px',
                    height: '44px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    background: '#0B0B10',
                    color: '#fff',
                    border: '0',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Ver próximos eventos
                </button>
              ) : null}
            </div>
          ) : null}
          <section>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '800' }}>Sobre o evento</h2>
            <p
              style={{
                margin: '0',
                color: '#D4D4DE',
                fontSize: '16px',
                lineHeight: '1.6',
                maxWidth: '680px',
                textWrap: 'pretty',
              }}
            >
              {vm.evp?.desc}
            </p>
          </section>
          <section>
            <h2 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: '800' }}>Atrações</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(vm.evp?.attractions ?? []).map((a: Loose, $index: number) => (
                <Fragment key={$index}>
                  <span
                    style={{
                      padding: '8px 12px',
                      borderRadius: '10px',
                      background: '#15151E',
                      border: '1px solid #2C2C3A',
                      fontWeight: '600',
                      fontSize: '15px',
                    }}
                  >
                    {a}
                  </span>
                </Fragment>
              ))}
            </div>
          </section>
        </div>
        {vm.evp?.showTickets ? (
          <aside
            id="ingressos"
            data-screen-label="C01 Seleção de ingressos"
            style={
              {
                background: '#fff',
                color: '#0B0B10',
                borderRadius: '20px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                position: `${vm.evp?.asidePos ?? ''}`,
                top: '80px',
              } as CSSProperties
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <h2 style={{ margin: '0', fontSize: '22px', fontWeight: '800', fontStretch: '108%' }}>Ingressos</h2>
              <span style={{ fontSize: '13px', color: '#5B5B6E' }}>{vm.evp?.limitText}</span>
            </div>
            {vm.evp?.hasAlert ? (
              <div
                style={{
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  color: '#854D0E',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                {vm.evp?.alert}
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(vm.evp?.types ?? []).map((t: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div
                    style={
                      {
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '14px 0',
                        borderTop: '1px solid #EEEEF3',
                        opacity: `${t?.op ?? ''}`,
                      } as CSSProperties
                    }
                  >
                    <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontWeight: '700', fontSize: '16px' }}>{t?.name}</span>
                      <span style={{ fontSize: '16px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {t?.price}
                      </span>
                      <span style={{ fontSize: '13px', color: '#5B5B6E', lineHeight: '1.4' }}>{t?.note}</span>
                    </div>
                    {t?.canBuy ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: '1px solid #D4D4DE',
                          borderRadius: '10px',
                          flex: 'none',
                        }}
                      >
                        <button
                          onClick={t?.dec}
                          aria-label="Diminuir"
                          style={
                            {
                              width: '44px',
                              height: '44px',
                              border: '0',
                              background: 'transparent',
                              fontSize: '22px',
                              cursor: 'pointer',
                              color: `${t?.decC ?? ''}`,
                            } as CSSProperties
                          }
                        >
                          −
                        </button>
                        <span
                          aria-live="polite"
                          style={{ width: '28px', textAlign: 'center', fontWeight: '800', fontSize: '17px' }}
                        >
                          {t?.qty}
                        </span>
                        <button
                          onClick={t?.inc}
                          aria-label="Aumentar"
                          style={
                            {
                              width: '44px',
                              height: '44px',
                              border: '0',
                              background: 'transparent',
                              fontSize: '22px',
                              cursor: 'pointer',
                              color: `${t?.incC ?? ''}`,
                            } as CSSProperties
                          }
                        >
                          +
                        </button>
                      </div>
                    ) : null}
                    {t?.noBuy ? (
                      <span
                        style={
                          {
                            fontSize: '12px',
                            fontWeight: '700',
                            padding: '5px 9px',
                            borderRadius: '6px',
                            background: `${t?.bBg ?? ''}`,
                            color: `${t?.bFg ?? ''}`,
                            flex: 'none',
                            textAlign: 'center',
                            maxWidth: '130px',
                          } as CSSProperties
                        }
                      >
                        {t?.badge}
                      </span>
                    ) : null}
                  </div>
                </Fragment>
              ))}
            </div>
            {vm.evp?.hasSel ? (
              <div
                style={{
                  borderTop: '1px solid #EEEEF3',
                  paddingTop: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {(vm.evp?.lines ?? []).map((l: Loose, $index: number) => (
                  <Fragment key={$index}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#3F3F50' }}
                    >
                      <span>{l?.l}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l?.v}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                borderTop: '1px solid #EEEEF3',
                paddingTop: '12px',
              }}
            >
              <span style={{ fontWeight: '700' }}>Total</span>
              <span style={{ fontSize: '22px', fontWeight: '800', fontVariantNumeric: 'tabular-nums' }}>
                {vm.evp?.total}
              </span>
            </div>
            {vm.notMob ? (
              <button
                onClick={vm.evp?.cont}
                aria-disabled={vm.evp?.contDis}
                style={
                  {
                    height: '52px',
                    borderRadius: '12px',
                    background: `${vm.evp?.contBg ?? ''}`,
                    color: `${vm.evp?.contFg ?? ''}`,
                    border: '0',
                    fontWeight: '700',
                    fontSize: '16px',
                    cursor: 'pointer',
                  } as CSSProperties
                }
              >
                {vm.evp?.contLabel}
              </button>
            ) : null}
            <span style={{ fontSize: '12px', color: '#5B5B6E', lineHeight: '1.45' }}>
              Selecionar quantidades não reserva ingressos. A reserva começa quando você iniciar o pagamento.{' '}
              <button
                onClick={vm.go?.P06}
                style={{
                  background: 'none',
                  border: '0',
                  padding: '0',
                  color: '#5B21B6',
                  textDecoration: 'underline',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Política de cancelamento
              </button>
            </span>
          </aside>
        ) : null}
      </div>
      {vm.evp?.mobBar ? (
        <div
          style={{
            position: 'fixed',
            left: '0',
            right: '0',
            bottom: '0',
            zIndex: '25',
            background: '#0B0B10',
            borderTop: '1px solid #2C2C3A',
            padding: '10px 16px calc(10px + env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#A6A6BA' }}>{vm.evp?.selCount}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{vm.evp?.total}</div>
          </div>
          <button
            onClick={vm.evp?.cont}
            style={
              {
                height: '52px',
                padding: '0 20px',
                borderRadius: '12px',
                background: `${vm.evp?.contBg ?? ''}`,
                color: `${vm.evp?.contFg ?? ''}`,
                border: '0',
                fontWeight: '700',
                fontSize: '16px',
                cursor: 'pointer',
              } as CSSProperties
            }
          >
            {vm.evp?.contLabel}
          </button>
        </div>
      ) : null}
    </main>
  );
}
