import { Hono, type Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { authContext, requireUser } from '../auth/middleware';
import { createMemoryLimiter } from '../auth/limits';
import {
  changePassword,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  resetTokenState,
  updateProfile,
} from '../auth/service';
import { SESSION_COOKIE } from '../auth/sessions';
import { assertGlobalOpen, consumeGlobal, recordGlobal } from '../auth/globalLimits';
import type { AuthDeps, AuthState, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import { maskCpf } from '../domain/cpf';
import { checkoutRoutes } from './checkout';
import { emailAdminRoutes } from './emailAdmin';
import { exportRoutes } from './exports';
import { gateRoutes } from './gate';
import { eventsRoutes } from './events';
import { panelRoutes } from './panel';
import { paymentAdminRoutes } from './paymentAdmin';
import { reportRoutes } from './reports';
import { privacyRoutes } from './privacy';
import { teamRoutes } from './team';
import { ticketRoutes } from './tickets';
import { parseJson } from './validate';
import { signupBlockers, signupTextsProvisional } from '../legal/documents';

/** Dados do usuário que a interface pode ver. O CPF sai mascarado; o hash da senha nunca sai. */
function publicUser(user: AuthState['user']) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf ? maskCpf(user.cpf) : null,
    phone: user.phone,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

const text = z.string().max(500);
/** Token de uso único do Turnstile. Opcional no esquema: quem exige é `requireHuman`, só quando a verificação está configurada. */
const captcha = z.string().max(2100).optional();
const registerBody = z.object({
  name: text,
  email: text,
  cpf: text,
  phone: text,
  password: z.string().max(200),
  acceptedTermsVersion: text,
  acceptedPrivacyVersion: text,
  // O aceite precisa ser marcado de forma explícita; nunca vem pré-selecionado (CA-03).
  accept: z.boolean(),
  captchaToken: captcha,
});
const loginBody = z.object({ email: text, password: z.string().max(200) });
const forgotBody = z.object({ email: text, captchaToken: captcha });
const tokenBody = z.object({ token: z.string().min(10).max(200) });
const resetBody = z.object({ token: z.string().min(10).max(200), password: z.string().max(200) });
const profileBody = z.object({ name: text, phone: text });
const changePasswordBody = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) });

