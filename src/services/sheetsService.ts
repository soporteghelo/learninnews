import Papa from 'papaparse';
import { SHEETS_CONFIG, MOCK_DATA_CONFIG, getSheetUrl, APPS_SCRIPT_CONFIG, APP_CONFIG, ADMIN_CONFIG } from '../config/app.config';
import type { LearnTopic, DataChunk, QuizQuestion, UserProgress, AppDynamicConfig, QuizSavedProgress } from '../types';
import { enqueueWrite, flushQueue } from '../lib/offlineQueue';

/** Reintenta las escrituras encoladas offline (progreso/eval) usando el proxy de Apps Script. */
export async function flushOfflineQueue(): Promise<number> {
  return flushQueue((payload) => postToAppsScript(payload as object));
}

// =============================================
// CACHE - 30s TTL fresh, 10min stale-while-revalidate
// =============================================
const SHEET_CACHE_TTL = 30 * 1000;       // 30s — considered fresh
const SHEET_CACHE_STALE_TTL = 10 * 60 * 1000; // 10min — max age before forced re-fetch

function getSheetCache<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(`ldc_cache_${key}`);
    if (!item) return null;
    const { data, ts } = JSON.parse(item);
    if (Date.now() - ts < SHEET_CACHE_TTL) return data as T;
    return null;
  } catch { return null; }
}

/** Returns cached data even if expired (up to STALE_TTL). Used for stale-while-revalidate. */
export function getStaleCachedSheetData<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(`ldc_cache_${key}`);
    if (!item) return null;
    const { data, ts } = JSON.parse(item);
    if (Date.now() - ts < SHEET_CACHE_STALE_TTL) return data as T;
    return null;
  } catch { return null; }
}

function setSheetCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`ldc_cache_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* cuota llena */ }
}

export function clearSheetCache(key: 'topics' | 'chunks' | 'quiz' | 'all'): void {
  if (key === 'all') {
    ['topics', 'chunks', 'quiz'].forEach(k => localStorage.removeItem(`ldc_cache_${k}`));
  } else {
    localStorage.removeItem(`ldc_cache_${key}`);
  }
}

// =============================================
// HELPER: POST to Apps Script (handles redirects)
// =============================================

async function postToAppsScript(payload: object): Promise<{ status: string; message: string }> {
  if (!APPS_SCRIPT_CONFIG.url) {
    throw new Error('URL de Apps Script no configurada. Define VITE_APPS_SCRIPT_URL en .env');
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
    // Apps Script may return HTML if not deployed correctly
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Apps Script devolvió HTML en lugar de JSON. Verifica que el script esté desplegado como "Aplicación web" con acceso "Cualquiera" y que hayas redeployado la última versión.');
    }
    throw new Error(`Respuesta no válida de Apps Script: ${text.substring(0, 200)}`);
  }
}

// =============================================
// FETCH LEARN TOPICS (Tabla Padre)
// =============================================

export async function fetchLearnTopics(force = false): Promise<LearnTopic[]> {
  if (!force) {
    const cached = getSheetCache<LearnTopic[]>('topics');
    if (cached) return cached;
  }
  const url = getSheetUrl(SHEETS_CONFIG.sheets.learn);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const topics: LearnTopic[] = results.data
            .filter((row: any) => row.Id && row.Titulo)
            .map((row: any) => ({
              id: (row.Id || '').trim(),
              title: row.Titulo,
              audience: row.Publico || '',
              details: row.Detalles || '',
              summary: row.Resumen || '',
              keyPoints: row.PuntosClave
                ? row.PuntosClave.split('|').map((p: string) => p.trim()).filter(Boolean)
                : [],
              order: row.Orden ? parseInt(row.Orden, 10) : 999,
              active: row.Activo ? row.Activo.toUpperCase() === 'SI' : true,
            }));
          const sorted = topics.sort((a, b) => (a.order || 999) - (b.order || 999));
          setSheetCache('topics', sorted);
          resolve(sorted);
        },
        error: () => {
          console.warn('Error parsing LEARN CSV, using mock data');
          resolve(getMockTopics());
        },
      });
    });
  } catch (error) {
    console.warn('Error fetching LEARN sheet:', error);
    if (MOCK_DATA_CONFIG.enabled) return getMockTopics();
    return [];
  }
}

// =============================================
// WRITE TOPIC TO SHEETS (via Apps Script)
// =============================================

export async function saveTopicToSheets(
  topics: LearnTopic[]
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({
      action: 'upsertTopic',
      topics: topics.map((t) => ({
        Id: t.id,
        Titulo: t.title,
        Publico: t.audience,
        Detalles: t.details,
        Resumen: t.summary || '',
        PuntosClave: t.keyPoints ? t.keyPoints.filter(Boolean).join('|') : '',
        Orden: t.order || 999,
        Activo: t.active ? 'SI' : 'NO',
      })),
    });
    return {
      success: result.status === 'ok',
      message: result.message || 'Temas guardados correctamente',
    };
  } catch (error) {
    console.error('Error saving topics to Sheets:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

export async function deleteTopicFromSheets(
  topicIds: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({ action: 'deleteTopic', topicIds });
    return {
      success: result.status === 'ok',
      message: result.message || 'Temas eliminados correctamente',
    };
  } catch (error) {
    console.error('Error deleting topic from Sheets:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

// =============================================
// FETCH DATA CHUNKS (Contenido Educativo)
// =============================================

export async function fetchDataChunks(force = false): Promise<DataChunk[]> {
  if (!force) {
    const cached = getSheetCache<DataChunk[]>('chunks');
    if (cached) return cached;
  }
  const url = getSheetUrl(SHEETS_CONFIG.sheets.data);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const chunks: DataChunk[] = results.data
            .filter((row: any) => row.Cod && row.IdMain)
            .map((row: any) => ({
              cod: (row.Cod || '').trim(),
              idMain: (row.IdMain || '').trim(),
              tema: row.Tema || '',
              contenido: row.Contenido || '',
              videos: [row.Video_1, row.Video_2, row.Video_3].filter((v: string) => v && v.trim()),
              comentarioVideo: row.ComentarioVideo || '',
              pdf: row.PDF || '',
              contexto: row.Contexto || '',
              order: row.Orden ? parseInt(row.Orden, 10) : 999,
            }));
          const sorted = chunks.sort((a, b) => (a.order || 999) - (b.order || 999));
          setSheetCache('chunks', sorted);
          resolve(sorted);
        },
        error: () => {
          console.warn('Error parsing DATA CSV, using mock data');
          resolve(getMockChunks());
        },
      });
    });
  } catch (error) {
    console.warn('Error fetching DATA sheet:', error);
    if (MOCK_DATA_CONFIG.enabled) return getMockChunks();
    return [];
  }
}

// =============================================
// FETCH QUIZ QUESTIONS (Evaluaciones)
// =============================================

export async function fetchQuizQuestions(force = false): Promise<QuizQuestion[]> {
  if (!force) {
    const cached = getSheetCache<QuizQuestion[]>('quiz');
    if (cached) return cached;
  }

  // Always prefer Apps Script proxy over gviz/tq — Google's gviz/tq has server-side caching
  // that ignores cache-busters and can return stale data for hours after sheet changes.
  // Apps Script reads the sheet directly with no HTTP caching layer.
  if (APPS_SCRIPT_CONFIG.url) {
    try {
      const result = await postToAppsScript({ action: 'getQuizData' }) as any;
      if (result.status === 'ok' && Array.isArray(result.questions)) {
        const questions: QuizQuestion[] = (result.questions as any[])
          .filter((row) => row.IdQuiz && row.IdMain && row.Pregunta)
          .map((row) => ({
            idQuiz: (row.IdQuiz || '').trim(),
            idMain: (row.IdMain || '').trim(),
            question: row.Pregunta,
            optionA: row.OpcionA || '',
            optionB: row.OpcionB || '',
            optionC: row.OpcionC || '',
            optionD: row.OpcionD || '',
            correctAnswer: (row.RespuestaCorrecta || 'A') as 'A' | 'B' | 'C' | 'D',
            explanation: row.Explicacion || '',
            difficulty: (row.Dificultad || 'Media') as 'Fácil' | 'Media' | 'Difícil',
            categoriaContenido: row.Categoria_contenido || '',
          }));
        setSheetCache('quiz', questions);
        return questions;
      }
    } catch (error) {
      console.warn('Apps Script proxy for quiz failed, falling back to gviz/tq:', error);
    }
  }

  const url = getSheetUrl(SHEETS_CONFIG.sheets.quiz);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let csvText = await response.text();

    // Fix corrupted CSV: if header row contains embedded newlines (data merged into headers),
    // sanitize by extracting only the actual header name (first word before space/newline)
    const lines = csvText.split('\n');
    if (lines.length > 0) {
      const headerLine = lines[0];
      // Detect corruption: header cells contain spaces that shouldn't be there
      // e.g. "IdQuiz NEW-123 NEW-456" instead of "IdQuiz"
      const headerCells = headerLine.match(/"[^"]*"|[^,]+/g) || [];
      const hasCorruption = headerCells.some((cell: string) => {
        const clean = cell.replace(/^"|"$/g, '');
        return clean.includes(' ') && /^(IdQuiz|IdMain|Pregunta|Opcion[ABCD]|RespuestaCorrecta|Explicacion|Dificultad)\s/.test(clean);
      });

      if (hasCorruption) {
        console.warn('QUIZ CSV has corrupted header row, attempting recovery...');
        // The header row contains all data merged with newlines inside cells
        // Extract the proper header names
        const properHeaders = '"IdQuiz","IdMain","Pregunta","OpcionA","OpcionB","OpcionC","OpcionD","RespuestaCorrecta","Explicacion","Dificultad","Categoria_contenido"';
        // Remove the corrupted first line and prepend clean headers
        csvText = properHeaders + '\n' + lines.slice(1).join('\n');
      }
    }

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const questions: QuizQuestion[] = results.data
            .filter((row: any) => row.IdQuiz && row.IdMain && row.Pregunta)
            .map((row: any) => ({
              idQuiz: (row.IdQuiz || '').trim(),
              idMain: (row.IdMain || '').trim(),
              question: row.Pregunta,
              optionA: row.OpcionA || '',
              optionB: row.OpcionB || '',
              optionC: row.OpcionC || '',
              optionD: row.OpcionD || '',
              correctAnswer: (row.RespuestaCorrecta || 'A') as 'A' | 'B' | 'C' | 'D',
              explanation: row.Explicacion || '',
              difficulty: (row.Dificultad || 'Media') as 'Fácil' | 'Media' | 'Difícil',
              categoriaContenido: row.Categoria_contenido || row.categoriaContenido || '',
            }));
          setSheetCache('quiz', questions);
          resolve(questions);
        },
        error: () => {
          console.warn('Error parsing QUIZ CSV, using mock data');
          resolve(getMockQuiz());
        },
      });
    });
  } catch (error) {
    console.warn('Error fetching QUIZ sheet:', error);
    if (MOCK_DATA_CONFIG.enabled) return getMockQuiz();
    return [];
  }
}

// =============================================
// WRITE QUIZ TO SHEETS (via Apps Script)
// =============================================

export async function saveQuizToSheets(
  questions: QuizQuestion[],
  courseId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({
      action: 'upsertQuiz',
      courseId,
      questions: questions.map((q) => ({
        IdQuiz: q.idQuiz,
        IdMain: q.idMain,
        Pregunta: q.question,
        OpcionA: q.optionA,
        OpcionB: q.optionB,
        OpcionC: q.optionC,
        OpcionD: q.optionD,
        RespuestaCorrecta: q.correctAnswer,
        Explicacion: q.explanation,
        Dificultad: q.difficulty,
        Categoria_contenido: q.categoriaContenido || '',
      })),
    });
    return {
      success: result.status === 'ok',
      message: result.message || 'Preguntas guardadas correctamente',
    };
  } catch (error) {
    console.error('Error saving to Sheets:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

export async function deleteQuizFromSheets(
  quizIds: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({ action: 'deleteQuiz', quizIds });
    return {
      success: result.status === 'ok',
      message: result.message || 'Preguntas eliminadas correctamente',
    };
  } catch (error) {
    console.error('Error deleting from Sheets:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

// =============================================
// SAVE CONTENT (DATA chunks) TO SHEETS
// =============================================

export async function saveContentToSheets(
  chunks: DataChunk[],
  courseId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({
      action: 'upsertContent',
      courseId,
      chunks: chunks.map((c) => ({
        Cod: c.cod,
        IdMain: c.idMain,
        Tema: c.tema,
        Contenido: c.contenido,
        Video_1: c.videos?.[0] || '',
        Video_2: c.videos?.[1] || '',
        Video_3: c.videos?.[2] || '',
        ComentarioVideo: c.comentarioVideo || '',
        PDF: c.pdf || '',
        Contexto: c.contexto,
        Orden: c.order || 999,
      })),
    });
    return {
      success: result.status === 'ok',
      message: result.message || 'Contenido guardado correctamente',
    };
  } catch (error) {
    console.error('Error saving content to Sheets:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

export async function deleteContentFromSheets(
  codIds: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({ action: 'deleteContent', codIds });
    return {
      success: result.status === 'ok',
      message: result.message || 'Contenido eliminado correctamente',
    };
  } catch (error) {
    console.error('Error deleting content from Sheets:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

// =============================================
// TEST CONNECTION
// =============================================

export async function testSheetsConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = getSheetUrl(SHEETS_CONFIG.sheets.learn);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} - No se pudo leer la hoja LEARN`);
    const text = await response.text();
    if (!text || text.length < 10) throw new Error('La hoja LEARN está vacía o no accesible');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

