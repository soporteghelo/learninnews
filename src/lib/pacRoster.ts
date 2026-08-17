/**
 * Construcción del "roster" de seguimiento de un programa PAC: une los asignados
 * por perfil/DNI (vía INGRESOS) con sus intentos registrados en PAC_RESULTADOS,
 * marcando el estado de cada persona (sin rendir / en progreso / agotó intentos /
 * aprobado). Corre 100% en el cliente, mismo patrón que buildFirmaRoster.
 */
import type { PacPrograma, PacResultado } from '../types';

export type PacRosterStatus = 'sin_intentos' | 'en_progreso' | 'agotado' | 'aprobado';

export interface PacRosterRow {
  dni: string;
  nombre: string;
  apellidos: string;
  nombres: string;
  cargo: string;
  area: string;
  empresa: string;
  correo: string;
  status: PacRosterStatus;
  intentosUsados: number;
  mejorNota: number | null;
  ultimoIntento?: PacResultado;
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

export function buildPacRoster(
  programa: PacPrograma,
  resultados: PacResultado[],
  ingresos: RosterIngreso[],
): PacRosterRow[] {
  const perfilesLower = programa.perfiles.map(p => p.toLowerCase().trim());
  const resultadosByDni = new Map<string, PacResultado[]>();
  for (const r of resultados) {
    if (r.programaId !== programa.id) continue;
    const list = resultadosByDni.get(r.dni) || [];
    list.push(r);
    resultadosByDni.set(r.dni, list);
  }

  const roster = new Map<string, PacRosterRow>();

  const statusFor = (dni: string): { status: PacRosterStatus; intentosUsados: number; mejorNota: number | null; ultimoIntento?: PacResultado } => {
    const intentos = (resultadosByDni.get(dni) || []).slice().sort((a, b) => a.intento - b.intento);
    if (intentos.length === 0) return { status: 'sin_intentos', intentosUsados: 0, mejorNota: null };
    const aprobado = intentos.some(r => r.aprobado);
    const mejorNota = intentos.reduce((max, r) => Math.max(max, r.nota), 0);
    const ultimoIntento = intentos[intentos.length - 1];
    if (aprobado) return { status: 'aprobado', intentosUsados: intentos.length, mejorNota, ultimoIntento };
    if (intentos.length >= programa.maxIntentos) return { status: 'agotado', intentosUsados: intentos.length, mejorNota, ultimoIntento };
    return { status: 'en_progreso', intentosUsados: intentos.length, mejorNota, ultimoIntento };
  };

  const addFromIngreso = (r: RosterIngreso) => {
    const dni = String(r.dni || '').trim();
    if (!dni || roster.has(dni)) return;
    const { status, intentosUsados, mejorNota, ultimoIntento } = statusFor(dni);
    roster.set(dni, {
      dni, nombre: `${r.apellidos} ${r.nombres}`.trim(), apellidos: r.apellidos, nombres: r.nombres,
      cargo: r.cargo || '', area: r.area || '', empresa: r.empresa || '', correo: r.correo || '',
      status, intentosUsados, mejorNota, ultimoIntento,
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
  programa.dnisAsignados.forEach(dniRaw => {
    const dni = String(dniRaw).trim();
    if (!dni || roster.has(dni)) return;
    const ing = ingresos.find(r => String(r.dni).trim() === dni);
    if (ing) { addFromIngreso(ing); return; }
    const { status, intentosUsados, mejorNota, ultimoIntento } = statusFor(dni);
    const ultimo = ultimoIntento;
    roster.set(dni, {
      dni, nombre: ultimo ? `${ultimo.apellidos} ${ultimo.nombres}`.trim() : dni,
      apellidos: ultimo?.apellidos || '', nombres: ultimo?.nombres || '',
      cargo: '', area: ultimo?.area || '', empresa: ultimo?.empresa || '', correo: '',
      status, intentosUsados, mejorNota, ultimoIntento,
    });
  });
  // Personas que rindieron pero ya no están en la asignación actual (se conservan igual que en firmaRoster)
  resultadosByDni.forEach((_, dni) => {
    if (roster.has(dni)) return;
    const { status, intentosUsados, mejorNota, ultimoIntento } = statusFor(dni);
    const ultimo = ultimoIntento;
    roster.set(dni, {
      dni, nombre: ultimo ? `${ultimo.apellidos} ${ultimo.nombres}`.trim() : dni,
      apellidos: ultimo?.apellidos || '', nombres: ultimo?.nombres || '',
      cargo: '', area: ultimo?.area || '', empresa: ultimo?.empresa || '', correo: '',
      status, intentosUsados, mejorNota, ultimoIntento,
    });
  });

  return Array.from(roster.values());
}
