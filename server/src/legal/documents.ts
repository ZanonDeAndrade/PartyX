import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config';

/**
 * Textos legais e regras de meia-entrada (RF-68, D-06, D-11). **A PartyX (controladora) fornece os textos; a CONTRATADA não
 * redige obrigações legais em nome dela.** Os textos ficam em arquivos de uma pasta (`LEGAL_CONTENT_DIR`), um por documento,
 * em texto simples, fora do Git e fora do código. Parágrafos separados por linha em branco; uma linha que começa com `# ` é
 * título de seção. O texto nunca é tratado como HTML.
 *
 * - Arquivo presente: exibido como **oficial**, com a versão configurada.
 * - Arquivo ausente fora de produção: aviso identificado como **homologação**, sem texto jurídico algum.
 * - Arquivo ausente em produção: **pendente**; cadastro e vendas ficam bloqueados (ver `salesBlockers`).
 */
export const LEGAL_KINDS = [
  'termos-de-uso',
  'privacidade',
  'cancelamento',
  'meia-entrada',
  'termo-menor',
  'autorizacao-menor',
] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const LEGAL_TITLES: Record<LegalKind, string> = {
  'termos-de-uso': 'Termos de Uso',
  privacidade: 'Política de Privacidade',
  cancelamento: 'Política de Cancelamento, Troca e Reembolso',
  'meia-entrada': 'Regras de meia-entrada',
  'termo-menor': 'Termo de Ciência para Menores de Idade',
  'autorizacao-menor': 'Termo de Autorização e Responsabilidade',
};

/** Obrigatórios para vender de verdade. A meia-entrada só se aplica se o cliente oferecer esse tipo de ingresso (D-06). */
const REQUIRED: LegalKind[] = ['termos-de-uso', 'privacidade', 'cancelamento'];
/**
 * Obrigatórios para abrir o cadastro: os dois que a pessoa aceita no cadastro (RF-03). A Política de Cancelamento é exigida só para
 * vender (`salesBlockers`), por decisão do responsável em 14/10/2026 (D-84).
 */
const SIGNUP_REQUIRED: LegalKind[] = ['termos-de-uso', 'privacidade'];
const MAX_BYTES = 200_000;

export interface LegalDocument {
  kind: LegalKind;
  title: string;
  /** `oficial`: texto da PartyX. `homologacao`: ainda não há texto, só um aviso. `pendente`: produção sem texto. */
  status: 'oficial' | 'homologacao' | 'pendente';
  version: string | null;
  /** Data em que a versão passou a valer (AAAA-MM-DD), quando a PartyX a informou. */
  effectiveDate: string | null;
  blocks: { type: 'heading' | 'paragraph'; text: string }[];
}

type LegalConfig = Pick<
  Config,
  | 'APP_ENV'
  | 'legal'
  | 'legalContentDir'
  | 'cancellationVersion'
  | 'minorTermVersion'
  | 'minorAuthorizationVersion'
  | 'legalDates'
>;

export const isLegalKind = (v: string): v is LegalKind => (LEGAL_KINDS as readonly string[]).includes(v);

function versionOf(config: LegalConfig, kind: LegalKind): string | null {
  if (kind === 'termos-de-uso') return config.legal.terms || null;
  if (kind === 'privacidade') return config.legal.privacy || null;
  if (kind === 'cancelamento')
    return config.cancellationVersion ?? (config.APP_ENV === 'producao' ? null : 'ficticio-0');
  if (kind === 'termo-menor') return config.minorTermVersion ?? (config.APP_ENV === 'producao' ? null : 'ficticio-0');
  if (kind === 'autorizacao-menor')
    return config.minorAuthorizationVersion ?? (config.APP_ENV === 'producao' ? null : 'ficticio-0');
  return null;
}

function dateOf(config: LegalConfig, kind: LegalKind): string | null {
  if (kind === 'termos-de-uso') return config.legalDates.terms;
  if (kind === 'privacidade') return config.legalDates.privacy;
  if (kind === 'cancelamento') return config.legalDates.cancellation;
  if (kind === 'termo-menor') return config.legalDates.minorTerm;
  if (kind === 'autorizacao-menor') return config.legalDates.minorAuthorization;
  return null;
}

function filePath(config: LegalConfig, kind: LegalKind): string | null {
  return config.legalContentDir ? join(config.legalContentDir, `${kind}.txt`) : null;
}

function hasFile(config: LegalConfig, kind: LegalKind): boolean {
  const file = filePath(config, kind);
  try {
    return Boolean(file && existsSync(file) && statSync(file).size > 0 && statSync(file).size <= MAX_BYTES);
  } catch {
    return false;
  }
}

export function parseBlocks(text: string): LegalDocument['blocks'] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part =>
      part.startsWith('# ')
        ? { type: 'heading' as const, text: part.slice(2).trim() }
        : { type: 'paragraph' as const, text: part },
    );
}