export async function testAppsScriptConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!APPS_SCRIPT_CONFIG.url) {
    return { ok: false, error: 'URL de Apps Script no configurada (VITE_APPS_SCRIPT_URL)' };
  }
  try {
    const response = await fetch(APPS_SCRIPT_CONFIG.url, { redirect: 'follow' });
    const text = await response.text();
    try {
      const result = JSON.parse(text);
      if (result.status === 'ok') return { ok: true };
      return { ok: false, error: result.message || 'Respuesta inesperada' };
    } catch {
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        return { ok: false, error: 'Apps Script devolvió HTML. Verifica que esté desplegado como web app con acceso "Cualquiera" y que sea la última versión.' };
      }
      return { ok: false, error: `Respuesta no JSON: ${text.substring(0, 150)}` };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

// =============================================
// DIAGNÓSTICO DEL SISTEMA (verificación de configuración)
// =============================================

export type DiagnosticLevel = 'ok' | 'warn' | 'error';

export interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  level: DiagnosticLevel;
  detail?: string;
}

export interface DiagnosticReport {
  ok: boolean;
  errores: number;
  advertencias: number;
  checks: DiagnosticCheck[];
  resumen: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function summarizeChecks(checks: DiagnosticCheck[]): DiagnosticReport {
  const errores = checks.filter((c) => c.level === 'error').length;
  const advertencias = checks.filter((c) => c.level === 'warn').length;
  const ok = errores === 0;
  const resumen = ok
    ? (advertencias
        ? `Configuración correcta con ${advertencias} advertencia(s).`
        : '¡Todo correcto! El sistema está bien configurado.')
    : `Se detectaron ${errores} problema(s) crítico(s) que impiden el funcionamiento.`;
  return { ok, errores, advertencias, checks, resumen };
}

/**
 * Ejecuta una verificación completa del sistema y devuelve un reporte con el
 * estado de cada configuración. Combina chequeos del lado del cliente (URL del
 * Web App, hoja pública legible, backend accesible) con el diagnóstico del
 * servidor (hojas, columnas, carpetas de Drive y permisos).
 */
export async function runSystemDiagnostics(): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];
  const add = (id: string, label: string, level: DiagnosticLevel, detail?: string) =>
    checks.push({ id, label, ok: level === 'ok', level, detail });

  // A) URL del Web App configurada (.env)
  if (APPS_SCRIPT_CONFIG.url) {
    add('client_env', 'URL del Web App configurada', 'ok', 'VITE_APPS_SCRIPT_URL presente');
  } else {
    add('client_env', 'URL del Web App configurada', 'error', 'Falta VITE_APPS_SCRIPT_URL en el archivo .env');
  }

  // B) Hoja pública legible como CSV (necesario para que la app cargue datos)
  try {
    const resp = await fetch(getSheetUrl(SHEETS_CONFIG.sheets.learn), { cache: 'no-store' });
    const text = await resp.text();
    if (resp.ok && text && !text.toLowerCase().includes('<html')) {
      add('client_csv', 'Hoja pública legible (CSV)', 'ok', 'La hoja responde como CSV público');
    } else {
      add('client_csv', 'Hoja pública legible (CSV)', 'error',
        'La hoja no es pública. Compártela como "Cualquiera con el enlace → Lector".');
    }
  } catch (e) {
    add('client_csv', 'Hoja pública legible (CSV)', 'error', 'No se pudo leer la hoja: ' + errMsg(e));
  }

  // C) Backend (Apps Script) accesible + diagnóstico del servidor
  if (!APPS_SCRIPT_CONFIG.url) {
    add('backend', 'Backend (Apps Script) accesible', 'error', 'Sin URL configurada; no se puede verificar el servidor');
    return summarizeChecks(checks);
  }
  try {
    const resp = await fetch(APPS_SCRIPT_CONFIG.url, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ action: 'diagnostico' }),
    });
    const text = await resp.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      add('backend', 'Backend (Apps Script) accesible', 'error',
        text.toLowerCase().includes('<html')
          ? 'Devolvió HTML: redeploya como Web App con acceso "Cualquiera" y usa la última versión.'
          : 'Respuesta no válida del backend: ' + text.substring(0, 120));
      return summarizeChecks(checks);
    }
    if (parsed.status === 'ok' && parsed.report) {
      add('backend', 'Backend (Apps Script) accesible', 'ok', 'Conexión y diagnóstico del servidor correctos');
      const serverChecks: DiagnosticCheck[] = (parsed.report.checks || []).map((c: any) => ({
        id: 'srv_' + c.id,
        label: c.label,
        ok: !!c.ok,
        level: (c.level as DiagnosticLevel) || (c.ok ? 'ok' : 'error'),
        detail: c.detail,
      }));
      checks.push(...serverChecks);
    } else {
      add('backend', 'Backend (Apps Script) accesible', 'error', parsed.message || 'Respuesta inesperada del backend');
    }
  } catch (e) {
    add('backend', 'Backend (Apps Script) accesible', 'error', errMsg(e));
  }

  return summarizeChecks(checks);
}

