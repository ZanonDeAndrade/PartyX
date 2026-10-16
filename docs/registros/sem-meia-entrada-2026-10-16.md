# Sem meia-entrada: o documento sai do site (16/10/2026)

Pedido do responsável (Arthur), em 15/10/2026 à noite: remover o documento "Regras de meia-entrada" do site, porque não haverá meia-entrada. Os Termos de Uso já dizem isso ("Meia-entrada: os ingressos vendidos na Plataforma são de valor integral. A Plataforma não oferece venda de meia-entrada."), e essa frase fica como está. Regras: testes, capturas, commit local, OK antes da virada; entra na próxima publicação da fila. Decisão D-06 fechada.

## O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Menu de Documentos (página de cada texto legal) | Termos, Privacidade, Cancelamento, **Meia-entrada**, Termo para menores | Sem "Meia-entrada" |
| Página do evento | Com um tipo de ingresso com "meia" no nome, um link "veja as regras" | Sem o link |
| Rodapé, checkout e cabeçalho | Já não tinham link | Iguais (conferido no e2e) |
| `/meia-entrada` | Página do documento | **301 para `/termos-de-uso`** no servidor (com e sem a barra final); dentro do site, um link antigo mostra os Termos e troca o endereço |
| `GET /api/public/legal/meia-entrada` | O documento (ou o aviso de homologação) | 404, como um documento que não existe |
| Servidor | `meia-entrada` entre os tipos de documento legal | Fora da lista. Ele nunca foi obrigatório para cadastrar nem para vender, e nada dele trava `SALES_OPEN=true`. Os obrigatórios para vender continuam Termos, Privacidade e Política de Cancelamento |
| `deploy.sh build` | Imprimia o resumo de `meia-entrada.txt`, se houvesse | Fora da lista (nunca foi conferência obrigatória) |
| Variáveis | Não havia versão nem data de meia-entrada | Nada a remover |

## O que sobrou com "meia" no repositório (de propósito)

- **Termos de Uso** (`conteudo-legal/termos-de-uso.txt`): a frase que diz que não há meia-entrada.
- **Painel, dois textos de ajuda** do formulário de tipo de ingresso (`src/site/adminEvents.tsx`), mostrados ao responsável antes de remover:
  - o exemplo do campo Nome ("Ex.: Pista, Camarote, Meia-entrada");
  - "Tipos de meia-entrada podem existir: o documento é conferido na portaria, sem envio de comprovante".

  Não há tipo, campo nem regra de meia-entrada no painel.
- **Dados fictícios de teste** com tipos chamados "Meia-entrada Pista" ou "MeiaEntradaEstudante": `infra/ui/seed-ui.mts`, `infra/ui/flows-ui.mts`, `e2e/support/seed-textos-longos.mts`, testes do PDF, da contingência e do e-mail. São só nomes (texto longo para testar quebra de linha); não dependem de nenhuma regra.
- **Protótipo e documentação de referência** (`src/logic`, `src/docs`, `src/data/seed.ts`, `reference/`, `docs/fontes/`, `docs/ui/`, `docs/AUDITORIA_PartyX.md`): histórico do projeto, fora do site em produção.
- **"Meia-noite", "meia-lua" e "renomeia"**: palavras que não têm relação com meia-entrada.

## Verificação (local)

- **Novos testes:**
  - `server/src/app.test.ts`: 301 de `/meia-entrada` e `/meia-entrada/` para `/termos-de-uso`, e 404 na API;
  - `server/src/legal/documents.test.ts`: `meia-entrada` não é mais um documento;
  - `e2e/documentos.spec.ts` (`npm run e2e:documentos`, 3 casos): menu de Documentos e rodapé sem o item a 360 e 1280 px, com capturas; página do evento sem link; 301 e a troca de endereço dentro do site.
- **Bateria:**

| Teste | Resultado |
|---|---|
| Lint | 0 erros (27 avisos antigos) |
| Tipos | ok |
| `test:db` | 1.108 + 4 |
| Responsivo | 593 (saíram as 4 capturas da página de meia-entrada) |
| Textos longos | 78 |
| Cronômetro | 8 |
| Transições | 12 |
| Cor | 8 |
| Transferência | 6 |
| Roteiro de compra, gateway fictício | 20 |

## Publicação

Não publicado. Entra na próxima publicação da fila, com o OK do responsável antes da virada.
