import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function EmailsView({ vm }: { vm: ViewModel }) {
  return (
    <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <img src="/brand/partyx-logo-dark.png" width={65} height={36} alt="PartyX" style={{ display: 'block' }} />
          <h1
            style={{
              margin: '8px 0 4px',
              fontSize: '40px',
              fontWeight: '900',
              fontStretch: '110%',
              letterSpacing: '-0.02em',
            }}
          >
            E-mails, PDF e compartilhamento
          </h1>
          <p style={{ margin: '0', color: '#5B5B6E', fontSize: '16px' }}>
            E01 a E05 e lista de contingência. Somente e-mail transacional: sem SMS, WhatsApp automático ou marketing.
            Dados demonstrativos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a href="/" style={{ fontWeight: '700' }}>
            Protótipo
          </a>
          <a href="/docs" style={{ fontWeight: '700' }}>
            Documentação
          </a>
        </div>
      </header>
      <section style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {(vm.emails ?? []).map((m: Loose, $index: number) => (
          <Fragment key={$index}>
            <div id={m?.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: '13px',
                    fontWeight: '600',
                    background: '#0B0B10',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {m?.id}
                </span>
                <b>{m?.name}</b>
              </div>
              <div
                style={{
                  width: '600px',
                  background: '#fff',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(11,11,16,.08)',
                }}
              >
                <div
                  style={{
                    background: '#F7F7FA',
                    borderBottom: '1px solid #E4E4EC',
                    padding: '10px 16px',
                    fontSize: '13px',
                    color: '#3F3F50',
                    lineHeight: '1.6',
                  }}
                >
                  <b>De:</b> PartyX &lt;remetente a definir&gt;
                  <br />
                  <b>Assunto:</b> {m?.subject}
                </div>
                <div style={{ background: '#0B0B10', padding: '22px 32px' }}>
                  <img src="/brand/partyx-logo.png" width={58} height={32} alt="PartyX" style={{ display: 'block' }} />
                </div>
                <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h2
                    style={{
                      margin: '0',
                      fontSize: '26px',
                      lineHeight: '1.15',
                      fontWeight: '900',
                      fontStretch: '108%',
                    }}
                  >
                    {m?.title}
                  </h2>
                  <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.6', color: '#3F3F50' }}>{m?.p1}</p>
                  {m?.hasOrder ? (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '15px',
                        border: '1px solid #E4E4EC',
                        borderRadius: '8px',
                      }}
                    >
                      <tbody>
                        <tr>
                          <td colSpan={2} style={{ padding: '14px 16px', background: '#F7F7FA' }}>
                            <b style={{ fontSize: '17px' }}>Noite Neon</b>
                            <br />
                            <span style={{ color: '#5B5B6E' }}>Sábado, 17/10/2026 · 23:00 · Galpão Aurora</span>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '10px 16px', borderTop: '1px solid #EEEEF3' }}>2 × Pista 2º lote</td>
                          <td style={{ padding: '10px 16px', borderTop: '1px solid #EEEEF3', textAlign: 'right' }}>
                            R$ 160,00
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '10px 16px', borderTop: '1px solid #EEEEF3' }}>1 × VIP</td>
                          <td style={{ padding: '10px 16px', borderTop: '1px solid #EEEEF3', textAlign: 'right' }}>
                            R$ 150,00
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '12px 16px', borderTop: '1px solid #E4E4EC' }}>
                            <b>Total pago (Pix)</b>
                          </td>
                          <td style={{ padding: '12px 16px', borderTop: '1px solid #E4E4EC', textAlign: 'right' }}>
                            <b>R$ 310,00</b>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                  {m?.hasCta ? (
                    <a
                      href="#"
                      style={{
                        alignSelf: 'flex-start',
                        display: 'inline-block',
                        background: '#7C3AED',
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: '700',
                        fontSize: '16px',
                        padding: '14px 22px',
                        borderRadius: '10px',
                      }}
                    >
                      {m?.cta}
                    </a>
                  ) : null}
                  <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.6', color: '#5B5B6E' }}>{m?.p2}</p>
                </div>
                <div
                  style={{
                    borderTop: '1px solid #E4E4EC',
                    padding: '20px 32px',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    color: '#5B5B6E',
                  }}
                >
                  PartyX · razão social e CNPJ a fornecer · atendimento ao comprador: contato a fornecer pela PartyX.
                  <br />
                  Você recebeu este e-mail por causa de uma ação na sua conta. Não é uma mensagem promocional.
                </div>
              </div>
            </div>
          </Fragment>
        ))}
      </section>
      <section id="E04" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '13px',
              fontWeight: '600',
              background: '#0B0B10',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            E04
          </span>
          <b>Ingresso em PDF: individual (A4) e agrupado por pedido</b>
        </div>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '595px',
              height: '842px',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(11,11,16,.1)',
              padding: '44px',
              display: 'flex',
              flexDirection: 'column',
              gap: '22px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #0B0B10',
                paddingBottom: '14px',
              }}
            >
              <img src="/brand/partyx-logo-dark.png" width={65} height={36} alt="PartyX" style={{ display: 'block' }} />
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Ingresso 1 de 3 · Pedido PX-10184</span>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.08em', color: '#5B5B6E' }}>
                EVENTO
              </div>
              <div style={{ fontSize: '40px', fontWeight: '900', fontStretch: '112%', lineHeight: '1' }}>
                Noite Neon
              </div>
            </div>
            <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
              <div
                style={{ width: '260px', height: '260px', padding: '18px', border: '1px solid #0B0B10', flex: 'none' }}
              >
                <svg viewBox="-2 -2 29 29" width="100%" height="100%" style={{ display: 'block' }}>
                  <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
                  <path d={vm.qr1} fill="#000" />
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>TIPO</div>
                  <div style={{ fontSize: '26px', fontWeight: '900' }}>Pista 2º lote</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>CÓDIGO</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '20px', fontWeight: '600' }}>
                    PX-7K4M-2Q9D
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>COMPRADOR</div>
                  <div style={{ fontSize: '18px', fontWeight: '700' }}>Marina Costa</div>
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '14px',
                borderTop: '1px solid #D4D4DE',
                borderBottom: '1px solid #D4D4DE',
                padding: '14px 0',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>DATA</div>
                <div style={{ fontSize: '16px', fontWeight: '700' }}>17/10/2026</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>HORÁRIO</div>
                <div style={{ fontSize: '16px', fontWeight: '700' }}>23:00</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>CLASSIFICAÇÃO</div>
                <div style={{ fontSize: '16px', fontWeight: '700' }}>18 anos</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>LOCAL</div>
                <div style={{ fontSize: '16px', fontWeight: '700' }}>
                  Galpão Aurora · Rua das Acácias, 480, Centro, São Gabriel/RS
                </div>
              </div>
            </div>
            <ul style={{ margin: '0', paddingLeft: '18px', fontSize: '13px', lineHeight: '1.6', color: '#3F3F50' }}>
              <li>
                Apresente este QR na entrada, impresso ou na tela do celular. Cada código permite uma única entrada.
              </li>
              <li>Leve documento com foto. Meia-entrada exige o documento que dá direito ao benefício.</li>
              <li>Não compartilhe este QR: a primeira leitura bloqueia o ingresso.</li>
            </ul>
            <div
              style={{
                marginTop: 'auto',
                fontSize: '11px',
                color: '#5B5B6E',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <span>Emitido em 05/10/2026 14:22 · QR demonstrativo, sem validade real</span>
              <span>PartyX · contato a fornecer</span>
            </div>
          </div>
          <div
            style={{
              width: '595px',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(11,11,16,.1)',
              padding: '36px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #0B0B10',
                paddingBottom: '12px',
              }}
            >
              <img src="/brand/partyx-logo-dark.png" width={58} height={32} alt="PartyX" style={{ display: 'block' }} />
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Pedido PX-10184 · 3 ingressos</span>
            </div>
            <div style={{ fontSize: '14px', color: '#3F3F50' }}>
              Noite Neon · 17/10/2026 · 23:00 · Galpão Aurora. Cada ingresso tem um código diferente; no PDF agrupado,
              cada um ocupa uma página ao imprimir.
            </div>
            {(vm.group ?? []).map((k: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    border: '1px solid #0B0B10',
                    display: 'flex',
                    gap: '18px',
                    padding: '16px',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '140px',
                      height: '140px',
                      padding: '10px',
                      border: '1px solid #D4D4DE',
                      flex: 'none',
                    }}
                  >
                    <svg viewBox="-2 -2 29 29" width="100%" height="100%" style={{ display: 'block' }}>
                      <rect x="-2" y="-2" width="29" height="29" fill="#fff" />
                      <path d={k?.qr} fill="#000" />
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>INGRESSO {k?.pos}</span>
                    <b style={{ fontSize: '22px' }}>{k?.type}</b>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '17px', fontWeight: '600' }}>
                      {k?.code}
                    </span>
                    <span style={{ fontSize: '14px' }}>Marina Costa</span>
                  </div>
                </div>
              </Fragment>
            ))}
            <div style={{ fontSize: '11px', color: '#5B5B6E' }}>
              QRs demonstrativos, sem validade real. Na implementação, o conteúdo é o código assinado (HMAC) gerado no
              servidor.
            </div>
          </div>
        </div>
      </section>
      <section id="contingencia" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '13px',
              fontWeight: '600',
              background: '#0B0B10',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ADM23
          </span>
          <b>PDF imprimível da lista de contingência</b>
        </div>
        <div
          style={{
            width: '842px',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(11,11,16,.1)',
            padding: '36px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              borderBottom: '2px solid #0B0B10',
              paddingBottom: '12px',
              gap: '16px',
            }}
          >
            <div>
              <img src="/brand/partyx-logo-dark.png" width={51} height={28} alt="PartyX" style={{ display: 'block' }} />
              <div style={{ fontSize: '24px', fontWeight: '900', marginTop: '4px' }}>
                Lista de ingressos · Noite Neon
              </div>
              <div style={{ fontSize: '13px', color: '#3F3F50' }}>17/10/2026 · 23:00 · Galpão Aurora</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px', lineHeight: '1.5' }}>
              <b>Exportado em 17/10/2026 às 18:05</b>
              <br />
              por Carla Menezes
              <br />
              Retrato deste momento: vendas, entradas ou cancelamentos posteriores não aparecem.
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#3F3F50' }}>
            Uso: sem internet, confira código e nome e risque a linha de quem entrou. Ingressos cancelados até a
            exportação já estão marcados.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1.2fr 1.3fr 1.6fr 1.1fr .8fr',
              fontSize: '12px',
              border: '1px solid #0B0B10',
            }}
          >
            {(vm.headCells ?? []).map((h: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    padding: '7px 8px',
                    fontWeight: '800',
                    background: '#EEEEF3',
                    borderBottom: '1px solid #0B0B10',
                  }}
                >
                  {h}
                </div>
              </Fragment>
            ))}
            {(vm.contRows ?? []).map((r: Loose, $index: number) => (
              <Fragment key={$index}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #D4D4DE' }}>
                  <span
                    style={{ display: 'inline-block', width: '14px', height: '14px', border: '1.5px solid #0B0B10' }}
                  />
                </div>
                <div
                  style={
                    {
                      padding: '6px 8px',
                      borderBottom: '1px solid #D4D4DE',
                      fontFamily: "'IBM Plex Mono',monospace",
                      textDecoration: `${r?.strike ?? ''}`,
                    } as CSSProperties
                  }
                >
                  {r?.code}
                </div>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #D4D4DE' }}>{r?.type}</div>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #D4D4DE' }}>{r?.name}</div>
                <div
                  style={{
                    padding: '6px 8px',
                    borderBottom: '1px solid #D4D4DE',
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}
                >
                  {r?.cpf}
                </div>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #D4D4DE', fontWeight: '700' }}>{r?.st}</div>
              </Fragment>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#5B5B6E', display: 'flex', justifyContent: 'space-between' }}>
            <span>Página 1 de 9 · 214 ingressos válidos · 3 cancelados · dados demonstrativos</span>
            <span>CPF mascarado conforme minimização de dados</span>
          </div>
        </div>
      </section>
      <section id="E05" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: '13px',
              fontWeight: '600',
              background: '#0B0B10',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            E05
          </span>
          <b>Pré-visualização de compartilhamento (Open Graph)</b>
        </div>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '380px',
              background: '#DCD5CC',
              borderRadius: '18px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: '#5B5B6E',
                alignSelf: 'center',
                background: '#ffffffaa',
                padding: '3px 8px',
                borderRadius: '6px',
              }}
            >
              app de mensagens (genérico)
            </span>
            <div
              style={{
                width: '300px',
                background: '#D9FDD3',
                borderRadius: '10px',
                padding: '5px',
                boxShadow: '0 1px 1px rgba(0,0,0,.1)',
              }}
            >
              <div style={{ background: '#F0F2F5', borderRadius: '7px', overflow: 'hidden' }}>
                <div
                  style={{
                    aspectRatio: '1.91/1',
                    background: 'repeating-linear-gradient(135deg,#1F1838 0 10px,#2A2050 10px 20px)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: '8px',
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', color: '#D4D4DE' }}>
                    og:image · banner 1200 × 630
                  </span>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>Noite Neon · 17/10/2026 · PartyX</div>
                  <div style={{ fontSize: '12px', color: '#3F3F50', marginTop: '2px' }}>
                    Galpão Aurora, São Gabriel/RS. Ingressos online na PartyX.
                  </div>
                  <div style={{ fontSize: '11px', color: '#5B5B6E', marginTop: '4px' }}>dominio-partyx</div>
                </div>
              </div>
              <div style={{ fontSize: '14px', padding: '6px 6px 2px', color: '#0B0B10', overflowWrap: 'anywhere' }}>
                https://dominio-partyx/eventos/noite-neon
              </div>
            </div>
          </div>
          <div
            style={{
              width: '420px',
              background: '#fff',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '13px',
              lineHeight: '1.6',
              boxShadow: '0 1px 2px rgba(11,11,16,.08)',
            }}
          >
            <b style={{ fontSize: '15px' }}>Tags por página de evento</b>
            <div
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: '12px',
                background: '#F7F7FA',
                borderRadius: '8px',
                padding: '10px',
                marginTop: '8px',
                overflowWrap: 'anywhere',
              }}
            >
              og:title = Noite Neon · 17/10/2026 · PartyX
              <br />
              og:description = local + chamada curta
              <br />
              og:image = banner do evento (1200 × 630, gerado no upload)
              <br />
              og:url = /eventos/noite-neon
              <br />
              twitter:card = summary_large_image
            </div>
            <p style={{ margin: '10px 0 0', color: '#3F3F50' }}>
              Compartilhamento é iniciado pelo usuário (WhatsApp, redes sociais ou copiar link). Não há envio automático
              de mensagens.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
