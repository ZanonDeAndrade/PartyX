import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { parseQrKeys, type QrKeys } from './domain/ticketCode';
import { formatCnpj, isValidCnpj } from './domain/cnpj';

/** Lê uma lista de esperas da conciliação sob demanda (segundos). Nula se inválida (fora da faixa, fora de ordem, repetida). */
export function parseOffsets(
  value: string,
  range: { min: number; max: number } = { min: 10, max: 3600 },
): number[] | null {
  const parts = value.split(',').map(p => p.trim());
  if (parts.length < 1 || parts.length > 10 || parts.some(p => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some(n => n < range.min || n > range.max)) return null;
  if (nums.some((n, i) => i > 0 && n <= nums[i - 1]!)) return null;
  return nums;
}

/** Data de vigência de um texto legal: AAAA-MM-DD, data real do calendário. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')
  .refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'data inválida');
/** Texto público de uma linha (rodapé, e-mails, página de manutenção): sem quebra de linha nem sinais de marcação. */
const publicLine = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .refine(v => !/[\r\n<>]/.test(v), 'uma linha, sem < nem >');

/**
 * Configuração lida do ambiente e validada na partida.
 * Segredos nunca têm valor padrão: ficam no Secret Manager (nuvem) ou em `.env` local fora do Git.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Ambiente de negócio: define o que é permitido (ex.: venda real só em produção). */
    APP_ENV: z.enum(['local', 'homologacao', 'producao']).default('local'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    /** Conexão pooled (aplicação). Opcional em desenvolvimento. */
    DATABASE_URL: z.string().min(1).optional(),
    /** Conexão direta (migrações). Separada da conexão da aplicação. */
    DATABASE_URL_DIRECT: z.string().min(1).optional(),
    /** Limite de conexões por instância. Multiplicar pelo máximo de instâncias do Cloud Run. */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    /** Pasta do build do front-end (Vite). */
    WEB_DIST_DIR: z.string().default('dist'),
    /** Segredo para o token CSRF. Vem do Secret Manager. Sem valor padrão fora do ambiente local. */
    SESSION_SECRET: z.string().min(32).optional(),
    /** Versões vigentes dos textos legais. Sem elas, o cadastro real fica bloqueado em produção. */
    TERMS_VERSION: z.string().min(1).optional(),
    PRIVACY_VERSION: z.string().min(1).optional(),
    /** Versão vigente da Política de Cancelamento. Obrigatória para vender em produção (D-11). */
    CANCELLATION_VERSION: z.string().min(1).optional(),
    /**
     * Data em que cada versão passou a valer (AAAA-MM-DD), informada pela PartyX junto com o texto. Aparece na página do documento ao
     * lado da versão. Em produção, sem a data, o documento não conta como publicado e o cadastro fica fechado.
     */
    TERMS_DATE: isoDate.optional(),
    PRIVACY_DATE: isoDate.optional(),
    CANCELLATION_DATE: isoDate.optional(),
    /**
     * Abre o cadastro de compradores. Padrão: aberto fora de produção, **fechado em produção**. Mesmo com `true`, produção só cadastra com os
     * três textos oficiais publicados (arquivo, versão e data): ver `signupBlockers` em `legal/documents.ts`.
     */
    SIGNUP_OPEN: z.enum(['true', 'false']).optional(),
    /**
     * Manutenção (G06): `true` troca o site inteiro pela página de indisponibilidade (503), com o contato da PartyX. Continuam no ar só a
     * saúde, o webhook do gateway e as rotinas internas, para nenhum pagamento se perder. Painel e portaria também fecham.
     */
    MAINTENANCE_MODE: z.enum(['true', 'false']).optional(),
    /**
     * Barreira de Host (só `Host` do domínio público ou `X-Forwarded-Host` do Firebase Hosting). Sempre ligada em produção; em homologação,
     * `PUBLIC_HOST_CHECK=true` liga a mesma regra para o teste rápido pelo Hosting provar que o cabeçalho chega. Exige `PUBLIC_BASE_URL`.
     */
    PUBLIC_HOST_CHECK: z.enum(['true', 'false']).optional(),
    /** Pasta com os textos legais fornecidos pela PartyX (`termos-de-uso.txt`, `privacidade.txt`, `cancelamento.txt`, `meia-entrada.txt`). Fora do Git. */
    LEGAL_CONTENT_DIR: z.string().min(1).optional(),
    /** `true` só depois da aprovação escrita da proposta visual pelo cliente (CA-33, D-10). Sem ela, o tema segue provisório e a venda real em produção fica bloqueada. */
    VISUAL_APPROVED: z.enum(['true', 'false']).optional(),
    /** Retenção dos dados técnicos, em dias. **Sem valor padrão**: o prazo é decisão da PartyX. Vazio = não apaga (docs/lgpd.md). */
    RETENTION_LOGIN_ATTEMPTS_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
    RETENTION_SESSIONS_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
    RETENTION_PASSWORD_RESETS_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
    /** Endereço público, usado nos links dos e-mails e na checagem de origem (CSRF). */
    PUBLIC_BASE_URL: z.url().optional(),
    /** Publica protótipo e documentação somente em homologação. */
    ENABLE_PROTOTYPE: z.enum(['true', 'false']).default('false'),
    /** Origens extras aceitas em requisições que alteram dados, separadas por vírgula. */
    ALLOWED_ORIGINS: z.string().optional(),
    /** Bucket público de leitura dos banners. Sem ele, só o ambiente local grava em disco; nos demais o upload é recusado. */
    BANNER_BUCKET: z.string().min(3).optional(),
    /** Endereço público dos banners. Padrão: https://storage.googleapis.com/<bucket>. Use para CDN ou domínio próprio. */
    BANNER_PUBLIC_BASE_URL: z.url().optional(),
    /**
     * Duração da reserva temporária, em minutos. D-03 (premissa adotada em 11/10/2026, aguardando confirmação escrita): 30 para todos, porque o Pix do Mercado Pago vence em no mínimo
     * 30 minutos e o QR precisa valer até o fim da reserva. Com menos que o mínimo do gateway, o Pix não é oferecido.
     */
    RESERVATION_MINUTES: z.coerce.number().int().min(1).max(60).default(30),
    /** Máximo de ingressos por compra, somando todos os tipos. Decisão do cliente (D-05); 6 é a premissa do protótipo. */
    MAX_TICKETS_PER_ORDER: z.coerce.number().int().min(1).max(50).default(6),
    /** Abre a criação de pedidos. Em produção fica fechada até a decisão expressa (gateway real, textos legais, equipe). */
    SALES_OPEN: z.enum(['true', 'false']).optional(),
    /** Gateway de pagamento: `mercadopago` (D-01) ou `mock` (fictício, só no ambiente local). Padrão: mock no local, nenhum nos demais. */
    PAYMENT_GATEWAY: z.enum(['none', 'mock', 'mercadopago']).optional(),
    /** Mercado Pago: Access Token (SEGREDO, Secret Manager na nuvem; `.env.local` no ambiente local, só de teste). */
    MP_ACCESS_TOKEN: z.string().min(20).max(200).optional(),
    /** Mercado Pago: Public Key, usada pelo componente de cartão no navegador (pública). */
    MP_PUBLIC_KEY: z.string().min(20).max(200).optional(),
    /** Mercado Pago: assinatura secreta das notificações (Webhooks > Configurar notificações). SEGREDO. */
    MP_WEBHOOK_SECRET: z.string().min(16).max(200).optional(),
    /** Mercado Pago: id da conta da PartyX (`collector_id`). Todo pagamento precisa ter este recebedor para ser aprovado. */
    MP_COLLECTOR_ID: z.string().regex(/^\d{1,20}$/, 'só dígitos').optional(),

    /** Endereço do serviço, usado como `audience` do token OIDC que o Cloud Scheduler envia às rotinas internas. Sem ele, as rotinas respondem 503. */
    JOBS_AUDIENCE: z.url().optional(),
    /** E-mail(s) das contas de serviço aceitas nas rotinas internas (Cloud Scheduler e Cloud Tasks), separados por vírgula. */
    JOBS_CALLER_EMAIL: z
      .string()
      .refine(v => v.split(',').every(e => z.email().safeParse(e.trim()).success), 'use e-mails separados por vírgula')
      .optional(),
    /**
     * Homologação SEM gateway sandbox (D-01 em aberto): `true` permite o adaptador FICTÍCIO nesse ambiente, para testar o fluxo inteiro
     * (pedido, webhook, conciliação, ingresso, portaria). Nunca em produção (a configuração recusa). O simulador é só para administrador.
     * Não substitui a sandbox do gateway real: a assinatura e os eventos do gateway de verdade continuam por provar.
     */
    HOMOLOGACAO_GATEWAY_FICTICIO: z.enum(['true', 'false']).optional(),
    /**
     * Ambiente das CREDENCIAIS do gateway: `sandbox` ou `producao`. Em produção só vale `producao`; em homologação só `sandbox`. Obrigatória
     * em produção quando houver gateway real. Cada adaptador do gateway ainda confere o formato da chave (a ser feito com o gateway escolhido, D-01).
     */
    GATEWAY_ENVIRONMENT: z.enum(['sandbox', 'producao']).optional(),
    /**
     * Cloudflare Turnstile no cadastro e na recuperação de senha. **Opcional e desligado por padrão** (decisão de 06/10/2026 para a produção):
     * `TURNSTILE_ENABLED=true` liga. Ligado, exige as duas chaves (a SECRETA, do Secret Manager, e a do site, pública). Desligado, as chaves são
     * ignoradas: o servidor sobe sem elas, o front-end não carrega o script da Cloudflare e o CSP não libera a Cloudflare.
     */
    TURNSTILE_ENABLED: z.enum(['true', 'false']).optional(),
    TURNSTILE_SECRET: z.string().min(10).optional(),
    TURNSTILE_SITE_KEY: z.string().min(10).optional(),
    /**
     * Limites globais compartilhados no banco. Ajuste os tetos para a capacidade do evento antes da abertura.
     */
    GLOBAL_SIGNUPS_PER_HOUR: z.coerce.number().int().min(1).max(100000).default(1000),
    SIGNUPS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).max(10000).default(100),
    GLOBAL_RECOVERIES_PER_HOUR: z.coerce.number().int().min(1).max(100000).default(60),
    GATE_SCANS_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(3000),
    GATE_SEARCHES_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(400),
    /**
     * Janela operacional da portaria para evento ENCERRADO: de N horas antes do início até M horas depois, a portaria ainda valida os
     * ingressos dele (encerrar tira o evento do site e para as vendas, mas a festa pode estar acontecendo). Fora dela, fechado.
     * Rascunho nunca entra; publicado entra sempre. Padrão 12 h antes e 24 h depois: premissa a confirmar com a PartyX (D-79).
     */
    GATE_CLOSED_WINDOW_BEFORE_HOURS: z.coerce.number().int().min(0).max(72).default(12),
    GATE_CLOSED_WINDOW_AFTER_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    /** Fila do Cloud Tasks da conciliação sob demanda: `projects/<projeto>/locations/<região>/queues/<fila>`. Sem ela, só o webhook e a rotina diária conciliam. */
    TASKS_QUEUE: z
      .string()
      .regex(/^projects\/[^/]+\/locations\/[^/]+\/queues\/[^/]+$/, 'formato projects/P/locations/L/queues/Q')
      .optional(),
    /** Conta de serviço com que o Cloud Tasks assina o token OIDC. Precisa estar também em JOBS_CALLER_EMAIL. */
    TASKS_INVOKER_EMAIL: z.email().optional(),
    /**
     * Conciliação sob demanda: segundos, contados da **criação da cobrança**, em que cada verificação do pedido roda (Cloud Tasks).
     * Lista crescente separada por vírgula. Padrão `60,120,240,480` (1, 2, 4 e 8 minutos), para cumprir "a cada poucos minutos" (RF-35).
     * Nenhuma verificação passa do prazo da reserva mais a margem abaixo; a última roda exatamente nesse limite.
     */
    RECONCILE_TASK_OFFSETS_SECONDS: z
      .string()
      .default('60,120,240,480')
      .refine(
        v => parseOffsets(v) !== null,
        'use de 1 a 10 números inteiros crescentes entre 10 e 3600, separados por vírgula',
      ),
    /** Margem depois do fim da reserva para a verificação do limite, em segundos. */
    RECONCILE_TASK_MARGIN_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),
    /**
     * Verificações **tardias**, também por pedido no Cloud Tasks e contadas da criação da cobrança, para a aprovação que chega depois
     * do vencimento (seção 10.1). Padrão: 15 min, 30 min, 1 h, 3 h, 8 h e 24 h. Só valem as que caem depois do limite da reserva.
     * Depois da última, se o gateway seguir sem estado conclusivo, o pedido vai para revisão manual. Sem agenda fixa no Scheduler.
     */
    RECONCILE_LATE_OFFSETS_SECONDS: z
      .string()
      .default('900,1800,3600,10800,28800,86400')
      .refine(
        v => parseOffsets(v, { min: 60, max: 259200 }) !== null,
        'use de 1 a 10 números inteiros crescentes entre 60 e 259200 (3 dias), separados por vírgula',
      ),
    /** Prazo da trava (`job_leases`) de cada verificação de pedido e da rotina diária, em segundos. Solta sozinha se a execução cair. */
    RECONCILE_LOCK_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
    /**
     * Contato de atendimento **da PartyX** mostrado ao comprador quando o pagamento foi aprovado sem ingresso disponível. Fornecido pela
     * PartyX. Sem ele a tela mostra uma mensagem neutra, sem prazo. Nunca usar aqui o contato da contratada.
     */
    PARTYX_SUPPORT_EMAIL: z.email().optional(),
    /** WhatsApp de atendimento da PartyX, com DDI e DDD (ex.: +55 11 91234-5678). */
    PARTYX_SUPPORT_WHATSAPP: z
      .string()
      .regex(/^\+?[0-9][0-9 ()-]{7,22}$/, 'use só números, espaços, parênteses, hífen e o + inicial')
      .refine(v => v.replace(/\D/g, '').length >= 10 && v.replace(/\D/g, '').length <= 15, 'de 10 a 15 dígitos com DDI')
      .optional(),
    /**
     * Dados cadastrais públicos **da PartyX** (D-16, insumo 4), mostrados no rodapé do site, nos e-mails e na página de manutenção.
     * Fornecidos pela PartyX. Sem eles, fora de produção aparece "a fornecer"; em produção o item é omitido. Nunca dados da contratada.
     */
    PARTYX_LEGAL_NAME: publicLine(160).optional(),
    PARTYX_CNPJ: z
      .string()
      .refine(isValidCnpj, 'CNPJ inválido (dígitos verificadores)')
      .optional(),
    PARTYX_ADDRESS: publicLine(240).optional(),
    /** Horário de atendimento ao comprador como a PartyX informar (ex.: "Segunda a sexta, das 10h às 18h"). */
    PARTYX_SUPPORT_HOURS: publicLine(120).optional(),
    /** Chaves do HMAC dos QR Codes, "versão:chave" separados por vírgula (chave em base64url, 32+ bytes). Vêm do Secret Manager. Obrigatória fora do local. Para rotacionar, **acrescente** a versão nova e troque `QR_HMAC_CURRENT`: as antigas continuam valendo para ingressos já emitidos. */
    QR_HMAC_KEYS: z.string().min(1).optional(),
    /** Versão usada para assinar os ingressos novos. */
    QR_HMAC_CURRENT: z.coerce.number().int().min(1).max(9999).optional(),
    /** Entrega de e-mail por SMTP (URL com credenciais; segredo, vem do Secret Manager). Sem ela: local captura em disco; os demais ambientes ficam sem envio (a fila acumula e alerta). O provedor é decisão do cliente (D-09). */
    SMTP_URL: z.string().min(1).optional(),
    /** Remetente, ex.: `PartyX <ingressos@dominio>`. O domínio precisa ter SPF, DKIM e DMARC (docs/email.md). Obrigatório com SMTP_URL. */
    EMAIL_FROM: z.string().min(3).optional(),
    /** Endereço de resposta. Vazio: usa PARTYX_SUPPORT_EMAIL, para a resposta do comprador chegar ao atendimento da PartyX. */
    EMAIL_REPLY_TO: z.string().min(3).optional(),
    /** Quantos proxies confiáveis existem na frente da API (Cloud Run direto: 1). Define qual IP do X-Forwarded-For vale. */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'producao' && !env.PUBLIC_BASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'obrigatória em produção' });
    }
    if (env.PUBLIC_HOST_CHECK === 'true' && !env.PUBLIC_BASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'obrigatória com PUBLIC_HOST_CHECK=true' });
    }
    if (env.APP_ENV === 'producao' && env.PUBLIC_HOST_CHECK === 'false') {
      ctx.addIssue({ code: 'custom', path: ['PUBLIC_HOST_CHECK'], message: 'a barreira de Host não pode ser desligada em produção' });
    }
    if (env.APP_ENV === 'producao' && env.ENABLE_PROTOTYPE === 'true') {
      ctx.addIssue({ code: 'custom', path: ['ENABLE_PROTOTYPE'], message: 'proibido em produção' });
    }
    if (env.APP_ENV !== 'local' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'obrigatória fora do ambiente local' });
    }
    const mockInHml = env.APP_ENV === 'homologacao' && env.HOMOLOGACAO_GATEWAY_FICTICIO === 'true';
    if (env.PAYMENT_GATEWAY === 'mock' && env.APP_ENV !== 'local' && !mockInHml) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_GATEWAY'],
        message:
          'o gateway fictício só pode ser usado no ambiente local (em homologação só com HOMOLOGACAO_GATEWAY_FICTICIO=true; nunca em produção)',
      });
    }
    if (env.HOMOLOGACAO_GATEWAY_FICTICIO === 'true' && env.APP_ENV !== 'homologacao') {
      ctx.addIssue({
        code: 'custom',
        path: ['HOMOLOGACAO_GATEWAY_FICTICIO'],
        message: 'esta variável só existe em homologação',
      });
    }
    if (env.APP_ENV !== 'local' && !env.QR_HMAC_KEYS) {
      ctx.addIssue({ code: 'custom', path: ['QR_HMAC_KEYS'], message: 'obrigatória fora do ambiente local' });
    }
    if (env.QR_HMAC_KEYS) {
      try {
        const keys = parseQrKeys(env.QR_HMAC_KEYS);
        const current = env.QR_HMAC_CURRENT ?? Math.max(...keys.keys());
        if (!keys.has(current)) {
          ctx.addIssue({
            code: 'custom',
            path: ['QR_HMAC_CURRENT'],
            message: 'a versão atual precisa estar em QR_HMAC_KEYS',
          });
        }
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          path: ['QR_HMAC_KEYS'],
          message: error instanceof Error ? error.message : 'inválida',
        });
      }
    }
    if (env.APP_ENV === 'producao' && env.GATEWAY_ENVIRONMENT === 'sandbox') {
      ctx.addIssue({
        code: 'custom',
        path: ['GATEWAY_ENVIRONMENT'],
        message: 'credenciais de SANDBOX do gateway em produção: recusado',
      });
    }
    if (env.APP_ENV === 'homologacao' && env.GATEWAY_ENVIRONMENT === 'producao') {
      ctx.addIssue({
        code: 'custom',
        path: ['GATEWAY_ENVIRONMENT'],
        message: 'credenciais de PRODUÇÃO do gateway em homologação: recusado',
      });
    }
    if (
      env.APP_ENV === 'producao' &&
      env.PAYMENT_GATEWAY &&
      env.PAYMENT_GATEWAY !== 'none' &&
      env.GATEWAY_ENVIRONMENT !== 'producao'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['GATEWAY_ENVIRONMENT'],
        message: 'em produção, com gateway configurado, GATEWAY_ENVIRONMENT precisa ser producao',
      });
    }
    if (env.PAYMENT_GATEWAY === 'mercadopago') {
      for (const key of ['MP_ACCESS_TOKEN', 'MP_PUBLIC_KEY', 'MP_WEBHOOK_SECRET', 'MP_COLLECTOR_ID'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'obrigatória com PAYMENT_GATEWAY=mercadopago' });
      }
      // Credencial de produção cobra de verdade: nunca no computador de desenvolvimento.
      if (env.APP_ENV === 'local' && env.GATEWAY_ENVIRONMENT === 'producao') {
        ctx.addIssue({
          code: 'custom',
          path: ['GATEWAY_ENVIRONMENT'],
          message: 'credenciais de PRODUÇÃO do gateway no ambiente local: recusado',
        });
      }
      if (env.GATEWAY_ENVIRONMENT === 'producao' && env.MP_ACCESS_TOKEN?.startsWith('TEST-')) {
        ctx.addIssue({ code: 'custom', path: ['MP_ACCESS_TOKEN'], message: 'credencial de teste com GATEWAY_ENVIRONMENT=producao' });
      }
    }
    if (env.TURNSTILE_ENABLED === 'true') {
      for (const key of ['TURNSTILE_SECRET', 'TURNSTILE_SITE_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'obrigatória com TURNSTILE_ENABLED=true' });
      }
    }
    if (env.SMTP_URL && !env.EMAIL_FROM) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'obrigatório quando SMTP_URL está definido' });
    }
    if (env.EMAIL_FROM && !/^[^<>\r\n]*<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(env.EMAIL_FROM)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'use "Nome <endereco@dominio>" ou "endereco@dominio"',
      });
    }
    if (env.APP_ENV !== 'local' && !env.SESSION_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'obrigatória fora do ambiente local' });
    }
  });

