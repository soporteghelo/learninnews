/**
 * Filtro de columna numérica con soporte de comparadores.
 * Acepta operadores (>, <, >=, <=, =) y, como fallback, coincidencia de texto/substring.
 * Ej: ">14", "<=10", "9" (substring sobre displayStr).
 */
export function matchNumericFilter(value: number, raw: string, displayStr: string): boolean {
  const q = raw.trim().replace(',', '.');
  if (!q) return true;
  const m = q.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const n = parseFloat(m[2]);
    if (Number.isNaN(n)) return true;
    switch (m[1]) {
      case '>': return value > n;
      case '<': return value < n;
      case '>=': return value >= n;
      case '<=': return value <= n;
      case '=': return value === n;
    }
  }
  return displayStr.includes(q);
}
