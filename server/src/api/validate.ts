import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { AppError } from '../domain/errors';

/**
 * Valida o corpo JSON no servidor. A validação da interface é conveniência; esta é a que vale.
 * Devolve só o caminho do campo e a mensagem, nunca o valor recebido.
 */
export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, 'corpo_invalido', 'O corpo da requisição precisa ser um JSON válido.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      422,
      'dados_invalidos',
      'Alguns campos precisam de ajuste.',
      result.error.issues.map(i => ({ campo: i.path.join('.'), mensagem: i.message })),
    );
  }
  return result.data;
}
