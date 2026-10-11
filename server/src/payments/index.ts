import type { Config } from '../config';
import type { Clock } from '../providers/clock';
import type { PaymentGateway } from './gateway';
import { createMockGateway } from './mockGateway';

/**
 * Escolhe o adaptador pela configuração. Hoje só existe o fictício, e **só no ambiente local** (e em homologação, com a variável explícita).
 * O gateway real entra aqui quando o cliente escolher (D-01); até lá, em homologação e produção,
 * não há gateway e a criação de pagamento responde 503.
 */
export function createGateway(
  config: Pick<Config, 'PAYMENT_GATEWAY' | 'APP_ENV'> & { mockGatewayInHomologacao?: boolean },
  clock: Clock,
): PaymentGateway | undefined {
  switch (config.PAYMENT_GATEWAY) {
    case 'none':
      return undefined;
    case 'mock':
      // Segunda barreira: a configuração já recusa, mas quem montar o app sem passar por ela também é barrado.
      if (config.APP_ENV !== 'local' && !(config.APP_ENV === 'homologacao' && config.mockGatewayInHomologacao)) {
        throw new Error('o gateway fictício só pode ser usado no ambiente local (em homologação só com HOMOLOGACAO_GATEWAY_FICTICIO=true)');
      }
      return createMockGateway(clock);
  }
}