type RawConfig = z.infer<typeof schema>;

/** Segredo fixo, só para o ambiente local e testes. Nunca é aceito fora dele. */
const LOCAL_SESSION_SECRET = 'segredo-somente-local-nao-usar-em-nuvem-0123456789';

/** Textos legais em vigor. Em não produção, versões fictícias identificadas. */
export interface LegalVersions {
  terms: string;
  privacy: string;
  /** Falso em produção enquanto o cliente não fornecer os textos: cadastro real bloqueado. */
  ready: boolean;
  /** Verdadeiro quando as versões são fictícias (não produção). */
  provisional: boolean;
}

export type Config = Omit<
  RawConfig,
  | 'SESSION_SECRET'
  | 'SALES_OPEN'
  | 'HOMOLOGACAO_GATEWAY_FICTICIO'
  | 'TURNSTILE_ENABLED'
  | 'PAYMENT_GATEWAY'
  | 'QR_HMAC_KEYS'
  | 'QR_HMAC_CURRENT'
  | 'CANCELLATION_VERSION'
  | 'LEGAL_CONTENT_DIR'
  | 'VISUAL_APPROVED'
  | 'RETENTION_LOGIN_ATTEMPTS_DAYS'
  | 'RETENTION_SESSIONS_DAYS'
  | 'RETENTION_PASSWORD_RESETS_DAYS'
  | 'RECONCILE_TASK_OFFSETS_SECONDS'
  | 'RECONCILE_TASK_MARGIN_SECONDS'
  | 'RECONCILE_LATE_OFFSETS_SECONDS'
  | 'RECONCILE_LOCK_SECONDS'
  | 'PARTYX_SUPPORT_EMAIL'
  | 'PARTYX_SUPPORT_WHATSAPP'
  | 'PARTYX_LEGAL_NAME'
  | 'PARTYX_CNPJ'
  | 'PARTYX_ADDRESS'
  | 'PARTYX_SUPPORT_HOURS'
  | 'TERMS_DATE'
  | 'PRIVACY_DATE'
  | 'CANCELLATION_DATE'
  | 'SIGNUP_OPEN'
  | 'MAINTENANCE_MODE'
  | 'PUBLIC_HOST_CHECK'
