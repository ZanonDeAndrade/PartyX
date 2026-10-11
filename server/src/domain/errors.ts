/** Erro esperado, com status HTTP e código estável. A mensagem é segura para mostrar ao usuário. */
export type AppErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503;

export class AppError extends Error {
  readonly status: AppErrorStatus;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: AppErrorStatus, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