// =============================================
// MOCK DATA HELPERS
// =============================================

function getMockTopics(): LearnTopic[] {
  return MOCK_DATA_CONFIG.topics.map((t) => ({
    id: t.id,
    title: t.title,
    audience: t.audience,
    details: t.details,
    summary: t.summary || '',
    keyPoints: t.keyPoints ? t.keyPoints.split('|').map((p) => p.trim()) : [],
    order: t.order || 999,
    active: t.active === 'SI',
  }));
}

function getMockChunks(): DataChunk[] {
  return MOCK_DATA_CONFIG.chunks.map((c: any) => ({
    cod: c.cod,
    idMain: c.idMain,
    tema: c.tema,
    contenido: c.contenido,
    videos: [c.video_1, c.video_2, c.video_3].filter((v: string) => v && v.trim()),
    comentarioVideo: c.comentarioVideo || '',
    pdf: c.pdf || '',
    contexto: c.contexto,
    order: c.order || 999,
  }));
}

function getMockQuiz(): QuizQuestion[] {
  return MOCK_DATA_CONFIG.quizQuestions.map((q) => ({
    idQuiz: q.idQuiz,
    idMain: q.idMain,
    question: q.pregunta,
    optionA: q.opcionA,
    optionB: q.opcionB,
    optionC: q.opcionC,
    optionD: q.opcionD,
    correctAnswer: q.respuestaCorrecta as 'A' | 'B' | 'C' | 'D',
    explanation: q.explicacion,
    difficulty: q.dificultad as 'Fácil' | 'Media' | 'Difícil',
  }));
}

// =============================================
// APP CONFIG - Configuración dinámica
// =============================================

export async function fetchAppDynamicConfig(): Promise<AppDynamicConfig> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.config);
  const defaultConfig: AppDynamicConfig = {
    title: APP_CONFIG.name,
    message: 'Identifícate para comenzar tu capacitación',
    contact: '',
    adminPass: ADMIN_CONFIG.password,
    status: 'Activo',
  };

  try {
    const response = await fetch(url);
    if (!response.ok) return defaultConfig;
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const row = results.data[0] as any;
          if (!row || !row.Titulo) {
            resolve(defaultConfig);
            return;
          }
          resolve({
            title: row.Titulo || defaultConfig.title,
            message: row.Mensaje || defaultConfig.message,
            contact: row.Contacto || '',
            adminPass: row.PassAdmin || defaultConfig.adminPass,
            status: (row.Estatus || 'Activo') === 'Inactivo' ? 'Inactivo' : 'Activo',
            logoCertificado: row.LogoCertificado || '',
            firmaRepresentante: row.FirmaRepresentante || '',
            nombreRepresentante: row.NombreRepresentante || '',
            cargoRepresentante: row.CargoRepresentante || '',
            lugar: row.Lugar || '',
            contratista: row.Contratista || '',
          });
        },
        error: () => resolve(defaultConfig),
      });
    });
  } catch {
    return defaultConfig;
  }
}

// =============================================
// INGRESOS - Registro de sesión y progreso
// =============================================

/** Helper to get current time in Peru (UTC-5) formatted for Sheets as DD/MM/AAAA - (HH:mm:ss) */
function getPeruTimeFormatted(): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const d = parts.find(p => p.type === 'day')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const y = parts.find(p => p.type === 'year')?.value;
    const h = parts.find(p => p.type === 'hour')?.value;
    const min = parts.find(p => p.type === 'minute')?.value;
    const s = parts.find(p => p.type === 'second')?.value;

    return `${d}/${m}/${y} - (${h}:${min}:${s})`;
  } catch (e) {
    return new Date().toISOString();
  }
}