> & {
  /** Chaves de assinatura dos QR por versão, e a versão usada nos ingressos novos. */
  qr: { keys: QrKeys; currentVersion: number };
  PAYMENT_GATEWAY: 'none' | 'mock' | 'mercadopago';
  /** A verificação humana (Turnstile) está ligada (`TURNSTILE_ENABLED=true`). */
  turnstileEnabled: boolean;
  /** O adaptador fictício está liberado em homologação (só com a variável explícita). */
  mockGatewayInHomologacao: boolean;
  SESSION_SECRET: string;
  /** Pedidos podem ser criados. Padrão: sim fora de produção, não em produção. */
  salesOpen: boolean;
  legal: LegalVersions;
  legalContentDir: string | undefined;
  cancellationVersion: string | undefined;
  /** O cliente aprovou a identidade visual por escrito (CA-33). */
  visualApproved: boolean;
  /** Prazos de retenção dos dados técnicos, em dias. Indefinido = não apagar. */
  retention: { loginAttemptsDays?: number; sessionsDays?: number; passwordResetsDays?: number };
  /** Cadência da conciliação: tarefas sob demanda e varredura agendada. */
  reconcile: ReconcileSchedule;
  /** Contato de atendimento da PartyX para o comprador. Nulo quando a PartyX ainda não forneceu nenhum. */
  partyxSupport: SupportContact | null;
  /** Dados e contatos públicos da PartyX (rodapé, e-mails, manutenção). Cada campo nulo enquanto a PartyX não informar. */
  partyx: PartyxPublicInfo;
  /** Data de vigência (AAAA-MM-DD) de cada texto legal, quando informada. */
  legalDates: { terms: string | null; privacy: string | null; cancellation: string | null };
  /** O cadastro de compradores está aberto por configuração (produção ainda exige os textos: `signupBlockers`). */
  signupOpen: boolean;
  /** Página de manutenção ligada (G06). */
  maintenance: boolean;
  /** Barreira de Host ligada: sempre em produção; em homologação só com `PUBLIC_HOST_CHECK=true`. */
  publicHostCheck: boolean;
};

