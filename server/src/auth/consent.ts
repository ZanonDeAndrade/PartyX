import { and, desc, eq } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { Tx } from '../db/audit';
import { consents } from '../db/schema';
import { AppError } from '../domain/errors';
import type { RequestMeta, Role } from './types';

type ConsentConfig = Pick<Config, 'legal'>;

/**
 * Novo aceite (14/10/2026): o comprador que aceitou uma versão anterior dos Termos de Uso ou da Política de Privacidade aceita a vigente
 * no próximo login ou checkout. Vale só para cliente e só quando há textos publicados. Conta sem nenhum aceite gravado não é tratada
 * como pendente: todo cadastro grava o aceite, então isso só acontece com equipe ou dados antigos de teste.
 */
export async function consentPending(
  db: Db | Tx,
  config: ConsentConfig,
  user: { id: string; role: Role },
): Promise<boolean> {
  if (user.role !== 'cliente' || !config.legal.ready) return false;
  const [last] = await db
    .select({ terms: consents.termsVersion, privacy: consents.privacyVersion })
    .from(consents)
    .where(eq(consents.userId, user.id))
    .orderBy(desc(consents.acceptedAt), desc(consents.id))
    .limit(1);
  return Boolean(last) && (last!.terms !== config.legal.terms || last!.privacy !== config.legal.privacy);
}

/** Grava o aceite das versões vigentes (mesmos dados do cadastro: versões, data, IP e navegador). */
export async function acceptCurrentTerms(
  deps: { db: Db; config: ConsentConfig; clock: { now(): Date } },
  user: { id: string; role: Role },
  input: { acceptedTermsVersion: string; acceptedPrivacyVersion: string; accept: boolean },
  meta: RequestMeta,
) {
  const { legal } = deps.config;
  if (user.role !== 'cliente' || !legal.ready)
    throw new AppError(409, 'aceite_indisponivel', 'Não há aceite pendente para esta conta.');
  if (!input.accept)
    throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
      { campo: 'accept', mensagem: 'Para continuar, aceite os Termos de Uso e a Política de Privacidade.' },
    ]);
  if (input.acceptedTermsVersion !== legal.terms || input.acceptedPrivacyVersion !== legal.privacy)
    throw new AppError(
      409,
      'versao_desatualizada',
      'Os Termos de Uso ou a Política de Privacidade foram atualizados. Leia e aceite novamente.',
    );
  // Aceite repetido da mesma versão não duplica a linha.
  const [same] = await deps.db
    .select({ id: consents.id })
    .from(consents)
    .where(
      and(
        eq(consents.userId, user.id),
        eq(consents.termsVersion, legal.terms),
        eq(consents.privacyVersion, legal.privacy),
      ),
    )
    .limit(1);
  if (same) return;
  await deps.db.insert(consents).values({
    userId: user.id,
    termsVersion: legal.terms,
    privacyVersion: legal.privacy,
    acceptedAt: deps.clock.now(),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 255) ?? null,
  });
}
