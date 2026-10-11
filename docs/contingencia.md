# Contingência da portaria

Implementado em 03/10/2026 (Prompt 18): RF-64. Rotas `GET /api/admin/exports/events/:id/contingency.pdf` e `.csv`; aba **Contingência** na tela do evento.

> **É papel de apoio, não validação offline.** Com o sistema no ar a entrada é sempre pelo QR Code. A lista serve para conferir nome e código se a internet ou o sistema falhar. Ela não tem como saber de ingressos emitidos, cancelados ou usados depois da hora em que foi gerada.

## Conteúdo

Capa com evento, data, local, hora de geração, total a liberar por tipo e total de cancelados; depois a lista em ordem alfabética do comprador (sem depender de acento), com caixa para marcar, **código**, comprador, **CPF mascarado**, tipo e pedido. Ingressos já utilizados constam como tal. **Cancelados** ficam em seção própria: "NÃO LIBERAR A ENTRADA". Cada página traz evento, "Página X de Y" e o aviso de confidencialidade. Testado com 3.000 ingressos (todos os códigos presentes no PDF).

## Rotina recomendada (D-59)

1. **No dia anterior ao evento**, na aba Contingência, baixe e imprima o PDF. Refaça algumas horas antes da abertura se ainda houver vendas.
2. Imprima o mínimo de vias (uma por ponto de entrada) e guarde **em local fechado**, com o responsável pela portaria. Não fotografe nem envie por mensagem.
3. Durante o evento, use só se o sistema cair; marque cada entrada e cuide para o mesmo ingresso não entrar duas vezes.
4. Ao terminar, **destrua (picote) as folhas** e apague os arquivos baixados e as cópias.
5. Cada download é auditado em nome do administrador.

Dados pessoais: a lista contém nome e CPF mascarado; a base legal e o prazo de guarda seguem a política de privacidade (Prompt 19/20).
