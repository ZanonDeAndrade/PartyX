import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../logic/viewTypes';
import type { Loose } from '../types';

export function DocumentationView({ vm }: { vm: ViewModel }) {
  return (
    <div>
      <header style={{ background: '#0B0B10', color: '#fff', padding: '36px clamp(16px,5vw,64px) 40px' }}>
        <img src="/brand/partyx-logo.png" width={65} height={36} alt="PartyX" style={{ display: 'block' }} />
        <h1
          style={{
            margin: '18px 0 8px',
            fontSize: 'clamp(32px,5vw,52px)',
            lineHeight: '1.02',
            fontWeight: '900',
            fontStretch: '112%',
            letterSpacing: '-0.03em',
          }}
        >
          Documentação de design
        </h1>
        <p style={{ margin: '0', color: '#A6A6BA', fontSize: '17px', lineHeight: '1.5', maxWidth: '760px' }}>
          Sitemap, anotações para desenvolvimento, matriz de rastreabilidade, premissas pendentes e divergências entre a
          documentação de desenvolvimento e o orçamento. Um design não comprova segurança nem aprovação técnica.
        </p>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '22px' }}>
          {(vm.toc ?? []).map((t: Loose, $index: number) => (
            <Fragment key={$index}>
              <a
                href={t?.href}
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  border: '1px solid #2C2C3A',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              >
                {t?.label}
              </a>
            </Fragment>
          ))}
        </nav>
      </header>
      <main
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 clamp(16px,4vw,48px) 96px',
          display: 'flex',
          flexDirection: 'column',
          gap: '56px',
        }}
      >
        <section id="entrega" style={{ paddingTop: '40px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Arquivos da entrega
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '12px' }}>
            {(vm.files ?? []).map((f: Loose, $index: number) => (
              <Fragment key={$index}>
                <a
                  href={f?.href}
                  style={{
                    textDecoration: 'none',
                    color: '#0B0B10',
                    background: '#fff',
                    border: '1px solid #E4E4EC',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <b style={{ fontSize: '17px' }}>{f?.name}</b>
                  <span style={{ fontSize: '14px', color: '#5B5B6E', lineHeight: '1.5' }}>{f?.text}</span>
                </a>
              </Fragment>
            ))}
          </div>
          <div
            style={{
              marginTop: '12px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#854D0E',
              borderRadius: '12px',
              padding: '12px 14px',
              fontSize: '14px',
              lineHeight: '1.55',
            }}
          >
            No protótipo, a barra amarela “DEMO” é ferramenta de apresentação: troca de perfil, largura (360, 390, 768,
            1440), índice “Telas e estados” com todos os IDs e “Anotações” por tela. Não faz parte do produto. Botões de
            simulação ficam em caixas tracejadas amarelas.
          </div>
        </section>
        <section id="sitemap">
          <h2 style={{ margin: '0 0 6px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Sitemap por perfil
          </h2>
          <p style={{ margin: '0 0 16px', color: '#5B5B6E', fontSize: '15px' }}>
            Endereços ilustrativos; domínio a definir. Promoter não é perfil e não tem portal.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))',
              gap: '12px',
              alignItems: 'start',
            }}
          >
            {(vm.sitemap ?? []).map((g: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px', overflow: 'hidden' }}
                >
                  <div
                    style={
                      { background: `${g?.bg ?? ''}`, color: `${g?.fg ?? ''}`, padding: '12px 14px' } as CSSProperties
                    }
                  >
                    <b style={{ fontSize: '16px' }}>{g?.name}</b>
                    <div style={{ fontSize: '13px', opacity: '.85' }}>{g?.sub}</div>
                  </div>
                  {(g?.items ?? []).map((i: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '62px 1fr',
                          gap: '8px',
                          padding: '8px 14px',
                          borderTop: '1px solid #F1F1F5',
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: '600', color: '#5B21B6' }}>
                          {i?.id}
                        </span>
                        <span>
                          {i?.t}
                          <br />
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: '#5B5B6E' }}>
                            {i?.p}
                          </span>
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="permissoes">
          <h2 style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>Permissões</h2>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px', overflowX: 'auto' }}>
            <div style={{ minWidth: '680px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr repeat(4,1fr)',
                  gap: '8px',
                  padding: '10px 16px',
                  background: '#F7F7FA',
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  color: '#5B5B6E',
                }}
              >
                <span>Área</span>
                <span>Visitante</span>
                <span>Cliente</span>
                <span>Administrador</span>
                <span>Validador</span>
              </div>
              {(vm.perms ?? []).map((p: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr repeat(4,1fr)',
                      gap: '8px',
                      padding: '10px 16px',
                      borderTop: '1px solid #EEEEF3',
                      fontSize: '14px',
                    }}
                  >
                    <span>
                      <b>{p?.a}</b>
                      <br />
                      <span style={{ fontSize: '12px', color: '#5B5B6E' }}>{p?.ids}</span>
                    </span>
                    {(p?.c ?? []).map((c: Loose, $index: number) => (
                      <Fragment key={$index}>
                        <span style={{ fontWeight: '700', color: `${c?.fg ?? ''}` } as CSSProperties}>{c?.t}</span>
                      </Fragment>
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#3F3F50', lineHeight: '1.55' }}>
            Toda rota verifica a permissão no servidor (RF-09). Acesso indevido leva a G04 com retorno à área
            autorizada; sem login, leva a A01 com retorno ao destino.
          </p>
        </section>
        <section id="estados">
          <h2 style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Estados e transições
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))',
              gap: '12px',
              alignItems: 'start',
            }}
          >
            {(vm.machines ?? []).map((m: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #E4E4EC',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <b style={{ fontSize: '17px' }}>{m?.name}</b>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(m?.states ?? []).map((x: Loose, $index: number) => (
                      <Fragment key={$index}>
                        <span
                          style={
                            {
                              fontSize: '12px',
                              fontWeight: '700',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: `${x?.bg ?? ''}`,
                              color: `${x?.fg ?? ''}`,
                            } as CSSProperties
                          }
                        >
                          {x?.l}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                  {(m?.tr ?? []).map((t: Loose, $index: number) => (
                    <Fragment key={$index}>
                      <div
                        style={{
                          fontSize: '13px',
                          lineHeight: '1.5',
                          borderTop: '1px solid #F1F1F5',
                          paddingTop: '6px',
                        }}
                      >
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: '#5B21B6' }}>
                          {t?.f}
                        </span>
                        <br />
                        {t?.w}
                      </div>
                    </Fragment>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="anotacoes">
          <h2 style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Regras e dependências de integração
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))',
              gap: '12px',
              alignItems: 'start',
            }}
          >
            {(vm.rules ?? []).map((r: Loose, $index: number) => (
              <Fragment key={$index}>
                <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px', padding: '16px' }}>
                  <b style={{ fontSize: '17px' }}>{r?.name}</b>
                  <ul
                    style={{
                      margin: '8px 0 0',
                      paddingLeft: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      color: '#3F3F50',
                    }}
                  >
                    {(r?.items ?? []).map((i: Loose, $index: number) => (
                      <Fragment key={$index}>
                        <li>{i}</li>
                      </Fragment>
                    ))}
                  </ul>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="matriz">
          <h2 style={{ margin: '0 0 6px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Matriz Requisito → Tela/estado → Critério → Cobertura
          </h2>
          <p style={{ margin: '0 0 14px', color: '#5B5B6E', fontSize: '15px', lineHeight: '1.5' }}>
            “Representado; validação depende da implementação” indica que o design mostra o comportamento, mas a
            comprovação exige backend, concorrência, auditoria, assinatura de QR, gateway ou teste em aparelho.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {(vm.legend ?? []).map((l: Loose, $index: number) => (
              <Fragment key={$index}>
                <span
                  style={
                    {
                      fontSize: '12px',
                      fontWeight: '700',
                      padding: '5px 9px',
                      borderRadius: '6px',
                      background: `${l?.bg ?? ''}`,
                      color: `${l?.fg ?? ''}`,
                    } as CSSProperties
                  }
                >
                  {l?.l}: {l?.n}
                </span>
              </Fragment>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px', overflowX: 'auto' }}>
            <div style={{ minWidth: '920px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '78px 2.2fr 1.6fr 1fr 1.5fr',
                  gap: '10px',
                  padding: '10px 16px',
                  background: '#F7F7FA',
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  color: '#5B5B6E',
                }}
              >
                <span>RF</span>
                <span>Requisito</span>
                <span>Telas e estados</span>
                <span>Critérios</span>
                <span>Cobertura</span>
              </div>
              {(vm.rf ?? []).map((r: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '78px 2.2fr 1.6fr 1fr 1.5fr',
                      gap: '10px',
                      padding: '9px 16px',
                      borderTop: '1px solid #EEEEF3',
                      fontSize: '13px',
                      lineHeight: '1.45',
                      alignItems: 'start',
                    }}
                  >
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: '600' }}>{r?.id}</span>
                    <span>{r?.d}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: '#5B21B6' }}>
                      {r?.t}
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px' }}>{r?.ca}</span>
                    <span>
                      <span
                        style={
                          {
                            fontSize: '12px',
                            fontWeight: '700',
                            padding: '3px 7px',
                            borderRadius: '6px',
                            background: `${r?.bg ?? ''}`,
                            color: `${r?.fg ?? ''}`,
                          } as CSSProperties
                        }
                      >
                        {r?.s}
                      </span>
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          <h3 style={{ margin: '24px 0 10px', fontSize: '20px', fontWeight: '800' }}>Critérios de aceite</h3>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px', overflowX: 'auto' }}>
            <div style={{ minWidth: '860px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '78px 2.4fr 1.5fr 1.5fr',
                  gap: '10px',
                  padding: '10px 16px',
                  background: '#F7F7FA',
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  color: '#5B5B6E',
                }}
              >
                <span>CA</span>
                <span>Critério</span>
                <span>Onde demonstrar</span>
                <span>Cobertura</span>
              </div>
              {(vm.ca ?? []).map((r: Loose, $index: number) => (
                <Fragment key={$index}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '78px 2.4fr 1.5fr 1.5fr',
                      gap: '10px',
                      padding: '9px 16px',
                      borderTop: '1px solid #EEEEF3',
                      fontSize: '13px',
                      lineHeight: '1.45',
                      alignItems: 'start',
                    }}
                  >
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: '600' }}>{r?.id}</span>
                    <span>{r?.d}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: '#5B21B6' }}>
                      {r?.t}
                    </span>
                    <span>
                      <span
                        style={
                          {
                            fontSize: '12px',
                            fontWeight: '700',
                            padding: '3px 7px',
                            borderRadius: '6px',
                            background: `${r?.bg ?? ''}`,
                            color: `${r?.fg ?? ''}`,
                          } as CSSProperties
                        }
                      >
                        {r?.s}
                      </span>
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
        <section id="premissas">
          <h2 style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Premissas pendentes
          </h2>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px' }}>
            {(vm.premises ?? []).map((p: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(160px,1fr) 2fr',
                    gap: '14px',
                    padding: '12px 16px',
                    borderTop: '1px solid #EEEEF3',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }}
                >
                  <b>{p?.k}</b>
                  <span style={{ color: '#3F3F50' }}>{p?.v}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="conflitos">
          <h2 style={{ margin: '0 0 6px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Divergências entre documentação e orçamento
          </h2>
          <p style={{ margin: '0 0 14px', color: '#5B5B6E', fontSize: '15px', lineHeight: '1.5' }}>
            Registradas sem resolução comercial. O design segue os requisitos da documentação de desenvolvimento; o
            contrato e os anexos originais prevalecem.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
              gap: '12px',
              alignItems: 'start',
            }}
          >
            {(vm.conflicts ?? []).map((c: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #E4E4EC',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <b style={{ fontSize: '16px' }}>{c?.t}</b>
                  <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>DOCUMENTAÇÃO</span>
                    <br />
                    {c?.doc}
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#5B5B6E' }}>ORÇAMENTO</span>
                    <br />
                    {c?.orc}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      lineHeight: '1.5',
                      background: '#F7F7FA',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      color: '#3F3F50',
                    }}
                  >
                    {c?.impact}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="conferencia">
          <h2 style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Conferência da entrega
          </h2>
          <div style={{ background: '#fff', border: '1px solid #E4E4EC', borderRadius: '14px' }}>
            {(vm.checks ?? []).map((c: Loose, $index: number) => (
              <Fragment key={$index}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1.6fr 1.4fr',
                    gap: '12px',
                    padding: '11px 16px',
                    borderTop: '1px solid #EEEEF3',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    alignItems: 'start',
                  }}
                >
                  <span
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      background: '#DCFCE7',
                      color: '#14532D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '900',
                      fontSize: '13px',
                    }}
                  >
                    ✓
                  </span>
                  <b>{c?.k}</b>
                  <span style={{ color: '#3F3F50' }}>{c?.v}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section id="futuro">
          <h2 style={{ margin: '0 0 6px', fontSize: '28px', fontWeight: '900', fontStretch: '108%' }}>
            Sugestões futuras (fora do escopo)
          </h2>
          <p style={{ margin: '0 0 14px', color: '#5B5B6E', fontSize: '15px' }}>
            Registradas separadamente. Nenhuma foi incorporada aos fluxos. Cada uma exigiria o fluxo de mudança da
            Cláusula 8ª.
          </p>
          <ul
            style={{
              margin: '0',
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '15px',
              lineHeight: '1.5',
              color: '#3F3F50',
            }}
          >
            {(vm.future ?? []).map((f: Loose, $index: number) => (
              <Fragment key={$index}>
                <li>{f}</li>
              </Fragment>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
