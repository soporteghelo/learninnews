/**
 * Construcción del "roster" de firmas de un documento de actas:
 * une los asignados por perfil (vía INGRESOS), los DNIs explícitos y las firmas ya
 * registradas, marcando el estado firmado/pendiente de cada persona.
 * Pura y memoizable (antes vivía dentro de AdminPanel).
 */
import type { ActaDocumento, ActaFirma, ActaItem } from '../types';
import { GENERAL_ACTA_ID, getEffectiveAssignment, firmaCoversRow } from './actaAssignment';

export interface FirmaRosterRow {
  dni: string;
  nombre: string;
  apellidos: string;
  nombres: string;
  cargo: string;
  area: string;
  empresa: string;
  correo: string;
  inicio: string;
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
  inicio?: string;
}

function buildRosterForAssignment(
  perfiles: string[],
  dnisAsignados: string[],
  doc: ActaDocumento,
  firmas: ActaFirma[],
  ingresos: RosterIngreso[],
  /** Ids de renglón (ver GeneralActaDoc.id) que representan a `doc` (o al ítem
   *  puntual, si se llama desde buildItemRoster). Una firma general solo cuenta
   *  para este roster si cubre alguno de estos ids — así un documento agregado
   *  después de una firma anterior no aparece como ya firmado. */
  targetIds: string[],
): FirmaRosterRow[] {
  const perfilesLower = perfiles.map(p => p.toLowerCase().trim());
  // Firmas específicas de este documento (modelo antiguo) + firmas del acta general
  // que efectivamente cubren alguno de los renglones de este documento/ítem.
  const firmasDoc = firmas.filter(f => f.documentoId === doc.id);
  const firmasGeneral = firmas.filter(f => f.documentoId === GENERAL_ACTA_ID && targetIds.some(id => firmaCoversRow(f, id)));
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
      inicio: r.inicio || '',
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
      cargo: f?.cargo || '', area: f?.area || '', empresa: f?.empresa || '', correo: f?.correo || '', inicio: '', firma: f,
    });
  });
  // Firmas de personas ya no asignadas (se conservan)
  firmasDoc.forEach(f => {
    const d = String(f.dni).trim();
    if (!roster.has(d)) roster.set(d, { dni: d, nombre: `${f.apellidos} ${f.nombres}`.trim(), apellidos: f.apellidos, nombres: f.nombres, cargo: f.cargo, area: f.area, empresa: f.empresa, correo: f.correo, inicio: '', firma: f });
  });
  return Array.from(roster.values());
}

export function buildFirmaRoster(
  doc: ActaDocumento,
  firmas: ActaFirma[],
  ingresos: RosterIngreso[],
): FirmaRosterRow[] {
  // Doc-level: cuenta como firmado si se firmó cualquiera de sus renglones (en la
  // práctica casi siempre uno solo, ya que cada documento es independiente).
  const targetIds = doc.items && doc.items.length > 0
    ? doc.items.map((_, idx) => `${doc.id}::${idx}`)
    : [doc.id];
  return buildRosterForAssignment(doc.perfiles, doc.dnisAsignados, doc, firmas, ingresos, targetIds);
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
  const idx = doc.items.indexOf(item);
  const targetId = idx !== -1 ? `${doc.id}::${idx}` : doc.id;
  return buildRosterForAssignment(perfiles, dnisAsignados, doc, firmas, ingresos, [targetId]);
}
