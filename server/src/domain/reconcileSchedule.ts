/**
 * Cadência da conciliação sob demanda (RF-35, RF-37, CA-18; seção 10.1). Função pura, sem relógio nem banco.
 *
 * Cada pedido com cobrança criada recebe verificações próprias no Cloud Tasks, todas contadas **da criação da cobrança**:
 *
 * 1. **Enquanto a reserva está ativa, a cada poucos minutos:** por padrão 1, 2, 4 e 8 min (`RECONCILE_TASK_OFFSETS_SECONDS`), só as
 *    que caem antes do limite (fim da reserva + `RECONCILE_TASK_MARGIN_SECONDS`).
 * 2. **No limite:** uma verificação exatamente no fim da reserva + margem, para a aprovação que chega junto com o vencimento.
 * 3. **Tardias, espaçadas por 24 h:** por padrão 15 min, 30 min, 1 h, 3 h, 8 h e 24 h (`RECONCILE_LATE_OFFSETS_SECONDS`), só as que
 *    caem depois do limite. Cobrem a aprovação tardia (emitir se houver estoque, senão "pago sem estoque") sem agenda fixa no
 *    Scheduler: sem pedido em aberto, nada roda e o banco pode dormir.
 *
 * As tentativas são numeradas em sequência: 1..N (iniciais), N+1 (limite), N+2..N+1+M (tardias).
 */
export interface CheckPlan {
  attempt: number;
  at: Date;
}

export interface CheckOffsets {
  early: readonly number[];
  late: readonly number[];
}

/** Número da verificação do limite (fim da reserva + margem). */
export const deadlineAttempt = (o: CheckOffsets) => o.early.length + 1;
/** Maior número de tentativa possível: a última tardia. */
export const finalAttempt = (o: CheckOffsets) => o.early.length + 1 + o.late.length;

/** Todas as verificações de uma cobrança, em ordem. */
export function checkPlan(chargedAt: Date, deadline: Date, o: CheckOffsets): CheckPlan[] {
  const at = (seconds: number) => new Date(chargedAt.getTime() + seconds * 1000);
  const plan: CheckPlan[] = [];
  o.early.forEach((s, i) => {
    if (at(s) < deadline) plan.push({ attempt: i + 1, at: at(s) });
  });
  plan.push({ attempt: deadlineAttempt(o), at: deadline });
  o.late.forEach((s, j) => {
    if (at(s) > deadline) plan.push({ attempt: deadlineAttempt(o) + 1 + j, at: at(s) });
  });
  return plan;
}

/**
 * Próxima verificação depois da tentativa `attempt` que ainda está no futuro. As que ficaram para trás (tarefa atrasada) são puladas:
 * a execução atual já conferiu o pagamento agora. Nula quando não há mais nenhuma.
 */
export function nextCheck(
  input: { attempt: number; chargedAt: Date; deadline: Date; now: Date },
  o: CheckOffsets,
): CheckPlan | null {
  return (
    checkPlan(input.chargedAt, input.deadline, o).find(p => p.attempt > input.attempt && p.at > input.now) ?? null
  );
}

/** Espera em segundos até `at`, nunca negativa (tarefa atrasada roda já). */
export const delayUntil = (at: Date, now: Date) => Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000));
