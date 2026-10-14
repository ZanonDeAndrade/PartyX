import { eq } from 'drizzle-orm';
import { consentPending } from '../auth/consent';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { Tx } from '../db/audit';
import { users } from '../db/schema';
import { purchaseAge } from '../domain/age';
import { AppError } from '../domain/errors';
import { legalVersion, minorDocsBlockers } from '../legal/documents';
import { logger } from '../logger';

export type BuyerConfig = Pick<
  Config,
  | 'APP_ENV'
  | 'legal'
  | 'legalContentDir'
  | 'cancellationVersion'
  | 'minorTermVersion'
  | 'minorAuthorizationVersion'
  | 'legalDates'
>;

export type BuyerRefusal = 'aceite_pendente' | 'data_nascimento_obrigatoria' | 'idade_minima' | 'evento_para_maiores';

/**
 * O que o comprador precisa antes de comprar para um evento (regras de menores, 14/10/2026). A mesma conta serve ao resumo (para a tela
 * pedir o que falta) e à criação do pedido (que recusa). Idade = anos completos na DATA DO EVENTO (`domain/age.ts`).
 */
export interface BuyerCheck {
  /** Termos ou Privacidade com versão nova ainda não aceita. */
  consentPending: boolean;
  /** Conta anterior à 0009, sem data de nascimento: a tela pede a data antes de continuar. */
  birthDateMissing: boolean;
  age: number | null;
  /** 16 ou 17 anos na data do evento: precisa aceitar o termo de menor. */
  minor: boolean;
  /** Versão do termo de menor que a pessoa aceita. Só quando `minor`. */
  minorTermVersion: string | null;
  refusal: { code: BuyerRefusal; message: string } | null;
}

const MESSAGES: Record<BuyerRefusal, string> = {
  aceite_pendente:
    'Os Termos de Uso e a Política de Privacidade foram atualizados. Aceite a nova versão para continuar.',
  data_nascimento_obrigatoria: 'Informe sua data de nascimento para continuar.',
  idade_minima: 'A compra é permitida a partir de 16 anos completos na data do evento.',
  evento_para_maiores: 'Este evento é só para quem tiver 18 anos ou mais na data do evento.',
};

export async function checkBuyer(
  db: Db | Tx,
  config: BuyerConfig,
  userId: string,
  event: { startsAt: Date; allowsMinors: boolean },
): Promise<BuyerCheck> {
  const [user] = await db
    .select({ id: users.id, role: users.role, birthDate: users.birthDate })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError(401, 'nao_autenticado', 'Entre na sua conta para continuar.');
  const out: BuyerCheck = {
    consentPending: await consentPending(db, config, user),
    birthDateMissing: !user.birthDate,
    age: null,
    minor: false,
    minorTermVersion: null,
    refusal: null,
  };
  const refuse = (code: BuyerRefusal) => ({ ...out, refusal: { code, message: MESSAGES[code] } });
  if (out.consentPending) return refuse('aceite_pendente');
  if (!user.birthDate) return refuse('data_nascimento_obrigatoria');
  const rule = purchaseAge(user.birthDate, event);
  out.age = rule.age;
  if (!rule.ok) return refuse(rule.reason === 'menor_de_16' ? 'idade_minima' : 'evento_para_maiores');
  out.minor = rule.minor;
  if (rule.minor) out.minorTermVersion = legalVersion(config, 'termo-menor');
  return out;
}

/**
 * Recusa o pedido se faltar algo (com o código para a tela saber o que pedir). Para menor: os textos de menores publicados e o aceite do
 * termo na versão vigente, com a caixa marcada pela pessoa.
 */
export function assertBuyerMayPurchase(
  check: BuyerCheck,
  config: BuyerConfig,
  input: { minorTermAccepted?: boolean; minorTermVersion?: string | null },
) {
  if (check.refusal) {
    const status = check.refusal.code === 'idade_minima' || check.refusal.code === 'evento_para_maiores' ? 403 : 409;
    throw new AppError(status, check.refusal.code, check.refusal.message);
  }
  if (!check.minor) return;
  const blockers = minorDocsBlockers(config);
  if (blockers.length || !check.minorTermVersion) {
    logger.warn('compra de menor bloqueada por texto ausente', { blockers });
    throw new AppError(503, 'termo_menor_indisponivel', 'A compra por menores de idade está indisponível no momento.');
  }
  if (!input.minorTermAccepted) {
    throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
      {
        campo: 'minorTermAccepted',
        mensagem: 'Para continuar, leia e aceite o Termo de Ciência para Menores de Idade.',
      },
    ]);
  }
  if (input.minorTermVersion !== check.minorTermVersion) {
    throw new AppError(
      409,
      'versao_desatualizada',
      'O Termo de Ciência para Menores de Idade foi atualizado. Leia e aceite novamente.',
    );
  }
}
