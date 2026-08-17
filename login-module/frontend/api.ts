import Papa from 'papaparse';
import { APPS_SCRIPT_CONFIG, SHEETS_CONFIG, getSheetUrl } from './config';
import type { UserRecord } from './types';

async function postToAppsScript(payload: object): Promise<{ status: string; message?: string; [key: string]: any }> {
  if (!APPS_SCRIPT_CONFIG.url) {
    throw new Error('URL de Apps Script no configurada. Define VITE_APPS_SCRIPT_URL en tu .env');
  }

  const response = await fetch(APPS_SCRIPT_CONFIG.url, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Apps Script devolvió HTML en lugar de JSON. Verifica que esté desplegado como "Aplicación web" con acceso "Cualquiera" y que hayas redeployado la última versión.');
    }
    throw new Error(`Respuesta no válida de Apps Script: ${text.substring(0, 200)}`);
  }
}

function mapUserRow(row: any): UserRecord {
  return {
    id: row.Id || '',
    dni: row.DNI || '',
    apellidos: row.Apellidos || '',
    nombres: row.Nombres || '',
    fechaRegistro: row.FechaRegistro || '',
    ultimoAcceso: row.UltimoAcceso || '',
    dispositivo: row.Dispositivo || '',
  };
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Otro';
}

/**
 * Busca un usuario por DNI sin descargar la hoja completa: el backend acota la
 * búsqueda con TextFinder a la columna DNI (ver `getUserByDni` en Code.gs).
 */
export async function fetchUserByDni(dni: string): Promise<UserRecord | null> {
  try {
    const result = await postToAppsScript({ action: 'getUserByDni', dni });
    if (result.status !== 'ok' || !result.record) return null;
    return mapUserRow(result.record);
  } catch {
    return null;
  }
}

/** Crea el registro si el DNI es nuevo, o actualiza UltimoAcceso/Dispositivo si ya existe. */
export async function registerOrUpdateUser(data: { dni: string; apellidos: string; nombres: string }): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({
      action: 'registerUser',
      usuario: {
        Id: `${data.dni}-${Date.now()}`,
        DNI: data.dni,
        Apellidos: data.apellidos,
        Nombres: data.nombres,
        UltimoAcceso: new Date().toISOString(),
        Dispositivo: getDeviceInfo(),
      },
    });
    return { success: result.status === 'ok', message: result.message || 'Registro exitoso' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

/**
 * Autocompletado de apellidos/nombres para un DNI ya conocido, vía el CSV
 * público de la hoja (gviz) en vez de Apps Script — no gasta cuota y el
 * navegador lo puede cachear. Requiere compartir la hoja como "Cualquiera con
 * el enlace — Lector". Si no quieres depender de eso, omite esta función: el
 * login sigue funcionando igual, solo sin autocompletado.
 */
export async function fetchKnownUsers(): Promise<Record<string, { apellidos: string; nombres: string }>> {
  if (!SHEETS_CONFIG.sheetId) return {};
  const url = getSheetUrl(SHEETS_CONFIG.sheetName);
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const users: Record<string, { apellidos: string; nombres: string }> = {};
          (results.data as any[]).forEach((row) => {
            const dni = String(row.DNI || '').trim();
            const ape = String(row.Apellidos || '').trim();
            const nom = String(row.Nombres || '').trim();
            if (dni && (ape || nom)) {
              users[dni] = { apellidos: ape.toUpperCase(), nombres: nom.toUpperCase() };
            }
          });
          resolve(users);
        },
        error: () => resolve({}),
      });
    });
  } catch {
    return {};
  }
}
