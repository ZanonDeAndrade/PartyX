import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Caixa de captura da HOMOLOGAÇÃO (Ethereal): o SMTP do serviço entrega tudo nela, para qualquer destinatário. A mesma conta do
 * segredo `smtp-url` lê por IMAP. A URL vem de E2E_SMTP_URL (lida do Secret Manager pelo roteiro-hml.sh) e nunca é impressa.
 */
export interface Mail {
  subject: string;
  html: string;
  text: string;
}

function imapConfig() {
  const raw = process.env.E2E_SMTP_URL;
  if (!raw) throw new Error('E2E_SMTP_URL ausente: a homologação precisa da caixa de captura para os itens de e-mail');
  const u = new URL(raw);
  if (u.hostname !== 'smtp.ethereal.email') throw new Error('recusado: a leitura de e-mail do roteiro só usa a caixa de captura (Ethereal)');
  return {
    host: 'imap.ethereal.email',
    port: 993,
    secure: true,
    auth: { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) },
    logger: false as const,
  };
}

/** Espera (até `timeoutMs`) a mensagem mais recente para `to` cujo assunto casa com `subject`, enviada depois de `since`. */
export async function waitForMail(to: string, subject: RegExp, since: Date, timeoutMs = 90_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const client = new ImapFlow(imapConfig());
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        // A busca do IMAP é por dia; o filtro fino de horário é feito na data do cabeçalho.
        const uids = (await client.search({ to, since: new Date(since.getTime() - 86_400_000) }, { uid: true })) || [];
        for (const uid of [...uids].reverse()) {
          const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
          if (!msg || !msg.source || !msg.envelope) continue;
          if (!subject.test(msg.envelope.subject ?? '')) continue;
          if (msg.envelope.date && new Date(msg.envelope.date).getTime() < since.getTime() - 60_000) continue;
          const parsed = await simpleParser(msg.source);
          return { subject: parsed.subject ?? '', html: typeof parsed.html === 'string' ? parsed.html : '', text: parsed.text ?? '' };
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`e-mail "${subject.source}" para ${to} não chegou à caixa de captura em ${timeoutMs / 1000} s`);
}

/** Links do HTML do e-mail que começam pela base pública. */
export const mailLinks = (mail: Mail, base: string) =>
  [...mail.html.matchAll(/href="([^"]+)"/g)].map(m => m[1]!.replace(/&amp;/g, '&')).filter(h => h.startsWith(base));
