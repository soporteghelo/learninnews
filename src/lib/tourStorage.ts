/**
 * Estado del recorrido guiado, por trabajador (DNI) y por navegador.
 *
 * La marca 'done' se guarda en el localStorage del equipo donde el trabajador
 * terminó u omitió el recorrido. Como es almacenamiento local, al entrar desde
 * otro celular, otra computadora u otro navegador el recorrido vuelve a
 * mostrarse una vez: ahí el trabajador todavía no lo ha visto, y esa pantalla
 * puede verse distinta (menú, botones, tamaños).
 *
 * Sube TOUR_VERSION para volver a mostrárselo a todos (p. ej. tras un rediseño).
 */
const TOUR_VERSION = 'v1';

/** Misma clave que usa AdminPanel para su sesión autenticada. */
const ADMIN_AUTH_KEY = 'learndrive_admin_auth';

function tourKey(dni: string): string {
  return `learndrive_tour_${TOUR_VERSION}_${dni}`;
}

/** Sesión de administrador activa: el recorrido es solo para trabajadores. */
export function isAdminSession(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * ¿Hay que mostrar el recorrido a este trabajador en este navegador?
 * Sí mientras no lo haya terminado ni omitido aquí. Si el almacenamiento no
 * está disponible se responde que no, para no repetirlo en cada recarga.
 */
export function shouldShowTour(dni: string): boolean {
  if (!dni || isAdminSession()) return false;
  try {
    return localStorage.getItem(tourKey(dni)) !== 'done';
  } catch {
    return false;
  }
}

/** Recorrido terminado u omitido: no se repite en este navegador. */
export function markTourDone(dni: string): void {
  if (!dni) return;
  try {
    localStorage.setItem(tourKey(dni), 'done');
  } catch { /* ignorar */ }
}
