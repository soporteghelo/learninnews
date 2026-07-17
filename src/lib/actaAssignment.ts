/**
 * Lógica compartida de asignación de Actas/Compromisos.
 * Un documento se considera asignado a un usuario si:
 *   - su audiencia (perfil) está en documento.perfiles, o
 *   - su DNI está en documento.dnisAsignados.
 * Antes esta lógica estaba duplicada en App.tsx y ActasScreen.tsx.
 */
import type { ActaDocumento } from '../types';

interface AssignableUser {
  dni: string;
  audience?: string[];
}

/** ¿El documento (activo) está asignado a este usuario? */
export function isDocAssignedToUser(d: ActaDocumento, user: AssignableUser): boolean {
  if (!d.activo) return false;
  const audiences = (user.audience || []).map(a => a.toLowerCase().trim());
  const dni = String(user.dni || '').trim();
  const byPerfil = d.perfiles.length > 0 && d.perfiles.some(p => audiences.includes(p.toLowerCase().trim()));
  const byDni = d.dnisAsignados.length > 0 && d.dnisAsignados.includes(dni);
  return byPerfil || byDni;
}

/** Documentos asignados al usuario. */
export function getAssignedDocs(documentos: ActaDocumento[], user: AssignableUser): ActaDocumento[] {
  return documentos.filter(d => isDocAssignedToUser(d, user));
}

// =============================================
// ACTA GENERAL (una sola acta por trabajador que reúne todos sus documentos)
// =============================================

/** ID/título sintéticos de la única acta general que firma cada trabajador. */
export const GENERAL_ACTA_ID = 'ACTA_GENERAL';
export const GENERAL_ACTA_TITULO = 'Acta de Recepción de Documentos';

/** Un documento (fila) dentro del acta general. */
export interface GeneralActaDoc {
  nombre: string;
  tipo: 'virtual' | 'fisico';  // marca la casilla "Digital" (virtual) o "Físico" en el acta
  driveUrl?: string;
}

/**
 * Aplana los documentos asignados en la lista que va en el acta general.
 * Cada documento asignado con sub-ítems aporta un renglón por ítem; si no tiene
 * ítems, el propio documento es un renglón (su título). El tipo (virtual/físico)
 * se toma del ítem; si falta, se infiere: con enlace de Drive = virtual, si no = físico.
 */
export function getGeneralActaDocuments(assigned: ActaDocumento[]): GeneralActaDoc[] {
  const out: GeneralActaDoc[] = [];
  for (const d of assigned) {
    if (d.items && d.items.length > 0) {
      for (const it of d.items) {
        const tipo: 'virtual' | 'fisico' = it.tipo || (it.driveUrl ? 'virtual' : 'fisico');
        out.push({ nombre: it.nombre, tipo, driveUrl: it.driveUrl });
      }
    } else {
      out.push({ nombre: d.titulo, tipo: d.driveDocUrl ? 'virtual' : 'fisico', driveUrl: d.driveDocUrl || undefined });
    }
  }
  return out;
}

/** ¿El trabajador ya firmó su acta general? */
export function hasSignedGeneralActa(firmas: { dni: string; documentoId: string }[], dni: string): boolean {
  const d = String(dni || '').trim();
  return firmas.some(f => String(f.dni).trim() === d && f.documentoId === GENERAL_ACTA_ID);
}
