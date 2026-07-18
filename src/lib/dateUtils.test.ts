import { describe, it, expect } from 'vitest';
import { parseInicio, getISOWeek, isoWeekKey, isoWeekLabel } from './dateUtils';

describe('parseInicio', () => {
  it('parsea el formato "dd/MM/yyyy - (HH:mm:ss)"', () => {
    const d = parseInicio('05/07/2026 - (18:40:08)');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6); // julio = 6
    expect(d!.getDate()).toBe(5);
    expect(d!.getHours()).toBe(18);
  });

  it('devuelve null para formatos inválidos o vacíos', () => {
    expect(parseInicio('')).toBeNull();
    expect(parseInicio('no es fecha')).toBeNull();
    expect(parseInicio(undefined as unknown as string)).toBeNull();
  });
});

describe('getISOWeek', () => {
  it('calcula la semana ISO correctamente', () => {
    // 1 de enero 2026 es jueves → semana 1
    expect(getISOWeek(new Date(2026, 0, 1))).toBe(1);
    // 6 de julio 2026 (lunes) → semana 28
    expect(getISOWeek(new Date(2026, 6, 6))).toBe(28);
  });

  it('el lunes y el domingo de la misma semana dan el mismo número', () => {
    const lunes = new Date(2026, 6, 6);
    const domingo = new Date(2026, 6, 12);
    expect(getISOWeek(lunes)).toBe(getISOWeek(domingo));
  });
});

describe('isoWeekKey', () => {
  it('genera clave ordenable YYYY-Wnn', () => {
    expect(isoWeekKey(new Date(2026, 6, 6))).toBe('2026-W28');
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01');
  });
  it('devuelve la clave centinela para null', () => {
    expect(isoWeekKey(null)).toBe('0000-W00');
  });
  it('usa el año de semana ISO (no el año calendario) en los bordes de año', () => {
    // 1 ene 2023 es domingo → pertenece a la semana 52 del año ISO 2022
    expect(isoWeekKey(new Date(2023, 0, 1))).toBe('2022-W52');
  });
});

describe('isoWeekLabel', () => {
  it('incluye el número de semana y el año', () => {
    const label = isoWeekLabel(new Date(2026, 6, 6));
    expect(label).toContain('Semana 28');
    expect(label).toContain('2026');
  });
});
