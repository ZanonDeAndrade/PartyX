import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

/**
 * E-mail transacional. A **composição** (assunto, texto, HTML) é do módulo `mail/` e a **entrega** é de um `EmailSender`.
 * Nenhuma implementação **afirma** que enviou sem ter entregue ao provedor: sem provedor configurado (homologação e produção
 * até o cliente definir provedor, domínio e remetente, D-09), o envio falha de forma explícita, o item fica na fila
 * (`email_log`) e o alerta dispara.
 */
export type EmailTemplate = 'cadastro' | 'recuperacao_senha' | 'compra_confirmada' | 'pagamento_sem_estoque';

/** O que a mensagem significa: modelo, destinatário e os dados usados para compor. */
export interface EmailMessage {
  template: EmailTemplate;
  to: string;
  data: Record<string, string>;
}

/** Mensagem pronta para entregar. */
export interface OutgoingEmail extends EmailMessage {
  subject: string;
  text: string;
  html: string;
  /** Identificador estável da mensagem (derivado da chave de idempotência): o mesmo envio repetido leva o mesmo id. */
  messageId: string;
}

export interface EmailSender {
  send(message: OutgoingEmail): Promise<void>;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('provedor de e-mail não configurado');
    this.name = 'EmailNotConfiguredError';
  }
}

/** Padrão de homologação e produção até haver provedor: falha de forma explícita. */
export const unconfiguredEmailSender: EmailSender = {
  send: async () => {
    throw new EmailNotConfiguredError();
  },
};

/** Remove quebras de linha de valores que vão para cabeçalhos (assunto, destinatário): evita injeção de cabeçalho. */
export const headerSafe = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

/**
 * Entrega por SMTP (`SMTP_URL`, ex.: `smtps://usuario:senha@host:465`). SMTP é aceito por todos os provedores comuns, então o
 * adaptador não escolhe provedor pelo cliente. A URL é segredo (Secret Manager) e nunca vai para log.
 */
export function smtpEmailSender(options: { url: string; from: string; replyTo?: string }): EmailSender {
  const smtp: SMTPTransport.Options = {
    url: options.url,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
  const transport = nodemailer.createTransport(smtp);
  return {
    async send(m) {
      await transport.sendMail({
        from: options.from,
        replyTo: options.replyTo,
        to: headerSafe(m.to),
        subject: headerSafe(m.subject),
        text: m.text,
        html: m.html,
        messageId: m.messageId,
        headers: { 'Auto-Submitted': 'auto-generated', 'X-PartyX-Template': m.template },
      });
    },
  };
}

/**
 * Captura local, **só para desenvolvimento**: grava em disco e não envia nada a ninguém. Os dados são fictícios. Serve para
 * ver o e-mail e seguir o link (por exemplo, o de recuperação de senha) sem provedor.
 */
export class LocalCaptureEmailSender implements EmailSender {
  readonly captured: OutgoingEmail[] = [];
  private readonly dir: string | null;
  constructor(dir: string | null) {
    this.dir = dir;
  }
  async send(message: OutgoingEmail) {
    this.captured.push(message);
    if (this.dir) {
      await mkdir(this.dir, { recursive: true });
      const base = `${Date.now()}-${message.template}`;
      await writeFile(path.join(this.dir, `${base}.html`), message.html);
      await writeFile(
        path.join(this.dir, `${base}.txt`),
        `Para: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}`,
      );
    }
  }
  last(template?: EmailTemplate, to?: string) {
    return [...this.captured].reverse().find(m => (!template || m.template === template) && (!to || m.to === to));
  }
}

/** Captura em memória, para testes. Dados fictícios. */
export class MemoryEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];
  async send(message: OutgoingEmail) {
    this.sent.push(message);
  }
  last(template?: EmailTemplate) {
    return [...this.sent].reverse().find(m => !template || m.template === template);
  }
}
