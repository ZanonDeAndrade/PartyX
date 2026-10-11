export const B = {
  ok: ['#DCFCE7', '#14532D'],
  warn: ['#FEF3C7', '#854D0E'],
  err: ['#FEE2E2', '#991B1B'],
  info: ['#EDE9FE', '#5B21B6'],
  neu: ['#EEEEF3', '#3F3F50'],
  ref: ['#E0E7FF', '#3730A3'],
  con: ['#FFE4E6', '#9F1239'],
  dark: ['#E4E4EC', '#0B0B10'],
};
export const bd = (label, k) => ({ label, bg: B[k][0], fg: B[k][1] });
export const OST = {
  pendente: ['Aguardando pagamento', 'warn'],
  pago: ['Pago', 'ok'],
  expirado: ['Expirado', 'neu'],
  nao_concluido: ['Não concluído', 'err'],
  estornado: ['Estornado', 'ref'],
  contestado: ['Contestado', 'con'],
  pago_sem_estoque: ['Pago sem estoque', 'err'],
};
export const PST = {
  pendente: ['Aguardando', 'warn'],
  pago: ['Aprovado', 'ok'],
  expirado: ['Expirado', 'neu'],
  nao_concluido: ['Recusado', 'err'],
  estornado: ['Estornado', 'ref'],
  contestado: ['Contestado', 'con'],
  pago_sem_estoque: ['Aprovado', 'ok'],
};
export const KST = { valido: ['Válido', 'ok'], utilizado: ['Utilizado', 'neu'], cancelado: ['Cancelado', 'err'] };
export const EST = { rascunho: ['Rascunho', 'neu'], publicado: ['Publicado', 'ok'], encerrado: ['Encerrado', 'dark'] };
export const ob = o => bd(OST[o.status][0], OST[o.status][1]);
export const pb = o => bd(PST[o.status][0], PST[o.status][1]);
export const kb = k => bd(KST[k.status][0], KST[k.status][1]);
export const eb = e => bd(EST[e.status][0], EST[e.status][1]);
