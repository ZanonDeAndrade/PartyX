# Sugestões futuras (fora do escopo do refinamento de UI)

Itens encontrados durante o refinamento que mudam regra de servidor, contrato de API, segurança ou escopo contratado. Ficam
registrados aqui e **não** foram implementados. Nenhum é decisão do cliente; os que dependem da PartyX estão marcados.

| # | Sugestão | Por que ficou de fora | Depende de |
| --- | --- | --- | --- |
| 1 | Tela de **sessão expirada** (G05) com aviso "Sua sessão terminou. Entre de novo para continuar", em vez de cair direto no login | O site não distingue hoje "visitante" de "sessão expirada": precisa de um sinal da API (código próprio no 401) | Contrato de API |
| 2 | Tela de **manutenção/indisponibilidade** (G06) no site real (hoje só existe no protótipo) | Precisa de um modo de manutenção no servidor e de um texto de contato da PartyX, sem prometer suporte 24 horas | Servidor e PartyX (contatos, D-13) |
| 3 | Retirar `fonts.googleapis.com` e `fonts.gstatic.com` da CSP (`server/src/security/headers.ts`) | As fontes agora são servidas pelo próprio site; a liberação ficou sem uso. É mudança de cabeçalho de segurança, fora de uma etapa de UI | Revisão de segurança |
| 4 | PDF do ingresso com as fontes da marca embutidas | Exige embutir arquivos de fonte no servidor e rever o teste de caracteres fora do Latin-1; hoje usa as fontes padrão do PDF, que imprimem bem | Decisão técnica |
| 5 | Logotipo em vetor no PDF e nos e-mails | Hoje é PNG em alta resolução; aguarda o SVG/PDF da PartyX | PartyX (D-10) |
| 6 | Versão clara do PDF sem faixa preta (logo escura para impressão) | A logo de impressão disponível é branca; com a logo escura, a faixa poderia sumir e economizar tinta | Arquivo de logo |
| 7 | Barra de progresso do envio do banner com prévia recortada nas proporções reais (16:10 no cartão, 33:10 no primeiro cartão largo, 16:9 no compartilhamento) | Melhoria do formulário ADM03 que muda o fluxo de upload | Painel |
| 8 | Busca da vitrine com sugestões enquanto digita | Exige endpoint novo de sugestões | API |
| 9 | Ordenação dos ingressos válidos primeiro já na API de Meus ingressos | Hoje a ordenação por situação é feita na tela; mover para a API mantém a regra num lugar só | API |
| 10 | Brilho da tela no ingresso em tela cheia | Navegadores não permitem controlar o brilho; mantida só a orientação ao comprador | Não há API web |
| 11 | "Adicionar à carteira" (Apple Wallet, Google Wallet) | Fora do escopo (app nativo e integrações não contratados) | Escopo contratual |
| 12 | Modo escuro nos e-mails | Clientes de e-mail tratam o modo escuro de formas incompatíveis; o modelo atual usa cores sólidas que resistem à inversão automática | Teste em clientes reais |
| 13 | Pré-carregar no HTML o banner do evento em destaque (o servidor já injeta as tags de compartilhamento no `index.html`) | Na página inicial, a maior imagem (o destaque) só é conhecida depois da resposta da API: é o que segura o LCP no celular (cerca de 8 s no Lighthouse simulado). Exige mudança no servidor | Servidor |
| 14 | Versões menores do banner (por exemplo 800 px) para o celular, com `srcset` | Hoje o servidor guarda uma só largura (1600 px); o celular baixa mais do que mostra | Servidor (processamento do banner) |
