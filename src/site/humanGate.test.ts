import { describe, expect, it } from 'vitest';
import { HUMAN_INITIAL, humanGate } from './humanGate';

describe('humanGate: botão de envio com Turnstile', () => {
  it('bloqueia enquanto a tela ainda não sabe se o desafio é exigido (a janela em que o roteiro de homologação clicou cedo)', () => {
    expect(humanGate(HUMAN_INITIAL)).toEqual({ blocked: true, checking: false });
  });
  it('sem desafio exigido, libera', () => {
    expect(humanGate({ required: false, token: null, phase: 'desligado' })).toEqual({ blocked: false, checking: false });
  });
  it('widget montado e sem token: bloqueado com "Verificando…"', () => {
    expect(humanGate({ required: true, token: null, phase: 'verificando' })).toEqual({ blocked: true, checking: true });
  });
  it('token recebido: libera', () => {
    expect(humanGate({ required: true, token: 'tok', phase: 'pronto' })).toEqual({ blocked: false, checking: false });
  });
  it('falha ou prazo esgotado: continua bloqueado, sem "Verificando…" (a tela mostra "Tentar de novo")', () => {
    expect(humanGate({ required: true, token: null, phase: 'falhou' })).toEqual({ blocked: true, checking: false });
  });
});
