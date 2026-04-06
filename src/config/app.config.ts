/**
 * Configuración centralizada de la aplicación LearnDrive AI v2.0
 * 
 * Todas las variables globales, IDs de Sheets, configuraciones de IA,
 * perfiles, TTS y admin se definen aquí.
 * NUNCA hardcodear valores en componentes o servicios.
 */

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
const APPS_SCRIPT_URL = (import.meta as any).env?.VITE_APPS_SCRIPT_URL || '';

// =============================================
// 1. AI_CONFIG - Solo para módulo Admin
// =============================================
export const AI_CONFIG = {
  provider: 'gemini' as const,
  apiKey: GEMINI_API_KEY,
  model: 'gemini-2.0-flash-lite',
  maxTokens: 30000,
  temperature: 0.7,
} as const;

// =============================================
// 2. SHEETS_CONFIG - Google Sheets como BD
// =============================================
export const SHEETS_CONFIG = {
  sheetId: '1fXcrk-6YSA5NcgDbCBinu4WaPpyJMRK0og6miVE8ZZw',
  sheets: {
    learn: 'LEARN',
    data: 'DATA',
    quiz: 'QUIZ',
    ingresos: 'INGRESOS',
  },
  useMockDataOnError: true,
} as const;

// =============================================
// 3. APP_CONFIG - Info general de la app
// =============================================
export const APP_CONFIG = {
  name: 'LearnDrive AI',
  tagline: 'Tu tutor personal de aprendizaje',
  description: 'Plataforma de aprendizaje corporativo móvil',
  version: '2.0.0',
  storage: {
    prefix: 'learndrive_',
    keys: {
      audience: 'audience',
      progress: 'progress',
      topics: 'topics_metadata',
      session: 'user_session',
    },
  },
} as const;

// =============================================
// 4. ADMIN_CONFIG - Panel administrador
// =============================================
export const ADMIN_CONFIG = {
  password: '123456',
  quiz_generation_count: 5,
  content_generation_chunk_size: 3,
  content_sections_per_batch: 2,
} as const;

// =============================================
// 5. TTS_CONFIG - Text-to-Speech nativo
// =============================================
export const TTS_CONFIG = {
  lang: 'es-MX',
  fallbackLangs: ['es-US', 'es-CO', 'es-AR', 'es-419', 'es-LA', 'es-ES'] as readonly string[],
  defaultRate: 0.9,
  defaultPitch: 1.05,
  rates: [0.7, 0.85, 1, 1.15, 1.3] as readonly number[],
  autoReadEnabled: false,
} as const;

// =============================================
// 6. TUTOR_CONFIG - Personalidad y generación
// =============================================
export const TUTOR_CONFIG = {
  personality: {
    tone: 'amigable y directo',
    style: 'conciso',
    maxParagraphs: 2,
    useEmojis: false,
  },
  generation: {
    quiz_questions_count: 5,
    quiz_options_per_question: 4,
  },
} as const;

// =============================================
// 7. AUDIENCE_CONFIG - Perfiles de usuario
// =============================================
export const AUDIENCE_CONFIG = {
  profiles: [
    {
      id: 'Obrero',
      label: 'Obrero',
      icon: 'HardHat',
      description: 'Personal operativo en campo',
      color: 'orange',
    },
    {
      id: 'Empleado',
      label: 'Empleado',
      icon: 'Briefcase',
      description: 'Personal administrativo y técnico',
      color: 'blue',
    },
    {
      id: 'Energías',
      label: 'Energías',
      icon: 'Zap',
      description: 'Especialistas en energías y aislamiento',
      color: 'yellow',
    },
    {
      id: 'Conductor',
      label: 'Conductor',
      icon: 'Truck',
      description: 'Operadores de vehículos y transporte',
      color: 'green',
    },
  ],
} as const;