export interface PartyxPublicInfo {
  legalName: string | null;
  /** Já formatado: 00.000.000/0000-00. */
  cnpj: string | null;
  address: string | null;
  supportEmail: string | null;
  supportWhatsapp: string | null;
  supportHours: string | null;
}

export interface ReconcileSchedule {
  /** Esperas, em segundos desde a criação da cobrança, de cada verificação sob demanda. */
  taskOffsetsSeconds: number[];
  /** Margem depois do fim da reserva para a última verificação sob demanda. */
  taskMarginSeconds: number;
  /** Esperas das verificações tardias (aprovação depois do vencimento), em segundos desde a cobrança. */
  lateOffsetsSeconds: number[];
  /** Prazo da trava de cada verificação e da rotina diária. */
  lockSeconds: number;
}

export interface SupportContact {
  email: string | null;
  whatsapp: string | null;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Variável presente e vazia (`NOME=` no .env) vale como ausente.
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    // Lista só os nomes e motivos das variáveis inválidas, nunca os valores.
    const problems = parsed.error.issues.map(i => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`Configuração inválida:\n- ${problems.join('\n- ')}`);
  }
  const raw = parsed.data;
  const provided = Boolean(raw.TERMS_VERSION && raw.PRIVACY_VERSION);
  const legal: LegalVersions =
    raw.APP_ENV === 'producao'
      ? { terms: raw.TERMS_VERSION ?? '', privacy: raw.PRIVACY_VERSION ?? '', ready: provided, provisional: false }
      : {
          terms: raw.TERMS_VERSION ?? 'ficticio-0',
          privacy: raw.PRIVACY_VERSION ?? 'ficticio-0',
          ready: true,
          provisional: !provided,
        };
  const {
    SALES_OPEN,
    HOMOLOGACAO_GATEWAY_FICTICIO,
    TURNSTILE_ENABLED: _turnstileEnabled,
    CANCELLATION_VERSION,
    LEGAL_CONTENT_DIR,
    VISUAL_APPROVED,
    RETENTION_LOGIN_ATTEMPTS_DAYS,
    RETENTION_SESSIONS_DAYS,
    RETENTION_PASSWORD_RESETS_DAYS,
    RECONCILE_TASK_OFFSETS_SECONDS,
    RECONCILE_TASK_MARGIN_SECONDS,
    RECONCILE_LATE_OFFSETS_SECONDS,
    RECONCILE_LOCK_SECONDS,
    PARTYX_SUPPORT_EMAIL,
    PARTYX_SUPPORT_WHATSAPP,
    PARTYX_LEGAL_NAME,
    PARTYX_CNPJ,
    PARTYX_ADDRESS,
    PARTYX_SUPPORT_HOURS,
    TERMS_DATE,
    PRIVACY_DATE,
    CANCELLATION_DATE,
    SIGNUP_OPEN,
    MAINTENANCE_MODE,
    PUBLIC_HOST_CHECK,
    ...rest
  } = raw;
  const salesOpen = SALES_OPEN ? SALES_OPEN === 'true' : raw.APP_ENV !== 'producao';
  const turnstileEnabled = raw.TURNSTILE_ENABLED === 'true';
  const PAYMENT_GATEWAY = raw.PAYMENT_GATEWAY ?? (raw.APP_ENV === 'local' ? 'mock' : 'none');
  // Local: chave derivada do segredo local de sessão, para os ingressos de desenvolvimento sobreviverem a reinícios.
  // Fora do local a variável é obrigatória (validada acima) e nada é derivado.
  const sessionSecret = raw.SESSION_SECRET ?? LOCAL_SESSION_SECRET;
  const keys = raw.QR_HMAC_KEYS
    ? parseQrKeys(raw.QR_HMAC_KEYS)
    : new Map([[1, createHmac('sha256', sessionSecret).update('qr-key-local-v1').digest()]]);
  const currentVersion = raw.QR_HMAC_CURRENT ?? Math.max(...keys.keys());
  const {
    QR_HMAC_KEYS: _k,
    QR_HMAC_CURRENT: _c,
    ...restNoQr
  } = rest as typeof rest & { QR_HMAC_KEYS?: string; QR_HMAC_CURRENT?: number };
  return {
    ...restNoQr,
    qr: { keys, currentVersion },
    PAYMENT_GATEWAY,
    SESSION_SECRET: raw.SESSION_SECRET ?? LOCAL_SESSION_SECRET,
    salesOpen,
    legal,
    legalContentDir: LEGAL_CONTENT_DIR,
    cancellationVersion: CANCELLATION_VERSION,
    visualApproved: VISUAL_APPROVED === 'true',
    mockGatewayInHomologacao: raw.APP_ENV === 'homologacao' && HOMOLOGACAO_GATEWAY_FICTICIO === 'true',
    turnstileEnabled,
    // Desligado: as chaves não saem da configuração (nada usa a secreta, a tela não recebe a chave do site, o CSP não libera a Cloudflare).
    TURNSTILE_SECRET: turnstileEnabled ? raw.TURNSTILE_SECRET : undefined,
    TURNSTILE_SITE_KEY: turnstileEnabled ? raw.TURNSTILE_SITE_KEY : undefined,
    retention: {
      loginAttemptsDays: RETENTION_LOGIN_ATTEMPTS_DAYS,
      sessionsDays: RETENTION_SESSIONS_DAYS,
      passwordResetsDays: RETENTION_PASSWORD_RESETS_DAYS,
    },
    reconcile: {
      taskOffsetsSeconds: parseOffsets(RECONCILE_TASK_OFFSETS_SECONDS)!,
      taskMarginSeconds: RECONCILE_TASK_MARGIN_SECONDS,
      lateOffsetsSeconds: parseOffsets(RECONCILE_LATE_OFFSETS_SECONDS, { min: 60, max: 259200 })!,
      lockSeconds: RECONCILE_LOCK_SECONDS,
    },
    partyxSupport:
      PARTYX_SUPPORT_EMAIL || PARTYX_SUPPORT_WHATSAPP
        ? { email: PARTYX_SUPPORT_EMAIL ?? null, whatsapp: PARTYX_SUPPORT_WHATSAPP ?? null }
        : null,
    partyx: {
      legalName: PARTYX_LEGAL_NAME ?? null,
      cnpj: PARTYX_CNPJ ? formatCnpj(PARTYX_CNPJ) : null,
      address: PARTYX_ADDRESS ?? null,
      supportEmail: PARTYX_SUPPORT_EMAIL ?? null,
      supportWhatsapp: PARTYX_SUPPORT_WHATSAPP ?? null,
      supportHours: PARTYX_SUPPORT_HOURS ?? null,
    },
    legalDates: { terms: TERMS_DATE ?? null, privacy: PRIVACY_DATE ?? null, cancellation: CANCELLATION_DATE ?? null },
    signupOpen: SIGNUP_OPEN ? SIGNUP_OPEN === 'true' : raw.APP_ENV !== 'producao',
    maintenance: MAINTENANCE_MODE === 'true',
    publicHostCheck: raw.APP_ENV === 'producao' || PUBLIC_HOST_CHECK === 'true',
  };
}
