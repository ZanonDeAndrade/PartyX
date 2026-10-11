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
export const LEGAL_KINDS = ['termos-de-uso', 'privacidade', 'cancelamento', 'meia-entrada'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const LEGAL_TITLES: Record<LegalKind, string> = {
  'termos-de-uso': 'Termos de Uso',
  privacidade: 'Política de Privacidade',
  cancelamento: 'Política de Cancelamento',
  'meia-entrada': 'Regras de meia-entrada',
};

/** Obrigatórios para vender de verdade. A meia-entrada só se aplica se o cliente oferecer esse tipo de ingresso (D-06). */
const REQUIRED: LegalKind[] = ['termos-de-uso', 'privacidade', 'cancelamento'];
const MAX_BYTES = 200_000;

export interface LegalDocument {
  kind: LegalKind;
  title: string;
  /** `oficial`: texto da PartyX. `homologacao`: ainda não há texto, só um aviso. `pendente`: produção sem texto. */
  status: 'oficial' | 'homologacao' | 'pendente';
  version: string | null;
  blocks: { type: 'heading' | 'paragraph'; text: string }[];
}

type LegalConfig = Pick<Config, 'APP_ENV' | 'legal' | 'legalContentDir' | 'cancellationVersion'>;

export const isLegalKind = (v: string): v is LegalKind => (LEGAL_KINDS as readonly string[]).includes(v);

function versionOf(config: LegalConfig, kind: LegalKind): string | null {
  if (kind === 'termos-de-uso') return config.legal.terms || null;
  if (kind === 'privacidade') return config.legal.privacy || null;
  if (kind === 'cancelamento')
    return config.cancellationVersion ?? (config.APP_ENV === 'producao' ? null : 'ficticio-0');
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
    return { kind, title, status: 'oficial', version, blocks: parseBlocks(text) };
  }
  if (config.APP_ENV === 'producao') return { kind, title, status: 'pendente', version: null, blocks: [] };
  return {
    kind,
    title,
    status: 'homologacao',
    version,
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
  if (!versionOf(config, 'cancelamento')) out.push('versão da Política de Cancelamento não informada');
  if (!config.visualApproved) out.push('identidade visual sem aprovação escrita do cliente');
  return out;
}
