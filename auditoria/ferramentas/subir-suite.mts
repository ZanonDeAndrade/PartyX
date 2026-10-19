// Sobe o servidor local da suíte da auditoria (banco de teste novo com a semente, gateway fictício) e o deixa no ar para as
// ferramentas de acessibilidade, heurísticas e Lighthouse. Encerre com: npx tsx auditoria/ferramentas/parar-suite.mts
// Uso: PARTYX_ALLOW_MISSING_APP_ROLE=1 npx tsx auditoria/ferramentas/subir-suite.mts
import setup from '../e2e/support/setup';

await setup();
console.log('servidor da suíte no ar; estado em auditoria/.run/state.json');
