import { describe, it, expect } from 'vitest';
import { interpolateActa, type ActaSignerData } from './actaInterpolate';

const signer: ActaSignerData = {
  nombres: 'JUAN CARLOS',
  apellidos: 'PEREZ QUISPE',
  dni: '70115721',
  cargo: 'OPERADOR',
  area: 'MINA',
  empresa: 'AESA',
};

describe('interpolateActa', () => {
  it('reemplaza todas las variables conocidas', () => {
    const out = interpolateActa('{nombreCompleto} · {dni} · {cargo} · {area} · {empresa}', signer, '12/07/2026');
    expect(out).toBe('JUAN CARLOS PEREZ QUISPE · 70115721 · OPERADOR · MINA · AESA');
  });

  it('inserta la fecha proporcionada', () => {
    expect(interpolateActa('Firmado el {fecha}.', signer, '12/07/2026')).toBe('Firmado el 12/07/2026.');
  });

  it('deja intactas las variables desconocidas', () => {
    expect(interpolateActa('Hola {desconocida}', signer, '')).toBe('Hola {desconocida}');
  });

  it('maneja campos opcionales vacíos', () => {
    const min: ActaSignerData = { nombres: 'ANA', apellidos: 'LOPEZ', dni: '123' };
    expect(interpolateActa('{cargo}/{area}/{empresa}', min, '')).toBe('//');
  });

  it('devuelve cadena vacía si el cuerpo es vacío', () => {
    expect(interpolateActa('', signer, '12/07/2026')).toBe('');
  });
});
