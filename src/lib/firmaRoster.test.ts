import { describe, it, expect } from 'vitest';
import { buildFirmaRoster } from './firmaRoster';
import type { ActaDocumento, ActaFirma } from '../types';

function doc(p: Partial<ActaDocumento>): ActaDocumento {
  return {
    id: 'd1', titulo: 'Doc', descripcion: '', perfiles: [], dnisAsignados: [],
    cuerpoHtml: '', items: [], driveDocUrl: '', linkDrive: '', requiereFirmaDibujada: true, activo: true, fechaCreacion: '', ...p,
  };
}
function firma(p: Partial<ActaFirma>): ActaFirma {
  return {
    id: 'f', documentoId: 'd1', documentoTitulo: 'Doc', dni: '', apellidos: '', nombres: '',
    cargo: '', area: '', empresa: '', correo: '', fechaFirma: '', actaPdfUrl: '', selfieUrl: '',
    firmaUrl: '', firmaAsistenciaUrl: '', correoEnviado: 'NO', dispositivo: '', ...p,
  };
}
const ingresos = [
  { dni: '111', apellidos: 'PEREZ', nombres: 'ANA', publico: 'Obrero' },
  { dni: '222', apellidos: 'GOMEZ', nombres: 'LUIS', publico: 'Conductor' },
  { dni: '333', apellidos: 'RUIZ', nombres: 'EVA', publico: 'Obrero, Empleado Mina' },
];

describe('buildFirmaRoster', () => {
  it('incluye a todos los del perfil asignado', () => {
    const roster = buildFirmaRoster(doc({ perfiles: ['Obrero'] }), [], ingresos);
    expect(roster.map(r => r.dni).sort()).toEqual(['111', '333']);
    expect(roster.every(r => !r.firma)).toBe(true);
  });

  it('marca como firmado a quien tiene firma', () => {
    const roster = buildFirmaRoster(doc({ perfiles: ['Obrero'] }), [firma({ dni: '111' })], ingresos);
    expect(roster.find(r => r.dni === '111')?.firma).toBeTruthy();
    expect(roster.find(r => r.dni === '333')?.firma).toBeUndefined();
  });

  it('agrega DNIs explícitos no cubiertos por el perfil', () => {
    const roster = buildFirmaRoster(doc({ perfiles: ['Obrero'], dnisAsignados: ['222'] }), [], ingresos);
    expect(roster.map(r => r.dni).sort()).toEqual(['111', '222', '333']);
  });

  it('no duplica personas cubiertas por perfil y DNI a la vez', () => {
    const roster = buildFirmaRoster(doc({ perfiles: ['Obrero'], dnisAsignados: ['111'] }), [], ingresos);
    expect(roster.filter(r => r.dni === '111')).toHaveLength(1);
  });

  it('conserva firmas de personas ya no asignadas', () => {
    const roster = buildFirmaRoster(doc({ perfiles: ['Conductor'] }), [firma({ dni: '999', apellidos: 'X', nombres: 'Y' })], ingresos);
    expect(roster.find(r => r.dni === '999')?.firma).toBeTruthy();
  });
});