export function legalDocument(config: LegalConfig, kind: LegalKind): LegalDocument {
  const title = LEGAL_TITLES[kind];
  const version = versionOf(config, kind);
  if (hasFile(config, kind)) {
    const text = readFileSync(filePath(config, kind)!, 'utf8');
    return { kind, title, status: 'oficial', version, effectiveDate: dateOf(config, kind), blocks: parseBlocks(text) };
  }
  if (config.APP_ENV === 'producao')
    return { kind, title, status: 'pendente', version: null, effectiveDate: null, blocks: [] };
  return {
    kind,
    title,
    status: 'homologacao',
    version,
    effectiveDate: null,
    blocks: [
      {
        type: 'paragraph',
        text: 'AMBIENTE DE HOMOLOGAÇÃO. Este documento ainda não foi fornecido pela PartyX e não há texto com valor jurídico aqui. Nada nesta página deve ser lido como regra, termo ou política.',
      },
    ],
  };
}

/**
 * O que ainda impede a venda real em produção. Vazio fora de produção. Cada item é uma pendência do cliente
 * (registro de decisões D-10 e D-11): textos legais e aprovação visual por escrito.
 */
export function salesBlockers(config: LegalConfig & Pick<Config, 'visualApproved'>): string[] {
  if (config.APP_ENV !== 'producao') return [];
  const out: string[] = [];
  if (!config.legal.ready) out.push('versões dos Termos e da Privacidade não informadas');
  for (const kind of REQUIRED) if (!hasFile(config, kind)) out.push(`texto legal ausente: ${LEGAL_TITLES[kind]}`);
  if (!versionOf(config, 'cancelamento')) out.push('versão da Política de Cancelamento, Troca e Reembolso não informada');
  for (const kind of REQUIRED)
    if (!dateOf(config, kind)) out.push(`data de vigência não informada: ${LEGAL_TITLES[kind]}`);
  if (!config.visualApproved) out.push('identidade visual sem aprovação escrita do cliente');
  return out;
}

/**
 * O que impede o cadastro de compradores (RF-03, D-11, D-84). Vale em qualquer ambiente o `SIGNUP_OPEN=false`. Em produção, além da flag
 * (fechada por padrão), os Termos de Uso e a Política de Privacidade precisam estar **publicados**: arquivo oficial, versão e data de
 * vigência. Sem isso não há o que aceitar, e o cadastro real continua bloqueado. A Política de Cancelamento não entra aqui: é exigida só
 * para vender. Fora de produção, a falta do texto só gera o aviso de homologação.
 */
export function signupBlockers(config: LegalConfig & Pick<Config, 'signupOpen'>): string[] {
  const out: string[] = [];
  if (!config.signupOpen) out.push('cadastro fechado por configuração (SIGNUP_OPEN)');
  if (config.APP_ENV !== 'producao') return out;
  for (const kind of SIGNUP_REQUIRED) {
    if (!hasFile(config, kind)) out.push(`texto legal ausente: ${LEGAL_TITLES[kind]}`);
    if (!versionOf(config, kind)) out.push(`versão não informada: ${LEGAL_TITLES[kind]}`);
    if (!dateOf(config, kind)) out.push(`data de vigência não informada: ${LEGAL_TITLES[kind]}`);
  }
  return out;
}

/** Fora de produção: algum dos documentos aceitos no cadastro (Termos, Privacidade) ainda não tem o texto oficial. */
export function signupTextsProvisional(config: LegalConfig): boolean {
  if (config.APP_ENV === 'producao') return false;
  return (['termos-de-uso', 'privacidade'] as const).some(kind => !hasFile(config, kind));
}

/**
 * Textos de menores (0009) publicados: o termo aceito no checkout e o texto da autorização em PDF. Em produção exige arquivo, versão e
 * data de cada um; fora de produção, só o arquivo (sem ele, a compra de menor mostra o aviso de homologação no lugar do termo).
 * Vazio = pode vender a menor e gerar a autorização.
 */
export function minorDocsBlockers(config: LegalConfig): string[] {
  const out: string[] = [];
  for (const kind of ['termo-menor', 'autorizacao-menor'] as const) {
    if (!hasFile(config, kind)) {
      if (config.APP_ENV === 'producao') out.push(`texto legal ausente: ${LEGAL_TITLES[kind]}`);
      continue;
    }
    if (!versionOf(config, kind)) out.push(`versão não informada: ${LEGAL_TITLES[kind]}`);
    if (config.APP_ENV === 'producao' && !dateOf(config, kind))
      out.push(`data de vigência não informada: ${LEGAL_TITLES[kind]}`);
  }
  return out;
}

/** Versão vigente de um texto (a mesma que a página mostra), ou `null`. */
export const legalVersion = (config: LegalConfig, kind: LegalKind): string | null => versionOf(config, kind);
