import { Logic } from '../logic/Logic';
import type { Loose } from '../types';
import { pxQR } from '../lib/qr';
export class EmailsLogic extends Logic<Record<string, never>> {
  state: Record<string, never> = {};
  renderVals(): Loose {
    const codes = [
      ['PX-7K4M-2Q9D', 'Pista 2º lote'],
      ['PX-3HF8-Q2LA', 'Pista 2º lote'],
      ['PX-9TQ3-HW7E', 'VIP'],
    ];
    const names = [
      'Ana Souza',
      'Beatriz Lopes',
      'Camila Duarte',
      'Diego Carvalho',
      'Felipe Rocha',
      'Gabriel Nunes',
      'Isabela Farias',
      'Larissa Freitas',
      'Lucas Andrade',
      'Marina Costa',
      'Marina Costa',
      'Marina Costa',
      'Matheus Cardoso',
      'Pedro Santos',
      'Pedro Santos',
    ];
    const tps = ['Pista 2º lote', 'VIP', 'Pista Meia-entrada 2º lote', 'Camarote', 'Pista 1º lote'];
    const cps = [
      '***.184.522-**',
      '***.903.117-**',
      '***.456.789-**',
      '***.771.240-**',
      '***.338.605-**',
      '***.612.094-**',
    ];
    const cr = names.map((nm, i) => {
      const canc = i === 4;
      const code =
        nm === 'Marina Costa'
          ? codes[i - 9][0]
          : 'PX-' +
            ['A7QK', 'B2MN', 'C9RT', 'D4HX', 'E8PL', 'F3WZ', 'G6JC', 'H2KD', 'J5NV', 'K8TB', 'L3QF', 'M7RS'][i % 12] +
            '-' +
            ['2Q4X', '9TJ7', 'H3LM', 'Z8PK', 'W4CN', 'R6FD'][i % 6];
      return {
        code,
        type: nm === 'Marina Costa' ? codes[i - 9][1] : tps[i % tps.length],
        name: nm,
        cpf: nm === 'Marina Costa' ? '***.456.789-**' : cps[i % cps.length],
        st: canc ? 'CANCELADO' : '',
        strike: canc ? 'line-through' : 'none',
      };
    });
    return {
      qr1: pxQR(codes[0][0]),
      group: codes.map(([c, t], i) => ({ code: c, type: t, pos: i + 1 + ' de 3', qr: pxQR(c) })),
      headCells: ['Entrou', 'Código', 'Tipo', 'Comprador', 'CPF', 'Situação'],
      contRows: cr,
      emails: [
        {
          id: 'E01',
          name: 'Confirmação de cadastro',
          subject: 'Sua conta PartyX foi criada',
          title: 'Sua conta foi criada, Marina',
          p1: 'Agora você pode comprar ingressos dos eventos da PartyX e acessar tudo em Meus ingressos. Não é preciso confirmar este e-mail para usar a conta.',
          hasOrder: false,
          hasCta: true,
          cta: 'Ver eventos',
          p2: 'Se você não criou esta conta, fale com o atendimento da PartyX.',
        },
        {
          id: 'E02',
          name: 'Recuperação de senha',
          subject: 'Criar nova senha na PartyX',
          title: 'Crie uma nova senha',
          p1: 'Recebemos um pedido para redefinir a senha da sua conta. Use o botão abaixo para criar uma nova senha.',
          hasOrder: false,
          hasCta: true,
          cta: 'Criar nova senha',
          p2: 'O link vale por 1 hora e só pode ser usado uma vez. Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma.',
        },
        {
          id: 'E03',
          name: 'Compra confirmada',
          subject: 'Compra confirmada · Noite Neon · Pedido PX-10184',
          title: 'Seus ingressos estão prontos',
          p1: 'Pagamento aprovado em 05/10/2026 às 14:22. Emitimos 3 ingressos em nome de Marina Costa, um para cada unidade, cada um com seu próprio QR Code.',
          hasOrder: true,
          hasCta: true,
          cta: 'Acessar meus ingressos',
          p2: 'O botão abre Meus ingressos; é preciso entrar na sua conta para ver os QR Codes. Cancelamentos e reembolsos seguem a Política de Cancelamento da PartyX.',
        },
      ],
    };
  }
}
