import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function FoundationsView({ vm }: { vm: ViewModel }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: '#0B0B10', color: '#fff', padding: '40px clamp(20px,5vw,64px) 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <img src="/brand/partyx-logo.png" width={72} height={40} alt="PartyX" style={{ display: 'block' }} />
        </div>
        <h1
          style={{
            fontSize: 'clamp(34px,5vw,56px)',
            lineHeight: '1.02',
            fontWeight: '850',
            fontStretch: '112%',
            letterSpacing: '-0.03em',
            margin: '28px 0 12px',
            maxWidth: '900px',
            textWrap: 'pretty',
          }}
        >
          Fundamentos e componentes
        </h1>
        <p style={{ color: '#A6A6BA', fontSize: '18px', lineHeight: '1.5', maxWidth: '720px', margin: '0' }}>
          Biblioteca única para site público, checkout, área do cliente, administração e portaria. As áreas mudam de
          superfície, não de tema.
        </p>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '28px' }}>
          <a
            href="#cores"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Cores
          </a>
          <a
            href="#tipografia"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Tipografia
          </a>
          <a
            href="#espacos"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Espaço, grid e raios
          </a>
          <a
            href="#botoes"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Botões
          </a>
          <a
            href="#campos"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Campos
          </a>
          <a
            href="#cards"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Cards
          </a>
          <a
            href="#dados"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Tabelas e status
          </a>
          <a
            href="#nav"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Navegação
          </a>
          <a
            href="#feedback"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Feedback
          </a>
          <a
            href="#especificos"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Pix, reserva e QR
          </a>
          <a
            href="#portaria"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #2C2C3A',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Resultados da portaria
          </a>
          <a
            href="/"
            style={{
              color: '#fff',
              textDecoration: 'none',
              background: '#7C3AED',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Abrir protótipo
          </a>
          <a
            href="/docs"
            style={{
              color: '#fff',
              textDecoration: 'none',
              border: '1px solid #8B5CF6',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            Documentação
          </a>
        </nav>
      </header>
      <main style={{ padding: '0 clamp(20px,5vw,64px) 96px', maxWidth: '1440px', margin: '0 auto' }}>
        <section id="cores" style={{ paddingTop: '56px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Cores
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', maxWidth: '720px', lineHeight: '1.5' }}>
            Preto, branco e roxo formam a marca. Verde, amarelo e vermelho são exclusivamente semânticos e nunca
            aparecem como decoração.
          </p>
          <h3
            style={{
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: '#5B5B6E',
              margin: '0 0 12px',
            }}
          >
            Marca e superfícies
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '12px' }}>
            {(vm.brandColors ?? []).map((c: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '12px', overflow: 'hidden' }}
                >
                  <div
                    style={
                      {
                        height: '84px',
                        background: `${c?.hex ?? ''}`,
                        borderBottom: '1px solid #E4E4EC',
                      } as CSSProperties
                    }
                  />
                  <div style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>{c?.name}</div>
                    <div
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: '12px',
                        color: '#5B5B6E',
                        marginTop: '2px',
                      }}
                    >
                      {c?.token} · {c?.hex}
                    </div>
                    <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '6px', lineHeight: '1.4' }}>
                      {c?.use}
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <h3
            style={{
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: '#5B5B6E',
              margin: '32px 0 12px',
            }}
          >
            Semânticas
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '12px' }}>
            {(vm.semColors ?? []).map((c: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '12px', overflow: 'hidden' }}
                >
                  <div
                    style={
                      {
                        height: '64px',
                        background: `${c?.hex ?? ''}`,
                        color: `${c?.on ?? ''}`,
                        display: 'flex',
                        alignItems: 'flex-end',
                        padding: '10px 12px',
                        fontWeight: '700',
                        fontSize: '14px',
                      } as CSSProperties
                    }
                  >
                    {c?.sample}
                  </div>
                  <div style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>{c?.name}</div>
                    <div
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: '12px',
                        color: '#5B5B6E',
                        marginTop: '2px',
                      }}
                    >
                      {c?.token} · {c?.hex}
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: '12px',
              marginTop: '24px',
            }}
          >
            <div style={{ background: '#0B0B10', color: '#fff', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", color: '#A6A6BA' }}>
                Site público
              </div>
              <div style={{ fontWeight: '700', marginTop: '8px' }}>
                Base #0B0B10, cartões #15151E, texto branco, ação roxa.
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", color: '#5B5B6E' }}>
                Checkout e área do cliente
              </div>
              <div style={{ fontWeight: '700', marginTop: '8px' }}>
                Branco sobre #F7F7FA, cabeçalho preto, roxo apenas em ações.
              </div>
            </div>
            <div
              style={{
                background: '#F7F7FA',
                border: '1px solid #E4E4EC',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                gap: '12px',
              }}
            >
              <div style={{ width: '28px', borderRadius: '6px', background: '#0B0B10', flex: 'none' }} />
              <div>
                <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", color: '#5B5B6E' }}>
                  Administração
                </div>
                <div style={{ fontWeight: '700', marginTop: '8px' }}>Fundo claro, sidebar preta, destaque #EDE9FE.</div>
              </div>
            </div>
            <div style={{ background: '#000', color: '#fff', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", color: '#A6A6BA' }}>
                Portaria
              </div>
              <div style={{ fontWeight: '700', marginTop: '8px' }}>
                Preto puro, texto grande, resultados em tela cheia verde, amarelo ou vermelho.
              </div>
            </div>
          </div>
        </section>
        <section id="tipografia" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Tipografia
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', maxWidth: '720px', lineHeight: '1.5' }}>
            Archivo (variável em peso e largura) para toda a interface; títulos usam largura expandida. IBM Plex Mono
            para códigos de pedido, ingresso e Pix. Tamanho mínimo de leitura: 14 px; 12 px só para metadados.
          </p>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px' }}>
            {(vm.typeScale ?? []).map((t: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px,200px) minmax(0,1fr)',
                    gap: '16px',
                    padding: '18px 20px',
                    borderBottom: '1px solid #EEEEF3',
                    alignItems: 'baseline',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono',monospace",
                      fontSize: '12px',
                      color: '#5B5B6E',
                      lineHeight: '1.5',
                    }}
                  >
                    {t?.name}
                    <br />
                    {t?.spec}
                  </div>
                  <div
                    style={
                      {
                        fontSize: `${t?.size ?? ''}`,
                        fontWeight: `${t?.weight ?? ''}`,
                        fontStretch: `${t?.stretch ?? ''}`,
                        letterSpacing: `${t?.ls ?? ''}`,
                        lineHeight: '1.15',
                        fontFamily: `${t?.family ?? ''}`,
                        overflowWrap: 'anywhere',
                      } as CSSProperties
                    }
                  >
                    {t?.sample}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="espacos" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 24px',
            }}
          >
            Espaço, grid, raios e sombras
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '16px' }}>
            <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontWeight: '700', marginBottom: '12px' }}>Espaçamento (base 4)</div>
              {(vm.spaces ?? []).map((s: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '6px 0' }}>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: '12px',
                        width: '64px',
                        color: '#5B5B6E',
                      }}
                    >
                      {s?.token}
                    </span>
                    <span
                      style={
                        {
                          height: '12px',
                          width: `${s?.px ?? ''}`,
                          background: '#8B5CF6',
                          borderRadius: '2px',
                        } as CSSProperties
                      }
                    />
                    <span style={{ fontSize: '12px', color: '#5B5B6E' }}>{s?.px}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontWeight: '700', marginBottom: '12px' }}>Grid e larguras</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', lineHeight: '1.45' }}
              >
                <div>
                  <b>390 px</b> · 4 colunas, margem 16, gutter 12. Referência do comprador e da portaria.
                </div>
                <div>
                  <b>360 px</b> · mesmo grid, sem rolagem horizontal; tabelas viram cards.
                </div>
                <div>
                  <b>768 px</b> · 8 colunas, margem 24, gutter 16. Admin com menu em gaveta.
                </div>
                <div>
                  <b>1440 px</b> · 12 colunas, conteúdo máx. 1200, gutter 24. Admin com sidebar fixa de 248.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '4px', marginTop: '6px' }}>
                  {(vm.twelve ?? []).map((_g: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <div style={{ height: '40px', background: '#EDE9FE', borderRadius: '3px' }} />
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontWeight: '700', marginBottom: '12px' }}>Raios e elevação</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px' }}>
                <div style={{ border: '1px solid #E4E4EC', borderRadius: '6px', padding: '14px', fontSize: '12px' }}>
                  <b>r-sm 6</b>
                  <br />
                  badges, chips
                </div>
                <div style={{ border: '1px solid #E4E4EC', borderRadius: '10px', padding: '14px', fontSize: '12px' }}>
                  <b>r-md 10</b>
                  <br />
                  botões, campos
                </div>
                <div style={{ border: '1px solid #E4E4EC', borderRadius: '16px', padding: '14px', fontSize: '12px' }}>
                  <b>r-lg 16</b>
                  <br />
                  cards, modais
                </div>
                <div
                  style={{
                    border: '1px solid #E4E4EC',
                    borderRadius: '999px',
                    padding: '14px',
                    fontSize: '12px',
                    textAlign: 'center',
                  }}
                >
                  <b>pill</b>
                </div>
                <div
                  style={{
                    borderRadius: '16px',
                    padding: '14px',
                    fontSize: '12px',
                    boxShadow: '0 1px 2px rgba(11,11,16,.06),0 1px 1px rgba(11,11,16,.04)',
                  }}
                >
                  <b>sombra-1</b>
                  <br />
                  cards claros
                </div>
                <div
                  style={{
                    borderRadius: '16px',
                    padding: '14px',
                    fontSize: '12px',
                    boxShadow: '0 12px 32px rgba(11,11,16,.18)',
                  }}
                >
                  <b>sombra-2</b>
                  <br />
                  modais, drawers
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '12px', lineHeight: '1.5' }}>
                Foco: anel 2 px #8B5CF6 com afastamento 2 px, visível em fundo claro e escuro. Movimento: 120–200 ms,
                desativado com redução de movimento.
              </div>
            </div>
          </div>
        </section>
        <section id="botoes" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Botões
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', lineHeight: '1.5' }}>
            Altura 48 no mobile e em ações de compra, 40 em tabelas do admin. Alvo de toque mínimo 44 × 44.
          </p>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', overflowX: 'auto' }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: '140px repeat(6,minmax(128px,1fr))', minWidth: '960px' }}
            >
              <div style={{ padding: '14px', fontSize: '12px', color: '#5B5B6E', borderBottom: '1px solid #EEEEF3' }} />
              {(vm.btnStates ?? []).map((s: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div
                    style={{
                      padding: '14px',
                      fontSize: '12px',
                      color: '#5B5B6E',
                      borderBottom: '1px solid #EEEEF3',
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  >
                    {s}
                  </div>
                </Fragment>
              ))}
              {(vm.btnRows ?? []).map((r: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div
                    style={{
                      padding: '14px',
                      fontWeight: '700',
                      fontSize: '14px',
                      borderBottom: '1px solid #EEEEF3',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {r?.name}
                  </div>
                  {(r?.cells ?? []).map((b: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <div
                        style={{
                          padding: '14px',
                          borderBottom: '1px solid #EEEEF3',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={
                            {
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              height: '44px',
                              padding: '0 16px',
                              borderRadius: '10px',
                              fontWeight: '600',
                              fontSize: '15px',
                              background: `${b?.bg ?? ''}`,
                              color: `${b?.fg ?? ''}`,
                              border: `${b?.border ?? ''}`,
                              boxShadow: `${b?.ring ?? ''}`,
                              opacity: `${b?.op ?? ''}`,
                              whiteSpace: 'nowrap',
                            } as CSSProperties
                          }
                        >
                          {b?.loading ? (
                            <span
                              style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                border: '2px solid currentColor',
                                borderRightColor: 'transparent',
                                display: 'inline-block',
                              }}
                            />
                          ) : null}
                          {b?.label}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '16px',
              background: '#0B0B10',
              borderRadius: '16px',
              padding: '20px',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '48px',
                padding: '0 20px',
                borderRadius: '10px',
                background: '#7C3AED',
                color: '#fff',
                fontWeight: '600',
              }}
            >
              Comprar ingressos
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '48px',
                padding: '0 20px',
                borderRadius: '10px',
                border: '1px solid #3A3A4C',
                color: '#fff',
                fontWeight: '600',
              }}
            >
              Compartilhar
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '48px',
                padding: '0 12px',
                color: '#C4B5FD',
                fontWeight: '600',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              Ver todos os eventos
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '48px',
                padding: '0 20px',
                borderRadius: '10px',
                background: '#2A2A38',
                color: '#8A8A9E',
                fontWeight: '600',
              }}
            >
              Esgotado
            </span>
          </div>
        </section>
        <section id="campos" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Campos
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', lineHeight: '1.5', maxWidth: '760px' }}>
            Label sempre visível acima do campo, ajuda abaixo, erro junto ao campo com ícone e texto. Placeholder só
            exemplifica o formato.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '16px' }}>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>E-mail</span>
                <input
                  value="marina.costa@partyx.test"
                  style={{
                    height: '48px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    padding: '0 14px',
                    font: 'inherit',
                    fontSize: '16px',
                    color: '#0B0B10',
                  }}
                  readOnly
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Senha</span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '2px solid #8B5CF6',
                    borderRadius: '10px',
                    height: '48px',
                    padding: '0 4px 0 12px',
                    boxShadow: '0 0 0 3px #EDE9FE',
                  }}
                >
                  <input
                    type={vm.pwType}
                    value="festa2026"
                    style={{ border: '0', outline: '0', flex: '1', font: 'inherit', fontSize: '16px', minWidth: '0' }}
                    readOnly
                  />
                  <button
                    onClick={vm.togglePw}
                    style={{
                      height: '40px',
                      border: '0',
                      background: 'transparent',
                      color: '#5B21B6',
                      font: 'inherit',
                      fontWeight: '600',
                      fontSize: '14px',
                      padding: '0 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {vm.pwLabel}
                  </button>
                </span>
                <span style={{ fontSize: '12px', color: '#5B5B6E' }}>Foco: borda roxa e halo suave.</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>CPF</span>
                <input
                  value="123.456.789-00"
                  style={{
                    height: '48px',
                    border: '2px solid #DC2626',
                    borderRadius: '10px',
                    padding: '0 14px',
                    font: 'inherit',
                    fontSize: '16px',
                  }}
                  readOnly
                />
                <span
                  style={{ fontSize: '13px', color: '#B91C1C', display: 'flex', gap: '6px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontWeight: '800' }}>!</span>CPF inválido. Confira os números digitados.
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Telefone com DDD</span>
                <input
                  placeholder="(55) 99999-9999"
                  style={{
                    height: '48px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    padding: '0 14px',
                    font: 'inherit',
                    fontSize: '16px',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#5B5B6E' }}>Máscara aplicada durante a digitação.</span>
              </label>
            </div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Status</span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '48px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    padding: '0 14px',
                    fontSize: '16px',
                  }}
                >
                  Publicado <span style={{ color: '#5B5B6E' }}>▾</span>
                </span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Data</span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '48px',
                      border: '1px solid #D4D4DE',
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                    }}
                  >
                    17/10/2026
                  </span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Horário</span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '48px',
                      border: '1px solid #D4D4DE',
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '16px',
                    }}
                  >
                    23:00
                  </span>
                </label>
              </div>
              <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer' }}>
                <span
                  onClick={vm.toggleAccept}
                  style={
                    {
                      width: '24px',
                      height: '24px',
                      flex: 'none',
                      borderRadius: '6px',
                      border: `2px solid ${vm.acceptBorder ?? ''}`,
                      background: `${vm.acceptBg ?? ''}`,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: '800',
                      marginTop: '1px',
                    } as CSSProperties
                  }
                >
                  {vm.acceptMark}
                </span>
                <span style={{ fontSize: '14px', lineHeight: '1.45' }}>
                  Li e aceito os <a href="#">Termos de Uso</a> e a <a href="#">Política de Privacidade</a>.
                </span>
              </label>
              <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '-10px' }}>
                Começa desmarcado. Clique para testar.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Quantidade · Pista 2º lote</span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    width: 'max-content',
                  }}
                >
                  <button
                    onClick={vm.dec}
                    aria-label="Diminuir"
                    style={
                      {
                        width: '48px',
                        height: '48px',
                        border: '0',
                        background: 'transparent',
                        fontSize: '22px',
                        cursor: 'pointer',
                        color: `${vm.decColor ?? ''}`,
                      } as CSSProperties
                    }
                  >
                    −
                  </button>
                  <span style={{ width: '40px', textAlign: 'center', fontWeight: '700', fontSize: '18px' }}>
                    {vm.qty}
                  </span>
                  <button
                    onClick={vm.inc}
                    aria-label="Aumentar"
                    style={
                      {
                        width: '48px',
                        height: '48px',
                        border: '0',
                        background: 'transparent',
                        fontSize: '22px',
                        cursor: 'pointer',
                        color: `${vm.incColor ?? ''}`,
                      } as CSSProperties
                    }
                  >
                    +
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: '#5B5B6E' }}>{vm.qtyHint}</span>
              </div>
            </div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Banner do evento</span>
              <div
                style={{
                  border: '2px dashed #C9C9D6',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: '700' }}>Arraste a imagem ou selecione um arquivo</span>
                <span style={{ fontSize: '12px', color: '#5B5B6E' }}>
                  Proporção recomendada 16:9. Formatos e tamanho máximo conforme configuração do servidor.
                </span>
                <span
                  style={{
                    marginTop: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '40px',
                    padding: '0 14px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Selecionar arquivo
                </span>
              </div>
              <div
                style={{
                  border: '1px solid #E4E4EC',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '36px',
                    borderRadius: '6px',
                    background: 'repeating-linear-gradient(135deg,#EDE9FE 0 6px,#E4DCFD 6px 12px)',
                    flex: 'none',
                  }}
                />
                <div style={{ flex: '1', minWidth: '0' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>banner-noite-neon.jpg</div>
                  <div style={{ height: '6px', background: '#EEEEF3', borderRadius: '6px', marginTop: '6px' }}>
                    <div style={{ height: '6px', width: '64%', background: '#7C3AED', borderRadius: '6px' }} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '4px' }}>Enviando 64%</div>
                </div>
              </div>
              <div
                style={{
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#991B1B',
                  lineHeight: '1.45',
                }}
              >
                <b>Não foi possível usar este arquivo.</b> Envie uma imagem JPG, PNG ou WebP dentro do tamanho
                permitido.
              </div>
            </div>
          </div>
        </section>
        <section id="cards" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 24px',
            }}
          >
            Cards de evento, pedido e ingresso
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
              gap: '16px',
              alignItems: 'start',
            }}
          >
            <div style={{ background: '#0B0B10', borderRadius: '20px', padding: '16px' }}>
              <div style={{ background: '#15151E', borderRadius: '16px', overflow: 'hidden', color: '#fff' }}>
                <div
                  style={{
                    aspectRatio: '16/9',
                    background: 'repeating-linear-gradient(135deg,#1E1A2E 0 10px,#241E38 10px 20px)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: '10px',
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: '#A6A6BA' }}>
                    banner do evento 16:9
                  </span>
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '13px', color: '#C4B5FD', fontWeight: '600' }}>SÁB, 17 OUT · 23:00</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', fontStretch: '108%', letterSpacing: '-0.01em' }}>
                    Noite Neon
                  </div>
                  <div style={{ fontSize: '14px', color: '#A6A6BA' }}>Galpão Aurora · São Gabriel/RS</div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '10px',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>
                      <span style={{ color: '#A6A6BA' }}>a partir de</span> <b>R$ 40,00</b>
                    </span>
                    <span
                      style={{
                        height: '40px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0 14px',
                        borderRadius: '10px',
                        background: '#7C3AED',
                        fontWeight: '600',
                        fontSize: '14px',
                      }}
                    >
                      Comprar
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: '#5B5B6E' }}>
                    Pedido PX-10421
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '17px', marginTop: '2px' }}>Noite Neon</div>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: '#DCFCE7',
                    color: '#14532D',
                  }}
                >
                  Pago
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#5B5B6E' }}>05/10/2026 · 3 ingressos · Pix</div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #EEEEF3',
                  paddingTop: '10px',
                  fontSize: '15px',
                }}
              >
                <span>Total</span>
                <b>R$ 310,00</b>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', overflow: 'hidden' }}>
              <div
                style={{
                  background: '#0B0B10',
                  color: '#fff',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: '700' }}>VIP</span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: '#DCFCE7',
                    color: '#14532D',
                  }}
                >
                  Válido
                </span>
              </div>
              <div style={{ padding: '16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div
                  style={{
                    width: '88px',
                    height: '88px',
                    background: '#fff',
                    border: '1px solid #E4E4EC',
                    borderRadius: '8px',
                    padding: '4px',
                    flex: 'none',
                  }}
                >
                  <svg viewBox="-2 -2 29 29" width="100%" height="100%" style={{ display: 'block' }}>
                    <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
                    <path d={vm.qrA} fill="#000" />
                  </svg>
                </div>
                <div style={{ minWidth: '0' }}>
                  <div style={{ fontWeight: '700' }}>Noite Neon</div>
                  <div style={{ fontSize: '13px', color: '#5B5B6E', marginTop: '2px' }}>17/10/2026 · 23:00</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', marginTop: '6px' }}>
                    PX-7K4M-2Q9D
                  </div>
                  <div style={{ fontSize: '12px', color: '#5B5B6E', marginTop: '2px' }}>Marina Costa</div>
                </div>
              </div>
            </div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                overflow: 'hidden',
                opacity: '1',
              }}
            >
              <div
                style={{
                  background: '#EEEEF3',
                  color: '#3F3F50',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: '700' }}>Pista 2º lote</span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: '#FEE2E2',
                    color: '#991B1B',
                  }}
                >
                  Cancelado
                </span>
              </div>
              <div style={{ padding: '16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div
                  style={{
                    width: '88px',
                    height: '88px',
                    border: '1px dashed #C9C9D6',
                    borderRadius: '8px',
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontSize: '11px',
                    color: '#5B5B6E',
                    padding: '6px',
                  }}
                >
                  QR indisponível
                </div>
                <div style={{ fontSize: '13px', color: '#5B5B6E', lineHeight: '1.45' }}>
                  Este ingresso foi cancelado pela PartyX e não permite entrada.
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="dados" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Status, tabelas, filtros, abas e paginação
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', lineHeight: '1.5', maxWidth: '760px' }}>
            Pedido, pagamento e ingresso têm vocabulários separados. Todo badge combina cor, texto e, quando crítico,
            ícone.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '16px' }}>
            {(vm.badgeGroups ?? []).map((g: Loose, $index: number) => (
              <Fragment key={$index}>
                <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '16px', padding: '16px' }}>
                  <div style={{ fontWeight: '700', marginBottom: '10px' }}>{g?.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(g?.items ?? []).map((b: Loose, $index: number) => (
                      <Fragment key={$index}>
                        <span
                          style={
                            {
                              fontSize: '12px',
                              fontWeight: '700',
                              padding: '5px 9px',
                              borderRadius: '6px',
                              background: `${b?.bg ?? ''}`,
                              color: `${b?.fg ?? ''}`,
                            } as CSSProperties
                          }
                        >
                          {b?.label}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <div
            style={{
              background: '#fff',
              border: '1px solid #E4E4EC',
              borderRadius: '16px',
              marginTop: '16px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '4px',
                padding: '0 16px',
                borderBottom: '1px solid #E4E4EC',
                overflowX: 'auto',
              }}
            >
              <span
                style={{
                  padding: '14px 10px',
                  fontWeight: '700',
                  fontSize: '14px',
                  borderBottom: '2px solid #7C3AED',
                  color: '#0B0B10',
                  whiteSpace: 'nowrap',
                }}
              >
                Todos 12
              </span>
              <span
                style={{
                  padding: '14px 10px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#5B5B6E',
                  whiteSpace: 'nowrap',
                }}
              >
                Rascunho 1
              </span>
              <span
                style={{
                  padding: '14px 10px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#5B5B6E',
                  whiteSpace: 'nowrap',
                }}
              >
                Publicado 4
              </span>
              <span
                style={{
                  padding: '14px 10px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#5B5B6E',
                  whiteSpace: 'nowrap',
                }}
              >
                Encerrado 7
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '14px 16px', alignItems: 'center' }}>
              <span
                style={{
                  flex: '1 1 220px',
                  display: 'flex',
                  alignItems: 'center',
                  height: '40px',
                  border: '1px solid #D4D4DE',
                  borderRadius: '10px',
                  padding: '0 12px',
                  color: '#5B5B6E',
                  fontSize: '14px',
                }}
              >
                Buscar por nome ou número
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '999px',
                  background: '#EDE9FE',
                  color: '#5B21B6',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Evento: Noite Neon ×
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '999px',
                  background: '#EDE9FE',
                  color: '#5B21B6',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Status: Pago ×
              </span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#5B21B6', textDecoration: 'underline' }}>
                Limpar filtros
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '640px' }}>
                <thead>
                  <tr
                    style={{
                      background: '#F7F7FA',
                      textAlign: 'left',
                      color: '#5B5B6E',
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                    }}
                  >
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Pedido</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Comprador</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Qtd.</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Pagamento</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Emissão</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: '1px solid #EEEEF3' }}>
                    <td style={{ padding: '12px 16px', fontFamily: "'IBM Plex Mono',monospace" }}>PX-10421</td>
                    <td style={{ padding: '12px 16px' }}>Marina Costa</td>
                    <td style={{ padding: '12px 16px' }}>3</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      R$ 310,00
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: '#DCFCE7',
                          color: '#14532D',
                        }}
                      >
                        Aprovado
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: '#DCFCE7',
                          color: '#14532D',
                        }}
                      >
                        Emitidos 3/3
                      </span>
                    </td>
                  </tr>
                  <tr style={{ borderTop: '1px solid #EEEEF3', background: '#FAFAFC' }}>
                    <td style={{ padding: '12px 16px', fontFamily: "'IBM Plex Mono',monospace" }}>PX-10433</td>
                    <td style={{ padding: '12px 16px' }}>Lucas Andrade</td>
                    <td style={{ padding: '12px 16px' }}>2</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      R$ 160,00
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: '#FEF3C7',
                          color: '#854D0E',
                        }}
                      >
                        Aguardando
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: '#EEEEF3',
                          color: '#3F3F50',
                        }}
                      >
                        Não emitido
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderTop: '1px solid #EEEEF3',
                flexWrap: 'wrap',
                fontSize: '14px',
                color: '#5B5B6E',
              }}
            >
              <span>1–10 de 124</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ‹
                </span>
                <span
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0B0B10',
                    color: '#fff',
                    fontWeight: '700',
                  }}
                >
                  1
                </span>
                <span
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  2
                </span>
                <span
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '1px solid #D4D4DE',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ›
                </span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: '13px', color: '#5B5B6E', marginTop: '10px' }}>
            Abaixo de 768 px, cada linha vira um card com número, comprador, valor e badges; o detalhe abre ao tocar.
          </div>
        </section>
        <section id="nav" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 24px',
            }}
          >
            Navegação
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: '#0B0B10',
                borderRadius: '16px',
                padding: '0 20px',
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                color: '#fff',
                overflow: 'hidden',
              }}
            >
              <img src="/brand/partyx-logo.png" width={58} height={32} alt="PartyX" style={{ display: 'block' }} />
              <span style={{ fontSize: '15px', fontWeight: '600' }}>Eventos</span>
              <span
                style={{
                  flex: '1',
                  maxWidth: '360px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#15151E',
                  border: '1px solid #2C2C3A',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  color: '#8A8A9E',
                  fontSize: '14px',
                }}
              >
                Buscar evento
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '15px', fontWeight: '600' }}>Meus ingressos</span>
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#2A2A38',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '14px',
                }}
              >
                MC
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '16px' }}>
              <div
                style={{
                  background: '#0B0B10',
                  borderRadius: '16px',
                  padding: '16px',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px 14px' }}>
                  <img src="/brand/partyx-logo.png" width={51} height={28} alt="PartyX" style={{ display: 'block' }} />
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#A6A6BA' }}>Admin</span>
                </span>
                <span style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: '#D4D4DE' }}>
                  Visão geral
                </span>
                <span
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: '#7C3AED1F',
                    color: '#fff',
                    fontWeight: '700',
                    boxShadow: 'inset 3px 0 0 #8B5CF6',
                  }}
                >
                  Eventos
                </span>
                <span style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: '#D4D4DE' }}>
                  Pedidos
                </span>
                <span style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: '#D4D4DE' }}>
                  Relatórios ▾
                </span>
                <span style={{ padding: '6px 12px 6px 24px', fontSize: '13px', color: '#A6A6BA' }}>
                  Vendas · Promoters · Taxa mensal
                </span>
              </div>
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #E4E4EC',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ fontWeight: '700' }}>Área do cliente</div>
                <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #E4E4EC', overflowX: 'auto' }}>
                  <span
                    style={{
                      padding: '10px',
                      fontSize: '14px',
                      fontWeight: '700',
                      borderBottom: '2px solid #7C3AED',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Meus ingressos
                  </span>
                  <span style={{ padding: '10px', fontSize: '14px', color: '#5B5B6E', whiteSpace: 'nowrap' }}>
                    Minhas compras
                  </span>
                  <span style={{ padding: '10px', fontSize: '14px', color: '#5B5B6E', whiteSpace: 'nowrap' }}>
                    Minha conta
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#5B5B6E', lineHeight: '1.5' }}>
                  No celular, as mesmas três seções ficam em uma barra inferior fixa com ícone e texto; Sair fica em
                  Minha conta.
                </div>
              </div>
              <div
                style={{
                  background: '#000',
                  borderRadius: '16px',
                  padding: '14px',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div style={{ minWidth: '0' }}>
                    <div style={{ fontSize: '12px', color: '#A6A6BA' }}>Validando</div>
                    <div style={{ fontWeight: '800', fontSize: '17px' }}>Noite Neon · 17/10</div>
                  </div>
                  <span
                    style={{
                      height: '44px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 12px',
                      border: '1px solid #3A3A4C',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                    }}
                  >
                    Trocar
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span
                    style={{
                      flex: '1',
                      height: '48px',
                      borderRadius: '10px',
                      background: '#7C3AED',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                    }}
                  >
                    Câmera
                  </span>
                  <span
                    style={{
                      flex: '1',
                      height: '48px',
                      borderRadius: '10px',
                      border: '1px solid #3A3A4C',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                    }}
                  >
                    Busca manual
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="feedback" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 24px',
            }}
          >
            Feedback: alertas, toasts, modais, drawers, skeleton e vazio
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
              gap: '16px',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  border: '1px solid #BBF7D0',
                  background: '#F0FDF4',
                  color: '#14532D',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                <b>Alterações salvas.</b> O evento foi atualizado.
              </div>
              <div
                style={{
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  color: '#854D0E',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                <b>A disponibilidade mudou.</b> Restam 1 ingresso VIP. Ajuste a quantidade para continuar.
              </div>
              <div
                style={{
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: '#991B1B',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                <b>Código não encontrado.</b> Confira o código do promoter.
              </div>
              <div
                style={{
                  border: '1px solid #DDD6FE',
                  background: '#F5F3FF',
                  color: '#4C1D95',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                <b>Informação.</b> O código do promoter não altera o valor do pedido.
              </div>
              <div
                style={{
                  background: '#0B0B10',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: '0 12px 32px rgba(11,11,16,.18)',
                }}
              >
                <span>Link copiado</span>
                <span style={{ color: '#C4B5FD', fontWeight: '600' }}>Fechar</span>
              </div>
            </div>
            <div
              style={{
                background: 'rgba(11,11,16,.55)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: '16px',
                  padding: '20px',
                  maxWidth: '360px',
                  boxShadow: '0 12px 32px rgba(11,11,16,.18)',
                }}
              >
                <div style={{ fontWeight: '800', fontSize: '18px' }}>Cancelar este ingresso?</div>
                <p style={{ fontSize: '14px', color: '#3F3F50', lineHeight: '1.5', margin: '8px 0 16px' }}>
                  O acesso de PX-7K4M-2Q9D será invalidado. Isso não faz estorno: o reembolso, se houver, é feito pela
                  PartyX no gateway.
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      height: '44px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 14px',
                      border: '1px solid #D4D4DE',
                      borderRadius: '10px',
                      fontWeight: '600',
                      fontSize: '14px',
                    }}
                  >
                    Voltar
                  </span>
                  <span
                    style={{
                      height: '44px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 14px',
                      background: '#DC2626',
                      color: '#fff',
                      borderRadius: '10px',
                      fontWeight: '600',
                      fontSize: '14px',
                    }}
                  >
                    Cancelar ingresso
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontWeight: '700' }}>Skeleton</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div
                  style={{
                    width: '72px',
                    height: '48px',
                    borderRadius: '8px',
                    background: '#EEEEF3',
                    animation: 'pxpulse 1.4s ease-in-out infinite',
                  }}
                />
                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      height: '12px',
                      width: '70%',
                      borderRadius: '6px',
                      background: '#EEEEF3',
                      animation: 'pxpulse 1.4s ease-in-out infinite',
                    }}
                  />
                  <div
                    style={{
                      height: '12px',
                      width: '45%',
                      borderRadius: '6px',
                      background: '#EEEEF3',
                      animation: 'pxpulse 1.4s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  borderTop: '1px solid #EEEEF3',
                  paddingTop: '16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: '#EDE9FE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#5B21B6',
                    fontWeight: '800',
                  }}
                >
                  0
                </div>
                <div style={{ fontWeight: '700' }}>Nenhum promoter cadastrado</div>
                <div style={{ fontSize: '14px', color: '#5B5B6E' }}>
                  Cadastre um promoter para rastrear vendas por código.
                </div>
                <span
                  style={{
                    marginTop: '6px',
                    height: '40px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    background: '#7C3AED',
                    color: '#fff',
                    borderRadius: '10px',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Cadastrar promoter
                </span>
              </div>
            </div>
          </div>
        </section>
        <section id="especificos" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Pix, resumo, reserva e QR do ingresso
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', lineHeight: '1.5', maxWidth: '760px' }}>
            O QR do Pix vive dentro de um bloco roxo com a palavra “Pagamento”. O QR do ingresso vive em um cartão
            branco com código e tipo. Os dois nunca aparecem juntos na mesma tela.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
              gap: '16px',
              alignItems: 'start',
            }}
          >
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>Resumo do pedido</b>
                <span style={{ fontSize: '12px', color: '#5B5B6E' }}>Noite Neon</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span>2 × Pista 2º lote</span>
                <span>R$ 160,00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span>1 × VIP</span>
                <span>R$ 150,00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#5B5B6E' }}>
                <span>Promoter</span>
                <span>DUDA · sem alteração de valor</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #EEEEF3',
                  paddingTop: '12px',
                  fontSize: '18px',
                }}
              >
                <b>Total</b>
                <b>R$ 310,00</b>
              </div>
            </div>
            <div
              style={{
                background: '#F5F3FF',
                border: '1px solid #DDD6FE',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <b style={{ color: '#4C1D95' }}>Reserva ativa</b>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontWeight: '600',
                    fontSize: '20px',
                    color: '#4C1D95',
                  }}
                >
                  09:41
                </span>
              </div>
              <div style={{ height: '6px', background: '#DDD6FE', borderRadius: '6px' }}>
                <div style={{ height: '6px', width: '82%', background: '#7C3AED', borderRadius: '6px' }} />
              </div>
              <div style={{ fontSize: '13px', color: '#4C1D95', lineHeight: '1.45' }}>
                Seus ingressos ficam reservados até o fim do prazo. Depois disso, voltam para venda.
              </div>
              <div
                style={{
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  color: '#854D0E',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '13px',
                }}
              >
                Com menos de 2 minutos o contador fica amarelo.
              </div>
            </div>
            <div
              style={{
                background: '#7C3AED',
                borderRadius: '16px',
                padding: '16px',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  fontWeight: '700',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span>Pagamento Pix</span>
                <span>R$ 310,00</span>
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  padding: '10px',
                  width: '200px',
                  height: '200px',
                  position: 'relative',
                }}
              >
                <svg viewBox="-2 -2 29 29" width="100%" height="100%" style={{ display: 'block' }}>
                  <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
                  <path d={vm.qrPix} fill="#0B0B10" />
                </svg>
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%,-50%)',
                    background: '#fff',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    fontWeight: '900',
                    fontSize: '13px',
                    color: '#5B21B6',
                  }}
                >
                  Pix
                </span>
              </div>
              <div style={{ fontSize: '12px', opacity: '.9' }}>QR de pagamento. Não é o seu ingresso.</div>
            </div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #E4E4EC',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  fontWeight: '700',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span>Ingresso · VIP</span>
                <span style={{ color: '#15803D' }}>Válido</span>
              </div>
              <div
                style={{
                  background: '#fff',
                  padding: '16px',
                  border: '1px solid #E4E4EC',
                  borderRadius: '8px',
                  width: '216px',
                  height: '216px',
                }}
              >
                <svg viewBox="-2 -2 29 29" width="100%" height="100%" style={{ display: 'block' }}>
                  <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
                  <path d={vm.qrB} fill="#000" />
                </svg>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '15px', fontWeight: '600' }}>
                PX-9TQ3-HW7E
              </div>
              <div style={{ fontSize: '12px', color: '#5B5B6E' }}>QR demonstrativo · sem validade real</div>
            </div>
          </div>
        </section>
        <section id="portaria" style={{ paddingTop: '64px' }}>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: '800',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}
          >
            Resultados da portaria
          </h2>
          <p style={{ color: '#5B5B6E', margin: '0 0 24px', lineHeight: '1.5', maxWidth: '760px' }}>
            Cor, ícone, palavra e som. Sem cor, a mensagem continua compreensível. Sem resposta do servidor, nunca verde
            nem vermelho.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
            {(vm.results ?? []).map((r: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={
                    {
                      background: `${r?.bg ?? ''}`,
                      color: `${r?.fg ?? ''}`,
                      borderRadius: '16px',
                      padding: '20px',
                      minHeight: '220px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    } as CSSProperties
                  }
                >
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      border: '3px solid currentColor',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      fontWeight: '900',
                    }}
                  >
                    {r?.icon}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '850', fontStretch: '108%', lineHeight: '1.05' }}>
                    {r?.title}
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: '1.4', fontWeight: '500' }}>{r?.sub}</div>
                  <div style={{ marginTop: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px' }}>
                    {r?.sound}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
