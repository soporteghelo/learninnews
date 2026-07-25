/**
 * Lógica compartida de asignación de Actas/Compromisos.
 * Un documento se considera asignado a un usuario si:
 *   - su audiencia (perfil) está en documento.perfiles, o
 *   - su DNI está en documento.dnisAsignados.
 * Antes esta lógica estaba duplicada en App.tsx y ActasScreen.tsx.
 */
import type { ActaDocumento, ActaItem } from '../types';

interface AssignableUser {
  dni: string;
  audience?: string[];
}

/**
 * Asignación efectiva de un item: la propia si define perfiles o DNIs, si no
 * hereda la del acta padre. Permite configurar cada documento por separado
 * dentro de una misma acta, sin obligar a redefinir la asignación en todos.
 */
export function getEffectiveAssignment(doc: ActaDocumento, item: ActaItem): { perfiles: string[]; dnisAsignados: string[] } {
  const hasOwn = (item.perfiles && item.perfiles.length > 0) || (item.dnisAsignados && item.dnisAsignados.length > 0);
  if (hasOwn) return { perfiles: item.perfiles || [], dnisAsignados: item.dnisAsignados || [] };
  return { perfiles: doc.perfiles, dnisAsignados: doc.dnisAsignados };
}

/** ¿Este documento (item) de un acta está asignado a este usuario? */
export function isItemAssignedToUser(doc: ActaDocumento, item: ActaItem, user: AssignableUser): boolean {
  if (!doc.activo) return false;
  const { perfiles, dnisAsignados } = getEffectiveAssignment(doc, item);
  const audiences = (user.audience || []).map(a => a.toLowerCase().trim());
  const dni = String(user.dni || '').trim();
  const byPerfil = perfiles.length > 0 && perfiles.some(p => audiences.includes(p.toLowerCase().trim()));
  const byDni = dnisAsignados.length > 0 && dnisAsignados.includes(dni);
  return byPerfil || byDni;
}

/** ¿El documento (activo) está asignado a este usuario? */
export function isDocAssignedToUser(d: ActaDocumento, user: AssignableUser): boolean {
  if (!d.activo) return false;
  if (d.items && d.items.length > 0) {
    // Con items: el acta se considera asignada si ALGÚN item lo está (asignación bottom-up).
    return d.items.some(it => isItemAssignedToUser(d, it, user));
  }
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

/** Texto de la declaración del acta (mostrado antes de firmar y en el PDF). */
export const ACTA_DECLARACION = 'El trabajador declara haber recibido, leído y comprendido los documentos detallados, comprometiéndose a cumplir con las disposiciones, normas y procedimientos contenidos en ellos. Asimismo, reconoce que cualquier consulta sobre su contenido puede ser absuelta por su jefatura inmediata o por el área correspondiente.';

/** Un documento (fila) dentro del acta general. */
export interface GeneralActaDoc {
  /** Id estable del renglón: `${ActaDocumento.id}::${índice del ítem}`, o el propio
   *  id del documento si no tiene ítems. Se usa para rastrear firmado/pendiente
   *  por documento (independiente de los demás), no como bloque único. */
  id: string;
  nombre: string;
  tipo: 'virtual' | 'fisico';  // marca la casilla "Digital" (virtual) o "Físico" en el acta
  driveUrl?: string;
  categoria?: 'documento' | 'capacitacion';
}

/**
 * Aplana los documentos asignados en la lista que va en el acta general.
 * Cada documento asignado con sub-ítems aporta un renglón por ítem — solo los
 * items cuya asignación efectiva (propia o heredada del acta) corresponda a
 * este usuario; si el acta no tiene ítems, el propio documento es un renglón
 * (su título). El tipo (virtual/físico) se toma del ítem; si falta, se infiere:
 * con enlace de Drive = virtual, si no = físico.
 */
export function getGeneralActaDocuments(assigned: ActaDocumento[], user: AssignableUser): GeneralActaDoc[] {
  const out: GeneralActaDoc[] = [];
  for (const d of assigned) {
    if (d.items && d.items.length > 0) {
      d.items.forEach((it, idx) => {
        if (!isItemAssignedToUser(d, it, user)) return;
        const tipo: 'virtual' | 'fisico' = it.tipo || (it.driveUrl ? 'virtual' : 'fisico');
        out.push({ id: `${d.id}::${idx}`, nombre: it.nombre, tipo, driveUrl: it.driveUrl, categoria: it.categoria });
      });
    } else {
      out.push({ id: d.id, nombre: d.titulo, tipo: d.driveDocUrl ? 'virtual' : 'fisico', driveUrl: d.driveDocUrl || undefined });
    }
  }
  return out;
}

/**
 * ¿Esta firma general cubre el renglón `targetId`? Las firmas creadas antes de
 * rastrear documentos por renglón (columna `documentos` vacía) se consideran que
 * cubren todo lo que el trabajador tenía asignado en el momento de firmar —
 * comportamiento previo, preservado para no invalidar firmas históricas.
 */
export function firmaCoversRow(f: { documentos: string[] }, targetId: string): boolean {
  return f.documentos.length === 0 || f.documentos.includes(targetId);
}

/** ¿El renglón `rowId` del acta general de este DNI ya está firmado (en cualquiera de sus firmas)? */
export function isGeneralRowSigned(
  firmas: { dni: string; documentoId: string; documentos: string[] }[],
  dni: string,
  rowId: string
): boolean {
  const d = String(dni || '').trim();
  return firmas.some(f => String(f.dni).trim() === d && f.documentoId === GENERAL_ACTA_ID && firmaCoversRow(f, rowId));
}