export interface IngresoRecord {
  id: string;
  apellidos: string;
  nombres: string;
  dni: string;
  inicio: string;
  avance: string;
  publico: string;
  nota: string;
  ultimoAcceso: string;
  dispositivo: string;
  modulosCompletados: string;
  intentosQuiz: string;
  tiempoTotal: string;
  progressJson: string;
  certificadoUrl?: string;
  // Extended profile fields
  empresa?: string;
  area?: string;
  cargo?: string;
  fechaIngreso?: string;
  fechaNacimiento?: string;
  correo?: string;
  celular?: string;
  contacto1Numero?: string;
  contacto1Parentesco?: string;
  contacto2Numero?: string;
  contacto2Parentesco?: string;
}

export async function fetchCertificateLinkByDni(dni: string): Promise<Record<string, string>> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.certificates);
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const matches = (results.data as any[]).filter(
            (row: any) => String(row.DNI || '').trim() === String(dni).trim()
          );
          if (!matches.length) { resolve({}); return; }

          const map: Record<string, string> = {};
          matches.forEach((row: any) => {
            const link = String(row.LinkCertificado || row.PDF_URL || '').trim();
            const topicId = String(row.TopicId || row.topicId || row.TOPICID || row.topic_id || '').trim();
            if (link && topicId) map[topicId] = link;
          });
          resolve(map);
        },
        error: () => resolve({}),
      });
    });
  } catch {
    return {};
  }
}

/** Fetch ALL certificates from CERTIFICADOS sheet, grouped by DNI → { topicId: url } */
export async function fetchAllCertificates(): Promise<Record<string, Record<string, string>>> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.certificates);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return {};
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const map: Record<string, Record<string, string>> = {};
          for (const row of results.data as any[]) {
            const dni = String(row.DNI || '').trim();
            const topicId = String(row.TopicId || row.topicId || row.TOPICID || '').trim();
            const link = String(row.LinkCertificado || row.PDF_URL || '').trim();
            if (!dni || !topicId || !link) continue;
            if (!map[dni]) map[dni] = {};
            map[dni][topicId] = link;
          }
          resolve(map);
        },
        error: () => resolve({}),
      });
    });
  } catch {
    return {};
  }
}

/** Fetch user record from INGRESOS sheet by DNI (read-only via CSV) */
export async function fetchIngresoByDni(dni: string): Promise<IngresoRecord | null> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.ingresos);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          // Collect ALL rows matching this DNI
          const matches = (results.data as any[]).filter(
            (r: any) => String(r.DNI || r.Id || '').trim() === String(dni).trim()
          );
          if (!matches.length) { resolve(null); return; }

          // Pick the best row: prefer the one with ProgressJSON, then most recent UltimoAcceso
          const best = matches.reduce((prev: any, curr: any) => {
            const prevHasProgress = !!(prev.ProgressJSON || '').trim();
            const currHasProgress = !!(curr.ProgressJSON || '').trim();
            if (currHasProgress && !prevHasProgress) return curr;
            if (prevHasProgress && !currHasProgress) return prev;
            // Both have (or both lack) progress — prefer most recent UltimoAcceso
            return (curr.UltimoAcceso || '') > (prev.UltimoAcceso || '') ? curr : prev;
          });

          const row = best;
          resolve({
            id: row.Id || '',
            apellidos: row.Apellidos || '',
            nombres: row.Nombres || '',
            dni: row.DNI || row.Id || '',
            inicio: row.Inicio || '',
            avance: row.Avance || '',
            publico: row.Publico || '',
            nota: row.Nota || '',
            ultimoAcceso: row.UltimoAcceso || '',
            dispositivo: row.Dispositivo || '',
            modulosCompletados: row.ModulosCompletados || '',
            intentosQuiz: row.IntentosQuiz || '',
            tiempoTotal: row.TiempoTotal || '',
            progressJson: row.ProgressJSON || '',
            certificadoUrl: row.CertificadoUrl || '',
            // Extended profile fields
            empresa: row.EMPRESA || '',
            area: row.AREA || '',
            cargo: row.CARGO || row.Cargo || '',
            fechaIngreso: row.FECHA_INGRESO || '',
            fechaNacimiento: row.FECHA_NACIMIENTO || '',
            correo: row.CORREO || '',
            celular: row.CELULAR || '',
            contacto1Numero: row.NUMERO_CONTACTO_1 || '',
            contacto1Parentesco: row.PARENTESCO_CONTACTO_1 || '',
            contacto2Numero: row.NUMERO_CONTACTO_2 || '',
            contacto2Parentesco: row.PARENTESCO_CONTACTO_2 || '',
          });
        },
        error: () => resolve(null),
      });
    });
  } catch {
    return null;
  }
}

