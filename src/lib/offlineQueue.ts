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
  const remaining: QueuedItem[] = [];
  let sent = 0;
  for (const it of items) {
    try { await poster(it.payload); sent++; }
    catch { remaining.push(it); }
  }
  write(remaining);
  return sent;
}
