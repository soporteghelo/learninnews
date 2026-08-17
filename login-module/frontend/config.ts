/**
 * Configuración del módulo de login.
 * Reemplaza SHEET_ID por el de tu propia hoja y define VITE_APPS_SCRIPT_URL
 * en el .env del proyecto donde copies esta carpeta.
 */

const APPS_SCRIPT_URL = (import.meta as any).env?.VITE_APPS_SCRIPT_URL || '';
const SHEET_ID = (import.meta as any).env?.VITE_SHEET_ID || '';

export const APP_CONFIG = {
  name: 'Mi App',
  storage: {
    prefix: 'miapp_',
    keys: {
      session: 'user_session',
      knownUsers: 'known_users',
    },
  },
} as const;

export const APPS_SCRIPT_CONFIG = {
  url: APPS_SCRIPT_URL,
} as const;

// Nombre de la hoja donde se registran los usuarios (debe coincidir con
// USERS_SHEET_NAME en apps-script/Code.gs).
export const SHEETS_CONFIG = {
  sheetId: SHEET_ID,
  sheetName: 'USUARIOS',
} as const;

export function getStorageKey(key: string): string {
  return `${APP_CONFIG.storage.prefix}${key}`;
}

/**
 * URL del CSV público de la hoja (vía gviz), usada solo para el autocompletado
 * de usuarios conocidos. Requiere que la hoja esté compartida como
 * "Cualquiera con el enlace — Lector".
 */
export function getSheetUrl(sheetName: string): string {
  const cacheBust = `&_t=${Date.now()}`;
  return `https://docs.google.com/spreadsheets/d/${SHEETS_CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}${cacheBust}`;
}
