import { describe, it, expect } from 'vitest';
import { buildPacPadronRoster, normalizeDni, splitApellidosNombres, matchOpcion, pickIntentosParaRegistro } from './pacPadron';
import type { PacPrograma, PacResultado, PersonalActivo } from '../types';

const programa = { id: 'pac_1', maxIntentos: 2 } as PacPrograma;

function persona(dni: string): PersonalActivo {
  return { dni, nombre: `P ${dni}`, estado: 'ACTIVO', empresa: 'AESA', guardia: 'A', cargo: '', area: '', categoria: '', correo: '', celular: '' };
}
function intento(dni: string, n: number, aprobado: boolean, programaId = 'pac_1'): PacResultado {
  return { programaId, dni, intento: n, aprobado, nota: aprobado ? 16 : 10 } as PacResultado;
}

describe('normalizeDni', () => {
  it('rellena con ceros los DNI a los que Sheets les quitó el cero inicial', () => {
    expect(normalizeDni('915366')).toBe('00915366');
    expect(normalizeDni(' 43179403 ')).toBe('43179403');
  });
  it('respeta documentos de más de 8 dígitos', () => {
    expect(normalizeDni('001234567')).toBe('001234567');
  });
});

describe('buildPacPadronRoster', () => {
  it('marca el estado de cada activo según sus intentos en esta capacitación', () => {
    const rows = buildPacPadronRoster(
      programa,
      [
        intento('11111111', 1, true),
        intento('22222222', 1, false),
        intento('33333333', 1, false), intento('33333333', 2, false),
        intento('44444444', 1, true, 'otro_pac'),
      ],
      ['11111111', '22222222', '33333333', '44444444'].map(persona),
    );
    const byDni = Object.fromEntries(rows.map(r => [r.dni, r.status]));
    expect(byDni).toEqual({
      '11111111': 'aprobado',
      '22222222': 'en_progreso',
      '33333333': 'agotado',
      '44444444': 'sin_intentos', // rindió otra capacitación, no esta
    });
  });

  it('cruza aunque el DNI venga sin el cero inicial en una de las dos hojas', () => {
    const [row] = buildPacPadronRoster(programa, [intento('00915366', 1, true)], [persona('915366')]);
    expect(row.status).toBe('aprobado');
  });

  it('no duplica a una persona repetida en el padrón', () => {
    expect(buildPacPadronRoster(programa, [], [persona('1'), persona('00000001')])).toHaveLength(1);
  });
});

describe('splitApellidosNombres', () => {
  it('separa dos apellidos y los nombres', () => {
    expect(splitApellidosNombres('PEÑA LEON DAVID RAFAEL')).toEqual({ apellidos: 'PEÑA LEON', nombres: 'DAVID RAFAEL' });
    expect(splitApellidosNombres('LAZO LAZO JOISY')).toEqual({ apellidos: 'LAZO LAZO', nombres: 'JOISY' });
  });
  it('respeta apellidos compuestos con partículas', () => {
    expect(splitApellidosNombres('DE LA CRUZ GONZALES EDINSON JAVIER')).toEqual({ apellidos: 'DE LA CRUZ GONZALES', nombres: 'EDINSON JAVIER' });
  });
  it('deja siempre al menos un nombre', () => {
    expect(splitApellidosNombres('PEREZ JUAN')).toEqual({ apellidos: 'PEREZ', nombres: 'JUAN' });
  });
});

describe('matchOpcion', () => {
  it('empareja ignorando tildes y si no existe devuelve el valor', () => {
    expect(matchOpcion('LOGISTICA', ['AVANCES', 'LOGÍSTICA'])).toBe('LOGÍSTICA');
    expect(matchOpcion('cable bolting', ['AVANCES'])).toBe('CABLE BOLTING');
    expect(matchOpcion('', ['A'])).toBe('');
  });
});

describe('pickIntentosParaRegistro', () => {
  it('toma el primer intento aprobado, o el último si nunca aprobó, uno por DNI', () => {
    const r = (dni: string, intentoN: number, aprobado: boolean, apellidos: string) =>
      ({ ...intento(dni, intentoN, aprobado), apellidos, nombres: '' }) as PacResultado;
    const elegidos = pickIntentosParaRegistro('pac_1', [
      r('2', 1, false, 'ZAPATA'), r('2', 2, true, 'ZAPATA'), r('2', 3, true, 'ZAPATA'),
      r('1', 1, false, 'ARIAS'), r('1', 2, false, 'ARIAS'),
      { ...r('3', 1, true, 'BAZAN'), programaId: 'otro' },
    ]);
    expect(elegidos.map(e => [e.apellidos, e.intento])).toEqual([['ARIAS', 2], ['ZAPATA', 2]]);
  });
});
