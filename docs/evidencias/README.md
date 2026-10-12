# Evidências de teste (12/10/2026)

Tudo aqui foi gerado no **ambiente local** (servidor Node da própria máquina, PostgreSQL de teste descartável em contêiner, dados
fictícios). **Nada rodou em homologação nem em produção, e nenhum aparelho real foi usado.**

| Pasta ou arquivo | O que é | Gateway | Como repetir |
|---|---|---|---|
| `roteiro-11-2/sandbox/` | Roteiro 11.2 do PDF, itens 1 a 20, pela interface (Playwright, Chromium), mais o formulário de cartão do Mercado Pago a 360 px. `resultado.md` traz o que cada item conferiu | **Mercado Pago, ambiente de teste** (credenciais de usuário de teste; a conta é conferida antes) | `npm run e2e:roteiro:sandbox` |
| `roteiro-11-2/ficticio/` | O mesmo roteiro com o gateway fictício local (determinístico; o teste do formulário de cartão fica pulado, porque o Brick só existe com o gateway real) | Fictício | `npm run e2e:roteiro:ficticio` |
| `responsividade/` | CA-32: 152 telas e estados × 360, 390, 768 e 1440 px; falha se a página tiver `scrollWidth > clientWidth`. `resultado.md` com o resultado e o link da captura de cada medição | Fictício (os estados de pedido vêm do simulador) | `npm run e2e:responsivo` |
| `carga/` | PDF 11.3 com k6: 200 visitantes simultâneos na página do evento e 50 compras/min por 3 min, com estoque menor que a procura. `resultado.md` (sem limite de memória) e `resultado-heap320.md` (heap do Node limitado a 320 MB, como no Cloud Run) | Fictício | `npm run carga` e `NODE_HEAP_MB=320 npm run carga` |
| `compatibilidade.md` | Checklist **manual** para Chrome Android, Safari iPhone e Chrome/Edge no computador (câmera, QR na tela e impresso, som, PDF, CSV no Excel). **Nenhum item executado** | n/a | À mão, em homologação |

**Capturas fora do Git.** Imagens e o PDF do ingresso de cada rodada ficam em `img/` dentro de cada pasta (por exemplo
`roteiro-11-2/sandbox/img/` e `responsividade/img/360/`) e estão no `.gitignore`: o repositório guarda só as tabelas (CSV, JSON,
TXT) e os `.md`. As capturas desta rodada (683 arquivos, cerca de 37 MB) foram entregues num arquivo zip guardado fora do
repositório; rodar os testes de novo gera tudo outra vez.

Pré-requisitos: `npm run db:test:up` (PostgreSQL de teste) e Docker (k6). O roteiro no sandbox lê as credenciais de teste do
`.env.local` (`scripts/setup-mp-credentials.sh`); sem elas, `npm run e2e:roteiro` usa o fictício e diz isso no resumo.

## O que é real e o que é simulado no roteiro com o sandbox

| Parte | Real ou simulado |
|---|---|
| Interface, servidor, banco, regras de estoque, reserva, emissão, portaria, relatórios e exportações | Real (o código da aplicação, local) |
| Criação das cobranças, aprovação do Pix (pagador APRO), aprovação e recusa do cartão (titulares APRO e OTHE no Card Payment Brick), reconsulta da order | **Real**, no ambiente de teste do Mercado Pago |
| Entrega do webhook | **Montada** pelo teste e assinada com a assinatura secreta da aplicação da PartyX (o Mercado Pago não alcança o servidor local; ver `docs/pagamento-mercadopago.md`). O servidor reconsulta a order real antes de agir |
| Pix vencido (item 7) | Prazo da reserva **adiantado** no banco de teste em vez de esperar 30 min; a expiração é a do próprio servidor |
| E-mail (itens 2 e 12) | **Capturado** pelo servidor local (`.data/emails`), sem SMTP real: prova o conteúdo e o link, não a entrega na caixa de entrada |
| Câmera da portaria (itens 14, 16 e 17) | **Simulada** pelo Chromium com um vídeo do QR real; não substitui o ensaio de portaria da seção 11.4 nem o checklist de compatibilidade |
| Celular (item 13) | Pixel 7 **emulado** no Chromium |

## Achado e correção desta rodada

O roteiro achou um defeito intermitente na interface: ao abrir **Painel > Eventos > Novo evento** logo depois de entrar, a tela às
vezes ficava em branco (`Cannot read properties of null (reading 'limits')`). Quando a busca era cancelada no meio da leitura da
resposta (a chave muda ao confirmar o acesso de administrador), `request()` devolvia `null` como se fosse sucesso e `useFetch` gravava
`{ status: 'ok', data: null }`. Corrigido em `src/site/useFetch.ts` (busca cancelada não grava nada) e `src/site/api.ts` (cancelamento
durante a leitura do corpo volta a ser cancelamento). Depois da correção, o roteiro passou em todas as rodadas seguintes.

## Observações para revisão

- **Memória sob carga:** a primeira rodada chegou a 1,35 GB de RSS. Não era o heap do V8: cada data formatada criava um
  `Intl.DateTimeFormat`, com memória nativa do ICU que o coletor quase não enxerga. Corrigido em `server/src/domain/time.ts`; a carga
  foi refeita com o JS empacotado (o mesmo do contêiner): **375 MB** sem limite e **269 MB** com heap de 320 MB, estáveis do início
  ao fim. Investigação, outros suspeitos e a recomendação para aberturas grandes: `docs/operacao/memoria.md`. Conferir a memória da
  instância em homologação sob carga antes de uma abertura grande.
- **Rolagem interna a 768 px:** cinco tabelas do painel (ingressos e compradores do evento, pedidos, taxa mensal, exceções) rolam na
  horizontal **dentro da própria caixa** a 768 px. A página não rola (CA-32 passa), mas fica listado no resultado da responsividade.
- Os tempos de carga **não valem para a nuvem**: sem rede, sem Neon, sem gateway real.
