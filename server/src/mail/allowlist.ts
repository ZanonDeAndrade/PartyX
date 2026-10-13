/**
 * Lista de destinatários permitidos em HOMOLOGAÇÃO (`EMAIL_ALLOWLIST`). Com entrega real ligada, só quem está na lista recebe; o
 * resto fica registrado no `email_log` como não enviado, sem erro para quem usa a tela. Em produção a lista não existe: o servidor
 * recusa subir com a variável definida (`config.ts`).
 *
 * Formato: itens separados por vírgula; cada item é um endereço exato (`pessoa@example.com`) ou um domínio inteiro (`*@example.com`).
 * A comparação ignora maiúsculas e espaços. Subdomínio não vale pelo domínio pai: o item de um domínio não libera os subdomínios dele.
 */
const ADDRESS = /^[^\s<>@,*]+@[^\s<>@,*]+\.[^\s<>@,*]+$/;
const DOMAIN = /^\*@[^\s<>@,*]+\.[^\s<>@,*]+$/;

/** Motivo gravado em `email_log.last_error`. Não começa com `nao_aplicavel:`: o administrador pode reabrir depois de ajustar a lista. */
export const NOT_ALLOWED_REASON = 'nao_enviado:fora_da_lista_de_homologacao';
/** Texto para quem lê a lista de e-mails no painel. */
export const NOT_ALLOWED_NOTE = 'não enviado (fora da lista de homologação)';

/** Itens inválidos da lista, pela posição (1, 2, ...). Vazio quando a lista é válida. Lista sem nenhum item também é inválida. */
export function invalidAllowlistItems(raw: string): number[] {
  const items = raw.split(',').map(s => s.trim());
  if (items.every(s => s === '')) return [1];
  return items.flatMap((s, i) => (ADDRESS.test(s) || DOMAIN.test(s) ? [] : [i + 1]));
}

export function parseEmailAllowlist(raw: string): string[] {
  const bad = invalidAllowlistItems(raw);
  if (bad.length > 0) throw new Error(`EMAIL_ALLOWLIST: item ${bad.join(', ')} inválido`);
  return raw.split(',').map(s => s.trim().toLowerCase());
}

/** `to` pode vir como `Nome <endereco@dominio>` ou só o endereço. Sem lista (nula), todo mundo recebe. */
export function isRecipientAllowed(list: readonly string[] | null | undefined, to: string): boolean {
  if (!list) return true;
  const address = (/<([^<>]+)>\s*$/.exec(to)?.[1] ?? to).trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return false;
  return list.includes(address) || list.includes(`*${address.slice(at)}`);
}
