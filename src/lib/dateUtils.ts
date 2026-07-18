/**
 * Utilidades de fecha compartidas.
 * Centraliza el parseo del formato "dd/MM/yyyy - (HH:mm:ss)" usado en INGRESOS/resultados
 * y el cálculo de semana ISO (antes duplicado en AdminPanel).
 */

/** Parsea "dd/MM/yyyy - (HH:mm:ss)" → Date, o null si no coincide. */
export function parseInicio(s: string): Date | null {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\((\d{2}):(\d{2}):(\d{2})\)/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`) : null;
}

/** Número de semana ISO 8601 de una fecha. */
export function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const y = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - y.getTime()) / 86400000) + 1) / 7);
}

/** Año de semana ISO 8601 (puede diferir del año calendario en los bordes de diciembre/enero). */
function getISOWeekYear(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  return tmp.getUTCFullYear();
}

/** Etiqueta de semana: "Semana 28 · 06 jul. – 12 jul., 2026" (rango lunes–domingo). */
export function isoWeekLabel(date: Date): string {
  const week = getISOWeek(date);
  const year = getISOWeekYear(date);
  const dow = date.getDay() || 7;
  const mon = new Date(date); mon.setDate(date.getDate() - dow + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  return `Semana ${week}  ·  ${fmt(mon)} – ${fmt(sun)}, ${year}`;
}

/** Clave ordenable "YYYY-Wnn" para agrupar por semana (o '0000-W00' sin fecha). */
export function isoWeekKey(date: Date | null): string {
  if (!date) return '0000-W00';
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}
