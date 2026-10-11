import { GoogleAuth } from 'google-auth-library';
import { logger } from '../logger';

/**
 * Fila de tarefas sob demanda (Cloud Tasks): conciliação de pagamento e reenvio de e-mail. Cada cobrança criada agenda verificações
 * próprias, contadas da criação da cobrança (padrão: 1, 2, 4 e 8 minutos, e a última no fim da reserva mais a margem; ver
 * `domain/reconcileSchedule.ts`). Depois disso, a varredura do Cloud Scheduler (a cada 5 minutos, pedidos de até 24 horas) continua.
 * O webhook do gateway segue sendo o caminho principal; isto é a rede de segurança para webhook perdido ou atrasado.
 */
export interface ReconcileTask {
  orderId: string;
  /** 1 a `offsets.length + 1` (a última é a do limite). */
  attempt: number;
  delaySeconds: number;
  /** Instante da criação da cobrança (ISO). Base das esperas. Ausente em tarefas antigas: usa-se a criação do pedido. */
  chargedAt?: string;
}

/** Reenvio de um e-mail que falhou. `attempt` é o número da retentativa (1 a 3). */
export interface EmailTask {
  emailId: string;
  attempt: number;
  delaySeconds: number;
}

export interface TaskQueue {
  /** Verificação de UM pedido (conciliação). */
  enqueue(task: ReconcileTask): Promise<void>;
  /** Reenvio de UM e-mail. */
  enqueueEmail(task: EmailTask): Promise<void>;
}

export const RECONCILE_TASK_PATH = '/api/internal/tasks/reconcile-order';
export const EMAIL_TASK_PATH = '/api/internal/tasks/send-email';

/** Fila em memória: testes e desenvolvimento local. Não executa nada sozinha. */
export class MemoryTaskQueue implements TaskQueue {
  readonly tasks: ReconcileTask[] = [];
  readonly emailTasks: EmailTask[] = [];
  failNext = false;
  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fila indisponível (simulado)');
    }
  }
  async enqueue(task: ReconcileTask) {
    this.maybeFail();
    this.tasks.push(task);
  }
  async enqueueEmail(task: EmailTask) {
    this.maybeFail();
    this.emailTasks.push(task);
  }
}

export interface CloudTasksConfig {
  /** `projects/<projeto>/locations/<região>/queues/<fila>` */
  queuePath: string;
  /** Endereço `run.app` do serviço (não o domínio próprio): é para onde a tarefa é entregue e o `audience` do token. */
  targetUrl: string;
  /** Host público esperado pelo filtro de entrada quando a tarefa chama o run.app diretamente. */
  publicHost: string;
  /** Conta de serviço em nome da qual o Cloud Tasks assina o token OIDC. */
  invokerEmail: string;
  /** Cliente HTTP autenticado. Padrão: credenciais da conta de serviço do Cloud Run. Injetável para verificação e testes. */
  client?: { request(options: { url: string; method: string; data: unknown }): Promise<unknown> };
}

/**
 * Cloud Tasks pela API REST, com as credenciais da própria conta de serviço do Cloud Run (sem chave em arquivo).
 * O nome da tarefa é determinístico (`reconcile-<pedido>-<tentativa>`): agendar duas vezes a mesma tentativa não duplica
 * (o Cloud Tasks responde 409 e isso é tratado como sucesso). Uma falha ao agendar **nunca** derruba a criação do pedido:
 * quem chama registra o alerta e a varredura agendada cobre a lacuna.
 */
export function cloudTasksQueue(cfg: CloudTasksConfig): TaskQueue {
  const auth = cfg.client ? undefined : new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const target = cfg.targetUrl.replace(/\/$/, '');
  /** Cria a tarefa. Nome determinístico: a mesma tarefa agendada duas vezes não duplica (o Cloud Tasks responde 409). */
  async function post(name: string, path: string, payload: unknown, delaySeconds: number) {
    const client = cfg.client ?? (await auth!.getClient());
    const body = Buffer.from(JSON.stringify(payload)).toString('base64');
    const scheduleTime = new Date(Date.now() + delaySeconds * 1000).toISOString();
    try {
      await client.request({
        url: `https://cloudtasks.googleapis.com/v2/${cfg.queuePath}/tasks`,
        method: 'POST',
        data: {
          task: {
            name: `${cfg.queuePath}/tasks/${name}`,
            scheduleTime,
            httpRequest: {
              url: `${target}${path}`,
              httpMethod: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': cfg.publicHost },
              body,
              oidcToken: { serviceAccountEmail: cfg.invokerEmail, audience: target },
            },
          },
        },
      });
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) return; // a mesma tarefa já está agendada
      throw error;
    }
  }
  return {
    enqueue: task =>
      post(
        `reconcile-${task.orderId}-${task.attempt}`,
        RECONCILE_TASK_PATH,
        { orderId: task.orderId, attempt: task.attempt, ...(task.chargedAt ? { chargedAt: task.chargedAt } : {}) },
        task.delaySeconds,
      ),
    enqueueEmail: task =>
      post(
        `email-${task.emailId}-${task.attempt}`,
        EMAIL_TASK_PATH,
        { emailId: task.emailId, attempt: task.attempt },
        task.delaySeconds,
      ),
  };
}

/** Agenda sem nunca lançar: falha vira alerta no log. */
export async function enqueueSafely(queue: TaskQueue | undefined, task: ReconcileTask): Promise<boolean> {
  if (!queue) return false;
  try {
    await queue.enqueue(task);
    return true;
  } catch (error) {
    logger.error('não foi possível agendar a conciliação do pedido', {
      orderId: task.orderId,
      attempt: task.attempt,
      error: error instanceof Error ? error.name : 'desconhecido',
      alert: 'fila_conciliacao_falhou',
    });
    return false;
  }
}

/** Agenda o reenvio de e-mail sem nunca lançar: falha vira alerta no log e a varredura diária cobre a lacuna. */
export async function enqueueEmailSafely(queue: TaskQueue | undefined, task: EmailTask): Promise<boolean> {
  if (!queue) return false;
  try {
    await queue.enqueueEmail(task);
    return true;
  } catch (error) {
    logger.error('não foi possível agendar o reenvio do e-mail', {
      emailId: task.emailId,
      attempt: task.attempt,
      error: error instanceof Error ? error.name : 'desconhecido',
      alert: 'fila_email_falhou',
    });
    return false;
  }
}
