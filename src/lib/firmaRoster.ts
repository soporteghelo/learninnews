/**
 * Construcción del "roster" de firmas de un documento de actas:
 * une los asignados por perfil (vía INGRESOS), los DNIs explícitos y las firmas ya
 * registradas, marcando el estado firmado/pendiente de cada persona.
 * Pura y memoizable (antes vivía dentro de AdminPanel).
 */
import type { ActaDocumento, ActaFirma, ActaItem } from '../types';
import { GENERAL_ACTA_ID, getEffectiveAssignment } from './actaAssignment';

export interface FirmaRosterRow {
  dni: string;
  nombre: string;
  apellidos: string;
  nombres: string;
  cargo: string;
  area: string;
  empresa: string;
  correo: string;
  firma?: ActaFirma;
}

interface RosterIngreso {
  dni: string;
  apellidos: string;
  nombres: string;
  cargo?: string;
  area?: string;
  empresa?: string;
  correo?: string;
  publico?: string;
}

function buildRosterForAssignment(
  perfiles: string[],
  dnisAsignados: string[],
  doc: ActaDocumento,
  firmas: ActaFirma[],
  ingresos: RosterIngreso[],
): FirmaRosterRow[] {
  const perfilesLower = perfiles.map(p => p.toLowerCase().trim());
  // Firmas específicas de este documento (modelo antiguo) + firma del acta general.
  // Una persona que firmó su acta general se considera firmante de todos sus documentos.
  const firmasDoc = firmas.filter(f => f.documentoId === doc.id);
  const firmasGeneral = firmas.filter(f => f.documentoId === GENERAL_ACTA_ID);
  const firmaByDni = new Map<string, ActaFirma>();
  for (const f of firmasDoc) firmaByDni.set(String(f.dni).trim(), f);
  for (const f of firmasGeneral) { const d = String(f.dni).trim(); if (!firmaByDni.has(d)) firmaByDni.set(d, f); }
  const roster = new Map<string, FirmaRosterRow>();

  const addFromIngreso = (r: RosterIngreso) => {
    const dni = String(r.dni || '').trim();
    if (!dni || roster.has(dni)) return;
    roster.set(dni, {
      dni, nombre: `${r.apellidos} ${r.nombres}`.trim(), apellidos: r.apellidos, nombres: r.nombres,
      cargo: r.cargo || '', area: r.area || '', empresa: r.empresa || '', correo: r.correo || '',
      firma: firmaByDni.get(dni),
    });
  };

  // Por perfil (audiencia)
  if (perfilesLower.length > 0) {
    ingresos.forEach(r => {
      const auds = String(r.publico || '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
      if (auds.some(a => perfilesLower.includes(a))) addFromIngreso(r);
    });
  }
  // Por DNI explícito
  dnisAsignados.forEach(dni => {
    const d = String(dni).trim();
    if (!d || roster.has(d)) return;
    const ing = ingresos.find(r => String(r.dni).trim() === d);
    if (ing) { addFromIngreso(ing); return; }
    const f = firmaByDni.get(d);
    roster.set(d, {
      dni: d, nombre: f ? `${f.apellidos} ${f.nombres}`.trim() : d, apellidos: f?.apellidos || '', nombres: f?.nombres || '',
      cargo: f?.cargo || '', area: f?.area || '', empresa: f?.empresa || '', correo: f?.correo || '', firma: f,
    });
  });
  // Firmas de personas ya no asignadas (se conservan)
  firmasDoc.forEach(f => {
    const d = String(f.dni).trim();
    if (!roster.has(d)) roster.set(d, { dni: d, nombre: `${f.apellidos} ${f.nombres}`.trim(), apellidos: f.apellidos, nombres: f.nombres, cargo: f.cargo, area: f.area, empresa: f.empresa, correo: f.correo, firma: f });
  });
  return Array.from(roster.values());
}

export function buildFirmaRoster(
  doc: ActaDocumento,
  firmas: ActaFirma[],
  ingresos: RosterIngreso[],
): FirmaRosterRow[] {
  return buildRosterForAssignment(doc.perfiles, doc.dnisAsignados, doc, firmas, ingresos);
}

/** Roster de firmas de UN documento (item) dentro de un acta, usando su asignación
 *  efectiva (propia si la define, si no la heredada del acta padre). */
export function buildItemRoster(
  doc: ActaDocumento,
  item: ActaItem,
  firmas: ActaFirma[],
  ingresos: RosterIngreso[],
): FirmaRosterRow[] {
  const { perfiles, dnisAsignados } = getEffectiveAssignment(doc, item);
  return buildRosterForAssignment(perfiles, dnisAsignados, doc, firmas, ingresos);
}
