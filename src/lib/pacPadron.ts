/**
 * Cruce por DNI entre el padrón de personal ACTIVO ("PERSONAL TEMPORAL") y los
 * intentos de PAC_RESULTADOS de una capacitación: dice, persona por persona, si
 * ya rindió su evaluación o todavía le falta. Corre 100% en el cliente.
 */
import type { PacPrograma, PacResultado, PersonalActivo } from '../types';
import type { PacRosterStatus } from './pacRoster';

export interface PacPadronRow extends PersonalActivo {
  status: PacRosterStatus;
  intentosUsados: number;
  mejorNota: number | null;
}

/**
 * Normaliza un DNI para comparar: solo dígitos y relleno a 8 con ceros, porque
 * Sheets suele comerse el cero inicial (p.ej. "0915366" llega como "915366").
 * Los documentos de más de 8 dígitos (carné de extranjería) se dejan tal cual.
 */
export function normalizeDni(dni: string): string {
  const raw = String(dni || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.toUpperCase();
  return digits.length < 8 ? digits.padStart(8, '0') : digits;
}

export function buildPacPadronRoster(
  programa: PacPrograma,
  resultados: PacResultado[],
  personal: PersonalActivo[],
): PacPadronRow[] {
  const intentosByDni = new Map<string, PacResultado[]>();
  for (const r of resultados) {
    if (r.programaId !== programa.id) continue;
    const key = normalizeDni(r.dni);
    const list = intentosByDni.get(key) || [];
    list.push(r);
    intentosByDni.set(key, list);
  }

  const seen = new Set<string>();
  const rows: PacPadronRow[] = [];
  for (const p of personal) {
    const key = normalizeDni(p.dni);
    if (seen.has(key)) continue; // el padrón a veces repite a la misma persona
    seen.add(key);
    const intentos = intentosByDni.get(key) || [];
    const aprobado = intentos.some(r => r.aprobado);
    const mejorNota = intentos.length > 0 ? intentos.reduce((max, r) => Math.max(max, r.nota), 0) : null;
    const status: PacRosterStatus = intentos.length === 0 ? 'sin_intentos'
      : aprobado ? 'aprobado'
      : intentos.length >= programa.maxIntentos ? 'agotado'
      : 'en_progreso';
    rows.push({ ...p, status, intentosUsados: intentos.length, mejorNota });
  }
  return rows;
}

// Partículas que forman parte de un apellido compuesto ("DE LA CRUZ", "DEL AGUILA")
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'SAN', 'SANTA', 'DA', 'DI', 'VAN', 'VON']);

/**
 * Separa "APELLIDOS Y NOMBRES" del padrón (formato peruano: paterno, materno,
 * nombres) en sus dos partes. Toma dos apellidos —cada uno con sus partículas— y
 * deja siempre al menos una palabra como nombre.
 */
export function splitApellidosNombres(completo: string): { apellidos: string; nombres: string } {
  const t = String(completo || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (t.length <= 2) return { apellidos: t[0] || '', nombres: t.slice(1).join(' ') };
  const apellidos: string[] = [];
  let i = 0;
  for (let k = 0; k < 2 && i < t.length - 1; k++) {
    const partes: string[] = [];
    while (i < t.length - 2 && PARTICULAS.has(t[i])) partes.push(t[i++]);
    partes.push(t[i++]);
    apellidos.push(partes.join(' '));
  }
  return { apellidos: apellidos.join(' '), nombres: t.slice(i).join(' ') };
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

/**
 * Devuelve la opción de `opciones` que corresponde a `valor` ignorando tildes y
 * mayúsculas ("LOGISTICA" → "LOGÍSTICA"); si no hay ninguna, el valor tal cual
 * para que el formulario lo agregue como opción extra.
 */
export function matchOpcion(valor: string, opciones: readonly string[]): string {
  const v = sinTildes(valor);
  if (!v) return '';
  return opciones.find(o => sinTildes(o) === v) || String(valor).trim().toUpperCase();
}

/**
 * Intento que representa a cada participante en el registro de asistencia (F62):
 * el primer intento aprobado o, si no aprobó, el último. Uno por DNI, ordenados
 * por apellidos.
 */
export function pickIntentosParaRegistro(programaId: string, resultados: PacResultado[]): PacResultado[] {
  const porDni = new Map<string, PacResultado[]>();
  for (const r of resultados) {
    if (r.programaId !== programaId) continue;
    const key = normalizeDni(r.dni);
    porDni.set(key, [...(porDni.get(key) || []), r]);
  }
  return Array.from(porDni.values())
    .map(intentos => {
      const orden = intentos.slice().sort((a, b) => a.intento - b.intento);
      return orden.find(r => r.aprobado) || orden[orden.length - 1];
    })
    .sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, 'es'));
}
