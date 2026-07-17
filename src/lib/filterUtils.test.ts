import { describe, it, expect } from 'vitest';
import { matchNumericFilter } from './filterUtils';

describe('matchNumericFilter', () => {
  it('devuelve true cuando el filtro está vacío', () => {
    expect(matchNumericFilter(14, '', '14.0')).toBe(true);
    expect(matchNumericFilter(14, '   ', '14.0')).toBe(true);
  });

  it('soporta el comparador mayor que (>)', () => {
    expect(matchNumericFilter(15, '>14', '15.0')).toBe(true);
    expect(matchNumericFilter(14, '>14', '14.0')).toBe(false);
  });

  it('soporta menor que (<) y mayor/menor o igual (>=, <=)', () => {
    expect(matchNumericFilter(9, '<10', '9.0')).toBe(true);
    expect(matchNumericFilter(16, '>=16', '16.0')).toBe(true);
    expect(matchNumericFilter(8, '<=8', '8.0')).toBe(true);
    expect(matchNumericFilter(9, '<=8', '9.0')).toBe(false);
  });

  it('soporta igualdad (=)', () => {
    expect(matchNumericFilter(13, '=13', '13.0')).toBe(true);
    expect(matchNumericFilter(13.5, '=13', '13.5')).toBe(false);
  });

  it('acepta coma decimal', () => {
    expect(matchNumericFilter(10.5, '>10,4', '10.5')).toBe(true);
  });

  it('hace fallback a coincidencia de texto cuando no hay comparador', () => {
    expect(matchNumericFilter(87, '87', '87')).toBe(true);
    expect(matchNumericFilter(87, '9', '87')).toBe(false);
  });
});