export function authRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const secure = deps.config.APP_ENV !== 'local';
  const now = () => deps.clock.now().getTime();
  // Camada rápida por IP e por instância; o teto global de cadastro fica no banco.
  const registerLimiter = createMemoryLimiter({ max: deps.config.SIGNUPS_PER_IP_PER_HOUR, windowMs: 3_600_000, now });
  const resetLimiter = createMemoryLimiter({ max: 60, windowMs: 3_600_000, now });
  const forgotLimiter = createMemoryLimiter({ max: 20, windowMs: 3_600_000, now });
  /**
   * Verificação humana ANTES dos limites por IP e de qualquer trabalho no banco. O token não é forjável, ao contrário do IP vindo
   * de um `X-Forwarded-For` quando o proxy não é confiável. Sem token: 422 sem chamar a Cloudflare (não gasta cota).
   */
  const requireHuman = async (token: string | undefined) => {
    if (!deps.human) return;
    if (!token)
      throw new AppError(422, 'verificacao_humana_obrigatoria', 'Confirme que você não é um robô para continuar.');
    const result = await deps.human.verify(token);
    if (result === 'invalid')
      throw new AppError(
        422,
        'verificacao_humana_invalida',
        'Não foi possível confirmar a verificação. Tente de novo.',
      );
    if (result === 'unavailable')
      throw new AppError(
        503,
        'verificacao_indisponivel',
        'A verificação está indisponível agora. Tente de novo em instantes.',
      );
  };
  const tooMany = () => new AppError(429, 'muitas_requisicoes', 'Muitas tentativas. Aguarde um pouco e tente de novo.');

  app.use('*', authContext(deps));

  const startSession = (c: Context, session: { token: string; expiresAt: Date }) => {
    setCookie(c, SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      expires: session.expiresAt,
    });
  };

  /**
   * Versões vigentes dos textos legais, para a tela de cadastro enviar o aceite correto e mostrar a versão e a data que a pessoa aceita.
   * `ready` falso: cadastro fechado (flag ou, em produção, textos não publicados). `provisional`: homologação sem o texto oficial.
   */
  app.get('/legal/versions', c =>
    c.json({
      terms: deps.config.legal.terms,
      privacy: deps.config.legal.privacy,
      termsDate: deps.config.legalDates.terms,
      privacyDate: deps.config.legalDates.privacy,
      ready: deps.config.legal.ready && signupBlockers(deps.config).length === 0,
      provisional: deps.config.legal.provisional || signupTextsProvisional(deps.config),
    }),
  );

  app.post('/auth/register', async c => {
    const meta = c.get('meta');
    const body = await parseJson(c, registerBody);
    await requireHuman(body.captchaToken);
    if (meta.ip && registerLimiter.hit(meta.ip)) throw tooMany();
    // Limite GLOBAL (no banco, sem depender de IP): confere antes e só conta depois de criar a conta.
    await assertGlobalOpen(deps, 'cadastro', deps.config.GLOBAL_SIGNUPS_PER_HOUR);
    if (!body.accept) {
      throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
        { campo: 'accept', mensagem: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.' },
      ]);
    }
    const { user, session } = await register(deps, body, meta);
    await recordGlobal(deps, 'cadastro');
    startSession(c, session);
    return c.json({ user: publicUser(user) }, 201);
  });

  app.post('/auth/login', async c => {
    const body = await parseJson(c, loginBody);
    const { user, session } = await login(deps, body, c.get('meta'));
    startSession(c, session);
    return c.json({ user: publicUser(user) });
  });

  app.post('/auth/logout', async c => {
    const auth = c.get('auth');
    if (auth) await logout(deps, auth.sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure });
    return c.body(null, 204);
  });

  /** Usuário atual e o token CSRF da sessão, que a interface envia em `X-CSRF-Token`. */
  app.get('/auth/me', c => {
    const auth = c.get('auth');
    if (!auth) throw new AppError(401, 'nao_autenticado', 'Entre na sua conta para continuar.');
    return c.json({ user: publicUser(auth.user), csrfToken: auth.csrfToken });
  });

  // Recuperação: a resposta é a mesma exista o e-mail ou não.
  app.post('/auth/password/forgot', async c => {
    const meta = c.get('meta');
    const body = await parseJson(c, forgotBody);
    await requireHuman(body.captchaToken);
    if (meta.ip && forgotLimiter.hit(meta.ip)) throw tooMany();
    // Limite GLOBAL de pedidos (atômico, no banco). O limite por CONTA (3 por hora) continua dentro de `requestPasswordReset`.
    await consumeGlobal(deps, 'recuperacao', deps.config.GLOBAL_RECOVERIES_PER_HOUR);
    await requestPasswordReset(deps, body.email);
    return c.json(
      { mensagem: 'Se houver uma conta com este e-mail, enviaremos um link para criar uma nova senha.' },
      202,
    );
  });

  app.post('/auth/password/check', async c => {
    const ip = c.get('meta').ip;
    if (ip && resetLimiter.hit(ip)) throw tooMany();
    const { token } = await parseJson(c, tokenBody);
    return c.json({ estado: await resetTokenState(deps, token) });
  });

  app.post('/auth/password/reset', async c => {
    const ip = c.get('meta').ip;
    if (ip && resetLimiter.hit(ip)) throw tooMany();
    const body = await parseJson(c, resetBody);
    await resetPassword(deps, body);
    return c.json({ mensagem: 'Senha alterada. Entre com a nova senha.' });
  });

  // Conta do cliente: nome, telefone e senha. E-mail e CPF só o administrador corrige.
  app.patch('/me', requireUser, async c => {
    const auth = c.get('auth')!;
    const body = await parseJson(c, profileBody);
    const updated = await updateProfile(deps, auth.user.id, body);
    return c.json({ user: publicUser({ ...auth.user, ...updated }) });
  });

  app.post('/me/password', requireUser, async c => {
    const auth = c.get('auth')!;
    const body = await parseJson(c, changePasswordBody);
    await changePassword(deps, { userId: auth.user.id, sessionId: auth.sessionId }, body);
    return c.json({ mensagem: 'Senha alterada.' });
  });

  // Equipe e demais rotas do administrador (Prompt 06). Compartilham a sessão carregada acima.
  app.route('/', teamRoutes(deps));
  app.route('/', eventsRoutes(deps));
  app.route('/', checkoutRoutes(deps));
  app.route('/', paymentAdminRoutes(deps));
  app.route('/', ticketRoutes(deps));
  app.route('/', emailAdminRoutes(deps));
  app.route('/', gateRoutes(deps));
  app.route('/', panelRoutes(deps));
  app.route('/', reportRoutes(deps));
  app.route('/', exportRoutes(deps));
  app.route('/', privacyRoutes(deps));

  return app;
}
