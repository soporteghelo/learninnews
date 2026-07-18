/**
 * Cola de escrituras offline (localStorage).
 * Para acciones idempotentes y pequeñas (progreso de quiz, resultado de eval corta):
 * si la petición falla por falta de red, se encola y se reintenta al recuperar conexión.
 * El backend ya es anti-duplicado por (evaluación/documento + DNI), así que el reintento es seguro.
 */
const KEY = 'ldc_offline_queue';
const MAX_ITEMS = 100;

interface QueuedItem { id: string; payload: object; ts: number; }

function read(): QueuedItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(items: QueuedItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_ITEMS))); } catch { /* storage lleno */ }
}

export function enqueueWrite(payload: object): void {
  const items = read();
  items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, payload, ts: Date.now() });
  write(items);
}

export function pendingWriteCount(): number {
  return read().length;
}

/** Reintenta todas las escrituras pendientes usando `poster`. Devuelve cuántas se enviaron. */
export async function flushQueue(poster: (payload: object) => Promise<unknown>): Promise<number> {
  const items = read();
  if (!items.length) return 0;
  // Se marca por id lo enviado en vez de escribir un snapshot al final: mientras esperamos
  // cada `poster`, otro código puede encolar un nuevo item (enqueueWrite) — si sobrescribiéramos
  // el storage con el snapshot inicial, ese item nuevo se perdería silenciosamente.
  const sentIds = new Set<string>();
  for (const it of items) {
    try { await poster(it.payload); sentIds.add(it.id); }
    catch { /* se mantiene en cola para el próximo intento */ }
  }
  if (sentIds.size > 0) {
    write(read().filter(it => !sentIds.has(it.id)));
  }
  return sentIds.size;
}
