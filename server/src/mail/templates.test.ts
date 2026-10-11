import { describe, expect, it } from 'vitest';
import {
  composeCadastro,
  composeCompra,
  composeRecuperacao,
  EMAIL_LOGO_PATH,
  type MailContext,
  type PurchaseData,
} from './templates';

const ctx: MailContext = { baseUrl: 'https://partyx.exemplo.test', environmentLabel: null };
const purchase: PurchaseData = {
  name: 'Marina Costa',
  eventName: 'Noite Neon Verão',
  eventDate: '12/12/2026',
  eventTime: '22:00',
  venue: 'Arena Central',
  orderNumber: 'PX-10184',
  units: '3 ingressos',
  paidAt: '05/10/2026 às 14:22',
  lines: ['2 × Pista', '1 × VIP'],
};

describe('e-mails (RF-36, RF-67)', () => {
  it('cadastro: texto do design, botão para os eventos, sem exigir confirmação', () => {
    const m = composeCadastro({ name: 'Marina' }, ctx);
    expect(m.subject).toBe('Sua conta PartyX foi criada');
    expect(m.text).toContain('Sua conta foi criada, Marina');
    expect(m.text).toContain('Não é preciso confirmar este e-mail');
    expect(m.text).toContain('https://partyx.exemplo.test/eventos');
    expect(m.html).toContain('href="https://partyx.exemplo.test/eventos"');
  });

  it('recuperação: leva o link, informa 1 hora e uso único', () => {
    const link = 'https://partyx.exemplo.test/redefinir-senha?token=abc_DEF-123';
    const m = composeRecuperacao({ name: 'Marina', link }, ctx);
    expect(m.subject).toBe('Criar nova senha na PartyX');
    expect(m.text).toContain(link);
    expect(m.html).toContain(`href="${link}"`);
    expect(m.text).toMatch(/1 hora e só pode ser usado uma vez/);
  });

  it('compra: dados do pedido e do evento e link para Meus ingressos', () => {
    const m = composeCompra(purchase, ctx);
    expect(m.subject).toBe('Compra confirmada · Noite Neon Verão · Pedido PX-10184');
    for (const must of [
      'Noite Neon Verão',
      '12/12/2026 às 22:00',
      'Arena Central',
      'PX-10184',
      '2 × Pista',
      '1 × VIP',
      '3 ingressos',
      'Marina Costa',
    ]) {
      expect(m.text, must).toContain(must);
      expect(m.html, must).toContain(must);
    }
    expect(m.html).toContain('href="https://partyx.exemplo.test/meus-ingressos"');
    expect(m.text).toContain('é preciso entrar na sua conta para ver os QR Codes');
  });

  it('nunca leva QR, imagem, anexo nem código de ingresso: só o link seguro', () => {
    const m = composeCompra(purchase, ctx);
    // A única imagem permitida é a logo pública da marca (igual para todos, sem nada do pedido na URL).
    const logo = `<img src="${ctx.baseUrl}${EMAIL_LOGO_PATH}"`;
    expect(m.html.split(logo)).toHaveLength(2);
    expect(m.html.replace(logo, '')).not.toMatch(/<img|data:image|cid:|\.png|\.pdf|attachment/i);
    expect(m.text + m.html).not.toMatch(/PX1\.|PX-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  });

  it('escapa tudo que vem do banco no HTML (XSS) e mantém o texto puro no .txt', () => {
    const evil = composeCompra(
      { ...purchase, eventName: '<script>alert(1)</script> & "Cia"', name: '<img src=x onerror=1>', venue: "'><b>" },
      ctx,
    );
    expect(evil.html).not.toContain('<script>');
    expect(evil.html).not.toContain('<img src=x');
    expect(evil.html).not.toContain("'><b>");
    expect(evil.html).toContain('&lt;script&gt;');
    expect(evil.text).toContain('<script>alert(1)</script>'); // texto puro não interpreta HTML
    const link = composeRecuperacao({ name: 'A', link: 'https://x.test/?a=1&b="2"' }, ctx);
    expect(link.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });

  it('assunto sem quebra de linha, mesmo com nome de evento malicioso (injeção de cabeçalho)', () => {
    const m = composeCompra({ ...purchase, eventName: 'Festa\r\nBcc: alguem@mal.test' }, ctx);
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toContain('Festa Bcc: alguem@mal.test'); // vira texto, não cabeçalho
  });

  it('fora de produção o assunto ganha prefixo e o corpo avisa que é teste e que a identidade é provisória', () => {
    const hml = composeCompra(purchase, { ...ctx, environmentLabel: 'HOMOLOGAÇÃO' });
    expect(hml.subject.startsWith('[HOMOLOGAÇÃO] Compra confirmada')).toBe(true);
    expect(hml.html).toContain('E-mail de teste (HOMOLOGAÇÃO)');
    expect(hml.text).toContain('[E-mail de teste: HOMOLOGAÇÃO]');
    expect(composeCompra(purchase, ctx).html).not.toContain('E-mail de teste');
  });

  it('HTML compatível com clientes de e-mail: tabela, estilos em linha, texto alternativo e pré-cabeçalho', () => {
    const m = composeCompra(purchase, ctx);
    expect(m.html).toContain('<table role="presentation"');
    expect(m.html).toContain('lang="pt-BR"');
    expect(m.html).toContain('display:none'); // pré-cabeçalho
    expect(m.html).not.toMatch(/<style|<link |<script/i);
    expect(m.html).toMatch(/Se o botão não abrir/);
    expect(m.text.length).toBeGreaterThan(100);
  });
});
