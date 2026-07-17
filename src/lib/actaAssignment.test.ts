import { describe, it, expect } from 'vitest';
import { isDocAssignedToUser, getAssignedDocs } from './actaAssignment';
import type { ActaDocumento } from '../types';

function doc(partial: Partial<ActaDocumento>): ActaDocumento {
  return {
    id: 'd1', titulo: 'Doc', descripcion: '', perfiles: [], dnisAsignados: [],
    cuerpoHtml: '', items: [], driveDocUrl: '', requiereFirmaDibujada: true, activo: true,
    fechaCreacion: '', ...partial,
  };
}

describe('isDocAssignedToUser', () => {
  it('asigna por perfil (audiencia)', () => {
    const d = doc({ perfiles: ['Obrero', 'Empleado Mina'] });
    expect(isDocAssignedToUser(d, { dni: '1', audience: ['Obrero'] })).toBe(true);
    expect(isDocAssignedToUser(d, { dni: '1', audience: ['Conductor'] })).toBe(false);
  });

  it('la comparación de perfil es insensible a mayúsculas', () => {
    const d = doc({ perfiles: ['Empleado Mina'] });
    expect(isDocAssignedToUser(d, { dni: '1', audience: ['empleado mina'] })).toBe(true);
  });

  it('asigna por DNI explícito', () => {
    const d = doc({ dnisAsignados: ['70115721'] });
    expect(isDocAssignedToUser(d, { dni: '70115721', audience: [] })).toBe(true);
    expect(isDocAssignedToUser(d, { dni: '999', audience: [] })).toBe(false);
  });

  it('no asigna documentos inactivos', () => {
    const d = doc({ perfiles: ['Obrero'], activo: false });
    expect(isDocAssignedToUser(d, { dni: '1', audience: ['Obrero'] })).toBe(false);
  });

  it('no asigna si no hay perfiles ni DNIs (sin asignación)', () => {
    const d = doc({});
    expect(isDocAssignedToUser(d, { dni: '1', audience: ['Obrero'] })).toBe(false);
  });
});

describe('getAssignedDocs', () => {
  it('filtra solo los documentos asignados', () => {
    const docs = [
      doc({ id: 'a', perfiles: ['Obrero'] }),
      doc({ id: 'b', dnisAsignados: ['123'] }),
      doc({ id: 'c', perfiles: ['Conductor'] }),
      doc({ id: 'd', perfiles: ['Obrero'], activo: false }),
    ];
    const result = getAssignedDocs(docs, { dni: '123', audience: ['Obrero'] });
    expect(result.map(d => d.id).sort()).toEqual(['a', 'b']);
  });
});
