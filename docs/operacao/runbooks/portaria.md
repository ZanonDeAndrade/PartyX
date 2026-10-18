# Runbook: portaria no dia do evento

Responsabilidade pelo procedimento no local, equipamentos e internet é da **PartyX** (Cl. 13.1.E, 13.2). A CONTRATADA presta suporte no horário contratado; atendimento fora dele é sobreaviso, boa prática e não obrigação.

## Antes (véspera e chegada)
1. A PartyX exporta e **imprime** a lista de contingência (aba Contingência do evento, PDF), guarda em local fechado.
2. Testar a leitura **em cada aparelho, no local, com a internet do local**; ter internet de reserva (chip 4G de outra operadora).
3. Guia completo: `../../homologacao/guia-de-portaria.md`.
4. **No dia do evento, logo cedo** (responsável técnico): ligar a instância mínima, para o servidor não estar parado quando a portaria e os compradores chegarem: `CLOUDSDK_CORE_PROJECT=partyx-producao PROJECT=partyx-producao ./infra/producao/deploy.sh evento-on` (cerca de R$ 2,69 por dia; README-DEPLOY, seção 7). Conferir com `deploy.sh status` (`MIN_SERVICO` 1).

## Durante
| Situação | Ação |
|---|---|
| Câmera não lê | Busca manual por código ou nome |
| "Sem conexão com o servidor" | **Não confirmar a entrada.** Lista impressa; riscar quem entrou; o mesmo ingresso não entra duas vezes |
| Tudo lento ou fora | Plataforma indisponível? `indisponibilidade.md`; **avisar o suporte por WhatsApp** |
| Amarelo "já utilizado" contestado | O sistema mostra a hora e o validador da primeira entrada; a decisão é do responsável no local |
| Ingresso cancelado (vermelho) | Encaminhar ao atendimento da PartyX. Cancelamento e estorno são decisões dela |
| Meia-entrada | Conferência do documento é da PartyX; o sistema não verifica |

## Depois
Registrar as entradas do papel conforme combinado com a PartyX e **destruir as folhas** impressas. Anotar qualquer falha em `../registro-rotinas.md`.

**No dia seguinte ao evento** (responsável técnico): desligar a instância mínima com `CLOUDSDK_CORE_PROJECT=partyx-producao PROJECT=partyx-producao ./infra/producao/deploy.sh evento-off` e conferir no `deploy.sh status` que `MIN_SERVICO` ficou vazio. Esquecida ligada, custa cerca de R$ 81 por mês.
