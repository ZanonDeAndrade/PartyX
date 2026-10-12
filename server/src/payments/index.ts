import type { Config } from '../config';
import type { Clock } from '../providers/clock';
import type { PaymentGateway } from './gateway';
import { createMercadoPagoGateway } from './mercadopago';
import { createMockGateway } from './mockGateway';

type GatewayConfig = Pick<Config, 'PAYMENT_GATEWAY' | 'APP_ENV'> &
  Partial<
    Pick<
      Config,
      | 'MP_ACCESS_TOKEN'
      | 'MP_PUBLIC_KEY'
      | 'MP_WEBHOOK_SECRET'
      | 'MP_COLLECTOR_ID'
      | 'GATEWAY_ENVIRONMENT'
    >
  > & { mockGatewayInHomologacao?: boolean };

/**
 * Escolhe o adaptador pela configuração: `mercadopago` (D-01) ou o fictício, que só vale no ambiente local (e em homologação,
 * com a variável explícita). Sem gateway, a criação de pagamento responde 503.
 */
export function createGateway(config: GatewayConfig, clock: Clock): PaymentGateway | undefined {
  switch (config.PAYMENT_GATEWAY) {
    case 'none':
      return undefined;
    case 'mock':
      // Segunda barreira: a configuração já recusa, mas quem montar o app sem passar por ela também é barrado.
      if (config.APP_ENV !== 'local' && !(config.APP_ENV === 'homologacao' && config.mockGatewayInHomologacao)) {
        throw new Error('o gateway fictício só pode ser usado no ambiente local (em homologação só com HOMOLOGACAO_GATEWAY_FICTICIO=true)');
      }
      return createMockGateway(clock);
    case 'mercadopago': {
      const { MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET, MP_COLLECTOR_ID } = config;
      if (!MP_ACCESS_TOKEN || !MP_PUBLIC_KEY || !MP_WEBHOOK_SECRET || !MP_COLLECTOR_ID) {
        throw new Error('Mercado Pago sem credenciais completas (MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET, MP_COLLECTOR_ID)');
      }
      const liveMode = config.GATEWAY_ENVIRONMENT === 'producao';
      if (liveMode && config.APP_ENV !== 'producao') {
        throw new Error('credenciais de produção do Mercado Pago só no ambiente de produção');
      }
      return createMercadoPagoGateway({
        accessToken: MP_ACCESS_TOKEN,
        publicKey: MP_PUBLIC_KEY,
        webhookSecret: MP_WEBHOOK_SECRET,
        collectorId: MP_COLLECTOR_ID,
        liveMode,
        clock,
      });
    }
  }
}
