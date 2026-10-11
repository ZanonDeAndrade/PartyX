# PartyX

Front-end do PartyX (venda de ingressos para festas) em React + TypeScript + Vite, a partir do protótipo navegável do Claude Design.

O front-end é um protótipo que roda no navegador com dados de demonstração (`src/data/seed.ts`): pagamento, e-mails e leitura de QR são simulados. A API em `server/` é a base executável do backend (saúde, configuração, validação, logs); as regras de negócio entram nos próximos prompts do plano.

## Como rodar

```bash
npm install
cp .env.example .env     # preencha só o que for usar; sem banco a API sobe mesmo assim
npm run dev              # front-end em http://localhost:5173
npm run dev:server       # API em http://localhost:8080 (o Vite faz proxy de /api)
npm test                 # testes da API (Vitest)
npm run typecheck        # tipos do front-end, da API e das configurações
npm run lint
npm run build            # tipos + build do front-end + build da API
npm start                # sobe a API servindo o front-end compilado (porta 8080)
```

Contêiner (imagem única, sem segredos):

```bash
docker build -t partyx-api .
docker run --rm -p 8080:8080 partyx-api   # http://localhost:8080 e /api/health
```

Variáveis de ambiente em `.env.example`. Estrutura e decisões em `docs/arquitetura.md`.

O protótipo fica em `/`. Em produção, o servidor precisa devolver `index.html` para `/docs`, `/docs/fundamentos` e `/docs/emails`.

## Estrutura

| Pasta | O que tem |
| --- | --- |
| `server/` | API em TypeScript (Hono): rotas, regras de domínio, banco (Drizzle) e provedores |
| `src/logic/PartyXLogic.ts` | Estado e regras: navegação, permissões por perfil, reserva, pagamento, emissão, portaria |
| `src/logic/views/*.ts` | Constroem os dados que cada tela consome (view-models) |
| `src/logic/Logic.ts` | Base com `setState` síncrono, como no protótipo |
| `src/data/seed.ts` | Clientes, equipe, eventos, ingressos e pedidos de exemplo |
| `src/screens/` | Telas (público, login, checkout, área do cliente, admin, portaria) |
| `src/components/` | Cabeçalho, rodapé, gaveta, modal, aviso e a barra de demonstração |
| `src/docs/` | Páginas de documentação do design: Fundamentos (`/docs/fundamentos`), E-mails e PDF (`/docs/emails`) e Documentação (`/docs`) |
| `src/lib/` | Formatação, CPF, QR ilustrativo, selos de status |
| `reference/` | Arquivos originais do Claude Design e os scripts usados na conversão |

## Contas de demonstração

Senha de todas: `demo1234`.

| Perfil | E-mail |
| --- | --- |
| Cliente | `marina.costa@exemplo.com` |
| Administrador | `carla.menezes@partyx.exemplo` |
| Validador | `rafael.lima@partyx.exemplo` |
| Primeiro acesso | `paulo.reis@partyx.exemplo` (senha `temp1234`) |

A barra amarela no topo troca de perfil, simula larguras de tela e abre o índice de telas e estados (`Telas e estados`). Ela não faz parte do produto.

## Observações

- O botão **Reiniciar dados** da barra de demonstração apaga o estado salvo no navegador (`localStorage`, chave `partyx-proto-nav-v1`).
- Os textos de Termos de Uso, Privacidade e Cancelamento são marcadores: o conteúdo jurídico deve ser fornecido pela PartyX.
- As telas foram geradas do template do protótipo por `reference/tools/convert-template.mjs`, e as páginas de `src/docs/` por `reference/tools/convert-docs.mjs`. O código em `src/` é a fonte daqui em diante.
