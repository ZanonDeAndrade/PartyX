/**
 * Identificadores fictícios de uma rodada do roteiro 11.2. Local: os nomes de sempre (banco descartável a cada rodada).
 * Homologação: o mesmo banco recebe várias rodadas, então e-mails, CPFs, códigos de promoter e nomes de evento levam o id da rodada.
 */
export interface RoteiroRun {
  id: string | null;
  admin: string;
  validador: string;
  validador2: string;
  duda: string;
  leo: string;
  /** Somado ao número de cada comprador no `cpfFor` (CPF é único no banco). */
  cpfOffset: number;
  eventName: string;
  /** `.<id>` antes do @ dos compradores; vazio no local. */
  emailTag: string;
  slugSuffix: string;
  nameSuffix: string;
}

export function roteiroRun(id?: string): RoteiroRun {
  if (!id) {
    return {
      id: null,
      admin: 'admin@exemplo.com',
      validador: 'validador@exemplo.com',
      validador2: 'validador2@exemplo.com',
      duda: 'DUDA',
      leo: 'LEO',
      cpfOffset: 0,
      eventName: 'Festival Roteiro E2E',
      emailTag: '',
      slugSuffix: '',
      nameSuffix: '',
    };
  }
  if (!/^[a-z0-9]{4,8}$/.test(id)) throw new Error('id da rodada: 4 a 8 letras minúsculas ou dígitos');
  const up = id.toUpperCase();
  return {
    id,
    admin: `admin.${id}@exemplo.com`,
    validador: `validador.${id}@exemplo.com`,
    validador2: `validador2.${id}@exemplo.com`,
    duda: `DUDA${up}`,
    leo: `LEO${up}`,
    // Até 800 milhões: cabe nos 9 dígitos-base do cpfFor junto com os números dos compradores (7001 a 7006).
    cpfOffset: (parseInt(id, 36) % 80_000_000) * 10,
    eventName: `Festival Roteiro E2E ${up}`,
    emailTag: `.${id}`,
    slugSuffix: `-${id}`,
    nameSuffix: ` ${up}`,
  };
}

/** Id novo para uma rodada em homologação (base 36 do relógio em segundos: 6 caracteres). */
export const newRunId = () => Math.floor(Date.now() / 1000).toString(36).slice(-6);