/** Fetch ALL rows from INGRESOS sheet, one best record per DNI */
export async function fetchAllIngresos(): Promise<IngresoRecord[]> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.ingresos);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const byDni = new Map<string, any>();
          for (const row of results.data as any[]) {
            const dni = String(row.DNI || row.Id || '').trim();
            if (!dni) continue;
            const existing = byDni.get(dni);
            if (!existing) { byDni.set(dni, row); continue; }
            const prevHas = !!(existing.ProgressJSON || '').trim();
            const currHas = !!(row.ProgressJSON || '').trim();
            if (currHas && !prevHas) byDni.set(dni, row);
            else if (prevHas === currHas && (row.UltimoAcceso || '') > (existing.UltimoAcceso || '')) byDni.set(dni, row);
          }
          resolve(Array.from(byDni.values()).map((row: any): IngresoRecord => ({
            id: row.Id || '',
            apellidos: row.Apellidos || '',
            nombres: row.Nombres || '',
            dni: row.DNI || row.Id || '',
            inicio: row.Inicio || '',
            avance: row.Avance || '',
            publico: row.Publico || '',
            nota: row.Nota || '',
            ultimoAcceso: row.UltimoAcceso || '',
            dispositivo: row.Dispositivo || '',
            modulosCompletados: row.ModulosCompletados || '',
            intentosQuiz: row.IntentosQuiz || '',
            tiempoTotal: row.TiempoTotal || '',
            progressJson: row.ProgressJSON || '',
            certificadoUrl: row.CertificadoUrl || '',
            empresa: row.EMPRESA || '',
            area: row.AREA || '',
            cargo: row.CARGO || row.Cargo || '',
            fechaIngreso: row.FECHA_INGRESO || '',
            fechaNacimiento: row.FECHA_NACIMIENTO || '',
            correo: row.CORREO || '',
            celular: row.CELULAR || '',
            contacto1Numero: row.NUMERO_CONTACTO_1 || '',
            contacto1Parentesco: row.PARENTESCO_CONTACTO_1 || '',
            contacto2Numero: row.NUMERO_CONTACTO_2 || '',
            contacto2Parentesco: row.PARENTESCO_CONTACTO_2 || '',
          })));
        },
        error: () => resolve([]),
      });
    });
  } catch {
    return [];
  }
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Otro';
}

