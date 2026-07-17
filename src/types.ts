export type AudienceType = 'Obrero' | 'Empleado Superficie' | 'Empleado Mina' | 'Energías' | 'Conductor';

export interface AppDynamicConfig {
  title: string;
  message: string;
  contact: string;
  adminPass: string;
  status: 'Activo' | 'Inactivo';
  // Certificate branding (from CONFIG sheet)
  logoCertificado?: string;
  firmaRepresentante?: string;
  nombreRepresentante?: string;
  cargoRepresentante?: string;
  // Datos fijos del acta de recepción de documentos (from CONFIG sheet)
  lugar?: string;            // lugar / proyecto minero
  contratista?: string;      // nombre de la contratista que entrega
  // Video tutorial de la app (from CONFIG sheet, columna Tutorial)
  tutorialUrl?: string;
  // Módulo de actas visible en la vista de usuario (from CONFIG sheet, columna Actas: TRUE/FALSE)
  actasHabilitado?: boolean;
}

export interface UserSession {
  dni: string;
  apellidos: string;
  nombres: string;
  audience: AudienceType[];
  inicio: string; // ISO date
  certificadoUrls?: Record<string, string>; // topicId → Drive URL (one per approved course)
  // Basic fields (also used in certificate)
  cargo?: string;
  celular?: string;
  // Extended profile fields (collected in ProfileForm)
  empresa?: string;
  area?: string;
  fechaIngreso?: string;        // DD/MM/YYYY
  fechaNacimiento?: string;     // DD/MM/YYYY
  correo?: string;
  contacto1Numero?: string;
  contacto1Parentesco?: string;
  contacto2Numero?: string;
  contacto2Parentesco?: string;
  profileComplete?: boolean;    // true once ProfileForm was submitted
}

export interface LearnTopic {
  id: string;
  title: string;
  audience: string;
  details: string;
  summary?: string;
  keyPoints?: string[];
  order?: number;
  active?: boolean;
  suggestedQuestions?: string[];
}

export interface DataChunk {
  cod: string;
  idMain: string;
  tema: string;
  contenido: string;
  videos: string[];
  comentarioVideo?: string;
  pdf?: string;
  contexto: string;
  order?: number;
}

export interface QuizQuestion {
  idQuiz: string;
  idMain: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'Fácil' | 'Media' | 'Difícil';
  categoriaContenido?: string;
}

export interface Quiz {
  questions: QuizQuestion[];
}

export interface UserProgress {
  topicId: string;
  completed: boolean;
  currentChunk?: number;
  quizScore?: number;
  lastAccessed: number;
}

/** Nivel de confianza autoreportado antes de revelar el feedback (metacognición) */
export type Confidence = 'alta' | 'media' | 'baja';

export interface QuizSavedProgress {
  shuffledIds: string[];
  answeredMap: Record<string, { selected: string; correct: boolean; confidence?: Confidence }>;
  currentIdx: number;
  score: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Admin types
export interface TopicDraft extends LearnTopic {
  _status: 'new' | 'modified' | 'deleted' | 'unchanged';
}

export interface QuizDraft extends QuizQuestion {
  _status: 'new' | 'modified' | 'deleted' | 'unchanged';
  _originalQuestion?: string;
}

export interface ContentDraft extends DataChunk {
  _status: 'new' | 'modified' | 'deleted' | 'unchanged';
}

// Generation progress tracking
export interface GenerationBatch {
  batchIndex: number;
  totalBatches: number;
  status: 'pending' | 'generating' | 'done' | 'error';
  items: QuizQuestion[] | DataChunk[];
  error?: string;
}

// Connection test result
export interface ConnectionTestResult {
  sheetsRead: { ok: boolean; error?: string };
  appsScript: { ok: boolean; error?: string };
  geminiApi: { ok: boolean; error?: string };
}

export type AdminTab = 'topics' | 'overview' | 'content' | 'quiz' | 'progress' | 'shortEvals' | 'actas';

export type AppView =
  | 'login'
  | 'profileForm'
  | 'onboarding'
  | 'dashboard'
  | 'courseDetail'
  | 'learning'
  | 'quiz'
  | 'admin'
  | 'certificateClaim'
  | 'shortEval'
  | 'actas';

export interface ShortEval {
  id: string;
  nombre: string;
  descripcion: string;
  topicId: string;
  topicTitle: string;
  chunkIds: string[];   // empty = todas las preguntas del topicId
  activo: boolean;
  fechaCreacion: string;
}

export interface ShortEvalWrongAnswer {
  idQuiz: string;
  question: string;
  selected: string;
  correct: string;
  explanation: string;
}

// =============================================
// ACTAS DE ENTREGA / COMPROMISOS
// =============================================

/** Un documento/ítem que el trabajador recibe dentro de un acta (fila a fila). */
export interface ActaItem {
  nombre: string;              // nombre del documento recepcionado
  driveUrl?: string;           // enlace de Drive del documento (opcional, genera QR por fila)
  tipo?: 'virtual' | 'fisico'; // tipo de entrega: virtual (marca "Digital") o físico
  // Asignación propia del documento (override); vacío/undefined = hereda la del acta padre
  perfiles?: string[];
  dnisAsignados?: string[];
  // Metadatos de control documental, usados en el PDF "Lista Maestra de Distribución"
  codigo?: string;
  version?: string;
  fechaVersion?: string;        // "fecha de actualización" del documento (texto libre)
}

/** Documento/compromiso configurable por el admin, firmable por el usuario. */
export interface ActaDocumento {
  id: string;
  titulo: string;
  descripcion: string;
  perfiles: string[];          // audiencias objetivo (vacío = todas)
  dnisAsignados: string[];     // DNIs específicos (opcional, además de perfiles)
  cuerpoHtml: string;          // plantilla HTML con variables {nombres} {dni} {cargo} ...
  items: ActaItem[];           // documentos que recibe el trabajador (se listan fila a fila)
  driveDocUrl: string;         // documento digital adjunto (opcional) guardado en Drive
  requiereFirmaDibujada: boolean;
  activo: boolean;
  fechaCreacion: string;
}

/** Registro de una firma: una persona firmó un documento (una fila por documento+DNI). */
export interface ActaFirma {
  id: string;
  documentoId: string;
  documentoTitulo: string;
  dni: string;
  apellidos: string;
  nombres: string;
  cargo: string;
  area: string;
  empresa: string;
  correo: string;
  fechaFirma: string;
  actaPdfUrl: string;
  selfieUrl: string;
  firmaUrl: string;
  correoEnviado: string;   // 'SI' | 'NO'
  dispositivo: string;
}
