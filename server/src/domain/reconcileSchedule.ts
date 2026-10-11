/**
 * Cadência da conciliação sob demanda (RF-35, RF-37, CA-18). Função pura, sem relógio nem banco.
 *
 * Cada pedido com cobrança criada recebe verificações próprias no Cloud Tasks, contadas **da criação da cobrança**: por padrão aos
 * 1, 2, 4 e 8 minutos (`RECONCILE_TASK_OFFSETS_SECONDS`). Nenhuma passa do **fim da reserva mais a margem**
 * (`RECONCILE_TASK_MARGIN_SECONDS`): a última verificação roda exatamente nesse limite, para pegar a aprovação que chega junto com o
 * vencimento. Depois disso, quem continua olhando é a varredura do Cloud Scheduler (a cada 5 minutos, pedidos de até 24 horas).
 *
 * As tentativas são numeradas de 1 a `offsets.length + 1`; a última é sempre a do limite.
 */
export interface CheckPlan {
  attempt: number;
  at: Date;
}

export const finalAttempt = (offsets: readonly number[]) => offsets.length + 1;

export function nextCheck(
  input: { attempt: number; chargedAt: Date; deadline: Date; now: Date },
  offsets: readonly number[],
): CheckPlan | null {
  const last = finalAttempt(offsets);
  if (input.attempt >= last) return null;
  const next = input.attempt + 1;
  if (next < last) {
    const at = new Date(input.chargedAt.getTime() + offsets[next - 1]! * 1000);
    if (at < input.deadline) return { attempt: next, at };
  }
  // A próxima espera da lista passaria do limite (ou a lista acabou): resta a verificação no limite, se ele ainda não passou.
  if (input.deadline > input.now) return { attempt: last, at: input.deadline };
  return null;
}

/** Espera em segundos até `at`, nunca negativa (tarefa atrasada roda já). */
export const delayUntil = (at: Date, now: Date) => Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000));