export async function registerIngreso(data: {
  dni: string;
  apellidos: string;
  nombres: string;
  publico: string;
  // Extended profile fields
  empresa?: string;
  area?: string;
  cargo?: string;
  fechaIngreso?: string;
  fechaNacimiento?: string;
  correo?: string;
  celular?: string;
  contacto1Numero?: string;
  contacto1Parentesco?: string;
  contacto2Numero?: string;
  contacto2Parentesco?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const result = await postToAppsScript({
      action: 'registerIngreso',
      ingreso: {
        Id: `${data.dni}-${Date.now()}`,
        Apellidos: data.apellidos,
        Nombres: data.nombres,
        DNI: data.dni,
        Inicio: getPeruTimeFormatted(),
        Avance: '0%',
        Publico: data.publico,
        Nota: '',
        UltimoAcceso: getPeruTimeFormatted(),
        Dispositivo: getDeviceInfo(),
        ModulosCompletados: '0',
        IntentosQuiz: '0',
        TiempoTotal: '0 min',
        ProgressJSON: '[]',
        // Profile fields — only sent when provided so existing row values are preserved
        ...(data.empresa !== undefined   && { EMPRESA: data.empresa }),
        ...(data.area !== undefined      && { AREA: data.area }),
        ...(data.cargo !== undefined     && { CARGO: data.cargo }),
        ...(data.fechaIngreso !== undefined   && { FECHA_INGRESO: data.fechaIngreso }),
        ...(data.fechaNacimiento !== undefined && { FECHA_NACIMIENTO: data.fechaNacimiento }),
        ...(data.correo !== undefined    && { CORREO: data.correo }),
        ...(data.celular !== undefined   && { CELULAR: data.celular }),
        ...(data.contacto1Numero !== undefined     && { NUMERO_CONTACTO_1: data.contacto1Numero }),
        ...(data.contacto1Parentesco !== undefined && { PARENTESCO_CONTACTO_1: data.contacto1Parentesco }),
        ...(data.contacto2Numero !== undefined     && { NUMERO_CONTACTO_2: data.contacto2Numero }),
        ...(data.contacto2Parentesco !== undefined && { PARENTESCO_CONTACTO_2: data.contacto2Parentesco }),
      },
    });
    return {
      success: result.status === 'ok',
      message: result.message || 'Registro exitoso',
    };
  } catch (error) {
    console.error('Error registering ingreso:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

export async function updateIngresoProgress(data: {
  dni: string;
  avance: string;
  nota: string;
  modulosCompletados?: number;
  intentosQuiz?: number;
  progress?: UserProgress[];
}): Promise<{ success: boolean; message: string }> {
  const payload = {
    action: 'updateIngreso',
    ingreso: {
      DNI: data.dni,
      Avance: data.avance,
      Nota: data.nota,
      UltimoAcceso: getPeruTimeFormatted(),
      Dispositivo: getDeviceInfo(),
      ModulosCompletados: String(data.modulosCompletados ?? ''),
      IntentosQuiz: String(data.intentosQuiz ?? ''),
      ProgressJSON: data.progress ? JSON.stringify(data.progress) : undefined,
    },
  };
  try {
    const result = await postToAppsScript(payload);
    return {
      success: result.status === 'ok',
      message: result.message || 'Progreso actualizado',
    };
  } catch (error) {
    // Sin conexión: encolar para reintentar al reconectar
    console.warn('Progreso encolado offline:', error);
    enqueueWrite(payload);
    return { success: false, message: 'Guardado localmente; se sincronizará al reconectar' };
  }
}

export async function fetchGlobalKnownUsers(): Promise<Record<string, { apellidos: string, nombres: string }>> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.ingresos);
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const users: Record<string, { apellidos: string, nombres: string }> = {};
          
          // INGRESOS often has multiple entries for the same user.
          // Since it's a log, later entries are more likely to have updated names.
          // By iterating through the whole list, we naturally "override" older entries.
          results.data.forEach((row: any) => {
            const dni = String(row.DNI || row.Id || '').trim();
            const ape = (row.Apellidos || '').trim();
            const nom = (row.Nombres || '').trim();
            
            if (dni && (ape || nom)) {
              users[dni] = {
                apellidos: ape.toUpperCase(),
                nombres: nom.toUpperCase()
              };
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

// =============================================
// CERTIFICADOS - Guardar PDF en Drive
// =============================================

export async function saveCertificate(data: {
  dni: string;
  apellidos: string;
  nombres: string;
  pdfBase64: string;
  signatureBase64?: string;
  selfieBase64?: string;
  cargo?: string;
  celular?: string;
  nota?: string;
  courseTitle?: string;
  topicId?: string;
}): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    const result = await postToAppsScript({
      action: 'saveCertificate',
      ...data
    });
    
    if (result.status === 'ok') {
      return { success: true, url: (result as any).url };
    }
    if (result.message && (
      result.message.includes('Drive para emitir certificados') ||
      result.message.includes('DriveApp.getFolderById') ||
      result.message.includes('auth/drive')
    )) {
      return {
        success: false,
        message: 'El backend de Apps Script no tiene permiso para guardar en Google Drive. Debes abrir el proyecto Apps Script, aceptar los permisos de Drive y volver a desplegar la aplicación web.'
      };
    }
    return { success: false, message: result.message || 'Error al guardar certificado' };
  } catch (error) {
    console.error('Error in saveCertificate service:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

// =============================================
// QUIZ PROGRESS - Progreso cross-device
// =============================================

export async function fetchQuizProgressFromSheets(
  dni: string,
  topicId: string
): Promise<QuizSavedProgress | null> {
  try {
    const result = await postToAppsScript({ action: 'getQuizProgress', dni, topicId }) as any;
    return result.status === 'ok' ? (result.progress as QuizSavedProgress | null) : null;
  } catch {
    return null;
  }
}

export async function saveQuizProgressToSheets(
  dni: string,
  topicId: string,
  progress: QuizSavedProgress | null
): Promise<void> {
  try {
    await postToAppsScript({ action: 'updateQuizProgress', dni, topicId, progress });
  } catch { /* non-critical — localStorage remains as fallback */ }
}

// =============================================
// SHORT EVALUACIONES
// =============================================
import type { ShortEval, ShortEvalWrongAnswer } from '../types';

export async function fetchShortEvals(): Promise<ShortEval[]> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.shortEvals);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          resolve((results.data as any[]).filter(r => r.Id).map((r: any): ShortEval => ({
            id: String(r.Id || '').trim(),
            nombre: String(r.Nombre || '').trim(),
            descripcion: String(r.Descripcion || '').trim(),
            topicId: String(r.TopicId || '').trim(),
            topicTitle: String(r.TopicTitle || '').trim(),
            chunkIds: r.ChunkIds ? String(r.ChunkIds).split('|').map((s: string) => s.trim()).filter(Boolean) : [],
            activo: String(r.Activo || '').toLowerCase() === 'true' || String(r.Activo || '') === '1',
            fechaCreacion: String(r.FechaCreacion || '').trim(),
          })));
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

export async function fetchShortResultsDni(evalId: string): Promise<{ dni: string; apellidos: string; nombres: string; nota: number; fechaHora: string }[]> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.shortResults);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          resolve((results.data as any[])
            .filter((r: any) => String(r.EvaluacionId || '').trim() === evalId && r.DNI)
            .map((r: any) => ({
              dni: String(r.DNI || '').trim(),
              apellidos: String(r.Apellidos || '').trim(),
              nombres: String(r.Nombres || '').trim(),
              nota: parseFloat(r.Nota || '0') || 0,
              fechaHora: String(r.FechaHora || '').trim(),
            })));
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

export async function fetchAllShortResults(): Promise<Array<{
  evaluacionId: string; evaluacionNombre: string; tema: string;
  dni: string; apellidos: string; nombres: string;
  nota: number; porcentaje: number; fechaHora: string; totalPreguntas: number; correctas: number;
  preguntasErroneas: ShortEvalWrongAnswer[];
}>> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.shortResults);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          resolve((results.data as any[]).filter((r: any) => r.EvaluacionId && r.DNI).map((r: any) => ({
            evaluacionId: String(r.EvaluacionId || '').trim(),
            evaluacionNombre: String(r.EvaluacionNombre || '').trim(),
            tema: String(r.Tema || '').trim(),
            dni: String(r.DNI || '').trim(),
            apellidos: String(r.Apellidos || '').trim(),
            nombres: String(r.Nombres || '').trim(),
            nota: parseFloat(r.Nota || '0') || 0,
            porcentaje: parseFloat(r.Porcentaje || '0') || 0,
            fechaHora: String(r.FechaHora || '').trim(),
            totalPreguntas: parseInt(r.TotalPreguntas || '0') || 0,
            correctas: parseInt(r.Correctas || '0') || 0,
            preguntasErroneas: (() => {
              try { return r.PreguntasErroneas ? JSON.parse(r.PreguntasErroneas) : []; }
              catch { return []; }
            })(),
          })));
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

export async function createShortEval(data: Omit<ShortEval, 'fechaCreacion'>): Promise<void> {
  await postToAppsScript({ action: 'createShortEval', ...data });
}

export async function updateShortEvalStatus(id: string, activo: boolean): Promise<void> {
  await postToAppsScript({ action: 'updateShortEval', id, activo });
}

export async function deleteShortEval(id: string): Promise<void> {
  await postToAppsScript({ action: 'deleteShortEval', id });
}

export async function deleteShortEvalResult(evaluacionId: string, dni: string): Promise<void> {
  await postToAppsScript({ action: 'deleteShortEvalResult', evaluacionId, dni });
}

export async function saveShortEvalResult(data: {
  evaluacionId: string;
  evaluacionNombre: string;
  tema: string;
  dni: string;
  apellidos: string;
  nombres: string;
  nota: number;
  porcentaje: number;
  totalPreguntas: number;
  correctas: number;
  preguntasErroneas: ShortEvalWrongAnswer[];
}): Promise<void> {
  const payload = { action: 'saveShortEvalResult', ...data };
  try {
    await postToAppsScript(payload);
  } catch (error) {
    // Sin conexión: encolar (el backend es anti-duplicado por evaluación+DNI)
    console.warn('Resultado de eval encolado offline:', error);
    enqueueWrite(payload);
  }
}

// =============================================
// ACTAS DE ENTREGA / COMPROMISOS
// =============================================
import type { ActaDocumento, ActaFirma, ActaItem } from '../types';

/** Parsea la columna `Items` (JSON) de un documento de actas de forma tolerante. */
function parseActaItems(raw: unknown): ActaItem[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it: any): ActaItem => ({
        nombre: String(it?.nombre || '').trim(),
        driveUrl: String(it?.driveUrl || '').trim() || undefined,
      }))
      .filter(it => it.nombre);
  } catch {
    return [];
  }
}

