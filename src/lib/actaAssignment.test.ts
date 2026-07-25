import { describe, it, expect } from 'vitest';
import { isDocAssignedToUser, getAssignedDocs, getGeneralActaDocuments, isGeneralRowSigned, GENERAL_ACTA_ID } from './actaAssignment';
import type { ActaDocumento, ActaFirma } from '../types';

function doc(partial: Partial<ActaDocumento>): ActaDocumento {
  return {
    id: 'd1', titulo: 'Doc', descripcion: '', perfiles: [], dnisAsignados: [],
    cuerpoHtml: '', items: [], driveDocUrl: '', linkDrive: '', requiereFirmaDibujada: true, activo: true,
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

function firma(p: Partial<ActaFirma>): ActaFirma {
  return {
    id: 'f', documentoId: GENERAL_ACTA_ID, documentoTitulo: 'Acta general', dni: '', apellidos: '', nombres: '',
    cargo: '', area: '', empresa: '', correo: '', fechaFirma: '', actaPdfUrl: '', selfieUrl: '',
    firmaUrl: '', firmaAsistenciaUrl: '', correoEnviado: 'NO', dispositivo: '', documentos: [], ...p,
  };
}

describe('isGeneralRowSigned', () => {
  it('un documento agregado después de firmar no aparece como firmado (bug reportado)', () => {
    const docA = doc({ id: 'a', perfiles: ['Obrero'] });
    const user = { dni: '123', audience: ['Obrero'] };
    // El trabajador firma solo lo que tenía asignado en ese momento: docA.
    const rowsAntes = getGeneralActaDocuments([docA], user);
    const firmas: ActaFirma[] = [firma({ dni: '123', documentos: rowsAntes.map(r => r.id) })];
    expect(rowsAntes.every(r => isGeneralRowSigned(firmas, '123', r.id))).toBe(true);

    // El admin agrega un documento nuevo (docB) después de esa firma.
    const docB = doc({ id: 'b', titulo: 'Doc B', perfiles: ['Obrero'] });
    const rowsDespues = getGeneralActaDocuments([docA, docB], user);
    const rowA = rowsDespues.find(r => r.id === 'a')!;
    const rowB = rowsDespues.find(r => r.id === 'b')!;
    expect(isGeneralRowSigned(firmas, '123', rowA.id)).toBe(true);   // ya firmado
    expect(isGeneralRowSigned(firmas, '123', rowB.id)).toBe(false);  // pendiente, no firmado
  });

  it('firmas antiguas sin `documentos` (creadas antes de este campo) cubren todo lo asignado en su momento', () => {
    const docA = doc({ id: 'a', perfiles: ['Obrero'] });
    const rows = getGeneralActaDocuments([docA], { dni: '123', audience: ['Obrero'] });
    const firmas: ActaFirma[] = [firma({ dni: '123', documentos: [] })];
    expect(rows.every(r => isGeneralRowSigned(firmas, '123', r.id))).toBe(true);
  });
});