// =============================================
// 8. THEME_CONFIG - Colores y diseño
// =============================================
export const THEME_CONFIG = {
  colors: {
    primary: {
      main: 'blue-600',
      light: 'blue-50',
      dark: 'blue-700',
      gradient: 'from-blue-600 to-indigo-600',
    },
    secondary: {
      main: 'slate-600',
      light: 'slate-50',
      dark: 'slate-900',
    },
    success: 'green-600',
    warning: 'yellow-600',
    error: 'red-600',
    info: 'blue-500',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
  animations: {
    enabled: true,
    duration: 'normal' as const,
    stagger_delay: 50,
  },
} as const;

// =============================================
// 9. APPS_SCRIPT_CONFIG - Google Apps Script proxy
// =============================================
export const APPS_SCRIPT_CONFIG = {
  url: APPS_SCRIPT_URL,
  timeout: 30000,
} as const;

// =============================================
// 10. MOCK DATA - Desarrollo/fallback
// =============================================
export const MOCK_DATA_CONFIG = {
  enabled: true,
  topics: [
    {
      id: '1',
      title: 'Seguridad en el Trabajo',
      audience: 'Obrero, Empleado',
      details: 'Normas básicas de seguridad y prevención de riesgos laborales.',
      summary: 'Este módulo cubre las normas esenciales de seguridad laboral, incluyendo el uso correcto del EPP y protocolos de emergencia.',
      keyPoints: 'Uso de EPP|Señalización|Evacuación|Primeros auxilios',
      order: 1,
      active: 'SI',
    },
    {
      id: '2',
      title: 'Conducción Defensiva',
      audience: 'Conductor, Empleado',
      details: 'Técnicas de conducción segura y prevención de accidentes viales.',
      summary: 'Aprende las técnicas fundamentales de conducción defensiva para prevenir accidentes.',
      keyPoints: 'Distancia de seguimiento|Puntos ciegos|Condiciones adversas',
      order: 2,
      active: 'SI',
    },
  ],
  chunks: [
    {
      cod: 'C1',
      idMain: '1',
      tema: 'Equipos de Protección Personal',
      contenido: 'El uso de **cascos**, gafas y guantes es **obligatorio** en las áreas de producción.\n\n- Casco: protege contra impactos\n- Gafas: protegen contra partículas\n- Guantes: protegen contra cortes y químicos',
      contexto: 'Normativo',
      order: 1,
    },
    {
      cod: 'C2',
      idMain: '1',
      tema: 'Señalización de Seguridad',
      contenido: 'Las señales de seguridad se clasifican en:\n\n1. **Prohibición** (rojo): indican acciones NO permitidas\n2. **Obligación** (azul): acciones que DEBEN realizarse\n3. **Advertencia** (amarillo): alertan sobre peligros\n4. **Información** (verde): rutas de evacuación y primeros auxilios',
      contexto: 'Teórico',
      order: 2,
    },
    {
      cod: 'C3',
      idMain: '2',
      tema: 'Distancia de Seguimiento',
      contenido: 'La regla de los **3 segundos** es fundamental:\n\n- Identifica un punto fijo en la carretera\n- Cuando el vehículo de adelante lo pase, cuenta "mil uno, mil dos, mil tres"\n- Si llegas al punto antes de terminar, estás **demasiado cerca**',
      contexto: 'Práctico',
      order: 1,
    },
  ],
  quizQuestions: [
    {
      idQuiz: 'Q1',
      idMain: '1',
      pregunta: '¿Cuál es el EPP básico obligatorio en áreas de producción?',
      opcionA: 'Casco, gafas y guantes',
      opcionB: 'Solo casco',
      opcionC: 'Zapatos deportivos',
      opcionD: 'Ninguno es obligatorio',
      respuestaCorrecta: 'A',
      explicacion: 'El casco, gafas y guantes son el EPP mínimo obligatorio en áreas de producción.',
      dificultad: 'Fácil',
    },
    {
      idQuiz: 'Q2',
      idMain: '1',
      pregunta: '¿Qué color identifica las señales de obligación?',
      opcionA: 'Rojo',
      opcionB: 'Azul',
      opcionC: 'Amarillo',
      opcionD: 'Verde',
      respuestaCorrecta: 'B',
      explicacion: 'Las señales azules indican acciones que deben realizarse obligatoriamente.',
      dificultad: 'Media',
    },
  ],
} as const;

// =============================================
// UTILIDADES
// =============================================

export function getStorageKey(key: string): string {
  return `${APP_CONFIG.storage.prefix}${key}`;
}

export function validateApiConfig(): { valid: boolean; error?: string } {
  if (!AI_CONFIG.apiKey) {
    return {
      valid: false,
      error: 'API Key no configurada. Define VITE_GEMINI_API_KEY en tu archivo .env',
    };
  }
  return { valid: true };
}

export function getSheetUrl(sheetName: string): string {
  const cacheBust = `&_t=${Date.now()}`;
  return `https://docs.google.com/spreadsheets/d/${SHEETS_CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}${cacheBust}`;
}

export type AudienceProfile = typeof AUDIENCE_CONFIG.profiles[number];
export type AudienceId = typeof AUDIENCE_CONFIG.profiles[number]['id'];