export async function fetchActaDocumentos(): Promise<ActaDocumento[]> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.actasDocs);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          resolve((results.data as any[]).filter(r => r.Id).map((r: any): ActaDocumento => ({
            id: String(r.Id || '').trim(),
            titulo: String(r.Titulo || '').trim(),
            descripcion: String(r.Descripcion || '').trim(),
            perfiles: r.Perfiles ? String(r.Perfiles).split('|').map((s: string) => s.trim()).filter(Boolean) : [],
            dnisAsignados: r.DnisAsignados ? String(r.DnisAsignados).split('|').map((s: string) => s.trim()).filter(Boolean) : [],
            cuerpoHtml: String(r.CuerpoHtml || ''),
            items: parseActaItems(r.Items),
            driveDocUrl: String(r.DriveDocUrl || '').trim(),
            requiereFirmaDibujada: String(r.RequiereFirmaDibujada || '').toLowerCase() !== 'false',
            activo: String(r.Activo || '').toLowerCase() === 'true' || String(r.Activo || '') === '1',
            fechaCreacion: String(r.FechaCreacion || '').trim(),
          })));
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

export async function fetchActaFirmas(): Promise<ActaFirma[]> {
  const url = getSheetUrl(SHEETS_CONFIG.sheets.actasFirmas);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          resolve((results.data as any[]).filter(r => r.DocumentoId && r.DNI).map((r: any): ActaFirma => ({
            id: String(r.Id || '').trim(),
            documentoId: String(r.DocumentoId || '').trim(),
            documentoTitulo: String(r.DocumentoTitulo || '').trim(),
            dni: String(r.DNI || '').trim(),
            apellidos: String(r.Apellidos || '').trim(),
            nombres: String(r.Nombres || '').trim(),
            cargo: String(r.Cargo || '').trim(),
            area: String(r.Area || '').trim(),
            empresa: String(r.Empresa || '').trim(),
            correo: String(r.Correo || '').trim(),
            fechaFirma: String(r.FechaFirma || '').trim(),
            actaPdfUrl: String(r.ActaPdfUrl || '').trim(),
            selfieUrl: String(r.SelfieUrl || '').trim(),
            firmaUrl: String(r.FirmaUrl || '').trim(),
            correoEnviado: String(r.CorreoEnviado || '').trim(),
            dispositivo: String(r.Dispositivo || '').trim(),
          })));
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

export async function saveActaDocumento(data: {
  id: string;
  titulo: string;
  descripcion: string;
  perfiles: string[];
  dnisAsignados: string[];
  cuerpoHtml: string;
  items: ActaItem[];
  driveDocUrl: string;
  requiereFirmaDibujada: boolean;
  activo: boolean;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await postToAppsScript({ action: 'upsertActaDocumento', ...data, items: JSON.stringify(data.items || []) });
    return result.status === 'ok' ? { success: true } : { success: false, message: result.message };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

export async function deleteActaDocumento(id: string): Promise<void> {
  await postToAppsScript({ action: 'deleteActaDocumento', id });
}

export async function saveActaFirma(data: {
  documentoId: string;
  documentoTitulo: string;
  dni: string;
  apellidos: string;
  nombres: string;
  cargo?: string;
  area?: string;
  empresa?: string;
  correo: string;
  driveDocUrl?: string;
  pdfBase64: string;
  signatureBase64?: string;
  selfieBase64?: string;
  dispositivo?: string;
}): Promise<{ success: boolean; url?: string; correoEnviado?: string; duplicate?: boolean; message?: string }> {
  try {
    const result = await postToAppsScript({ action: 'saveActaFirma', ...data });
    if (result.status === 'ok') {
      return {
        success: true,
        url: (result as any).url,
        correoEnviado: (result as any).correoEnviado,
        duplicate: (result as any).duplicate === true,
      };
    }
    return { success: false, message: result.message || 'Error al guardar la firma del acta' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

export async function resendActaCorreo(id: string, correo?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await postToAppsScript({ action: 'resendActaCorreo', id, correo });
    return result.status === 'ok' ? { success: true } : { success: false, message: result.message };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
