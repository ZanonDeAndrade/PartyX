/**
 * Estado da verificação humana (Turnstile) nas telas de cadastro e recuperação de senha, e a regra do botão de envio.
 * - `carregando`: a tela ainda não sabe se o servidor exige o desafio (a chave vem de `/api/public/site`). Botão bloqueado.
 * - `desligado`: o servidor não exige (local, testes ou produção com o Turnstile desligado). Botão livre.
 * - `verificando`: o widget foi montado e o token ainda não chegou. Botão bloqueado, com "Verificando…".
 * - `pronto`: token recebido. Botão livre. O token vale uma vez: depois do envio a tela pede outro.
 * - `falhou`: o widget deu erro, o script não carregou ou o token não chegou em `HUMAN_TIMEOUT_MS`. Botão bloqueado e a tela
 *   mostra a mensagem com "Tentar de novo".
 */
export type HumanPhase = 'carregando' | 'desligado' | 'verificando' | 'pronto' | 'falhou';

export interface HumanState {
  /** O servidor vai exigir o token. */
  required: boolean;
  token: string | null;
  phase: HumanPhase;
}

export const HUMAN_INITIAL: HumanState = { required: true, token: null, phase: 'carregando' };

/** Prazo para o widget entregar o token antes de a tela oferecer "Tentar de novo". */
export const HUMAN_TIMEOUT_MS = 10_000;

export const HUMAN_FAILED_MESSAGE =
  'Não foi possível confirmar que você não é um robô. Confira a conexão com a internet e toque em "Tentar de novo".';

/** O botão de envio fica bloqueado até a verificação terminar; `checking` troca o texto do botão por "Verificando…". */
export function humanGate(s: HumanState): { blocked: boolean; checking: boolean } {
  if (s.phase === 'desligado') return { blocked: false, checking: false };
  if (s.phase === 'pronto') return { blocked: !s.token, checking: !s.token };
  return { blocked: true, checking: s.phase === 'verificando' };
}
