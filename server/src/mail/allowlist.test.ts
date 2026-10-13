import { describe, expect, it } from 'vitest';
import { invalidAllowlistItems, isRecipientAllowed, parseEmailAllowlist } from './allowlist';

describe('EMAIL_ALLOWLIST: destinatários permitidos em homologação', () => {
  const list = parseEmailAllowlist(' Pessoa@Dominio.com , *@equipe.partyx.test,outra@gmail.com ');

  it('lê endereços exatos e domínios, sem diferenciar maiúsculas nem espaços', () => {
    expect(list).toEqual(['pessoa@dominio.com', '*@equipe.partyx.test', 'outra@gmail.com']);
  });
  it('endereço exato e qualquer endereço do domínio liberado passam', () => {
    expect(isRecipientAllowed(list, 'pessoa@dominio.com')).toBe(true);
    expect(isRecipientAllowed(list, 'PESSOA@DOMINIO.COM')).toBe(true);
    expect(isRecipientAllowed(list, 'qualquer.um@equipe.partyx.test')).toBe(true);
    expect(isRecipientAllowed(list, 'Outra Pessoa <outra@gmail.com>')).toBe(true);
  });
  it('fora da lista não passa: outro endereço do mesmo provedor, subdomínio, domínio parecido', () => {
    expect(isRecipientAllowed(list, 'vizinho@gmail.com')).toBe(false);
    expect(isRecipientAllowed(list, 'ana@dominio.com')).toBe(false);
    expect(isRecipientAllowed(list, 'ana@sub.equipe.partyx.test')).toBe(false);
    expect(isRecipientAllowed(list, 'ana@equipe.partyx.test.invasor.com')).toBe(false);
    expect(isRecipientAllowed(list, 'ana@partyx.test')).toBe(false);
    expect(isRecipientAllowed(list, 'sem-arroba')).toBe(false);
  });
  it('sem lista (produção), todo mundo recebe', () => {
    expect(isRecipientAllowed(null, 'qualquer@lugar.com')).toBe(true);
    expect(isRecipientAllowed(undefined, 'qualquer@lugar.com')).toBe(true);
  });
  it('recusa lista vazia e itens malformados, apontando a posição sem repetir o valor', () => {
    expect(invalidAllowlistItems('')).toEqual([1]);
    expect(invalidAllowlistItems(' , ')).toEqual([1]);
    expect(invalidAllowlistItems('a@b.com,@gmail.com,*@,*gmail.com,a@b,ok@x.io')).toEqual([2, 3, 4, 5]);
    expect(invalidAllowlistItems('*@*.com')).toEqual([1]);
    expect(() => parseEmailAllowlist('a@b.com,nada')).toThrow(/item 2/);
    expect(() => parseEmailAllowlist('a@b.com,segredo-x')).not.toThrow(/segredo-x/);
  });
});
