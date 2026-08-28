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
  // Datos fijos de la lista de asistencia (from CONFIG sheet)
  ruc?: string;
  actividadEconomica?: string;
  domicilio?: string;
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
  // Autorización de firma digital (onboarding), capturada una sola vez por trabajador
  consentFirmaUrl?: string;     // firma dibujada — columna INGRESOS.FOTOGRAFIA
  consentSelfieUrl?: string;    // selfie de verificación — columna INGRESOS.SELFIE
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

/**
 * Una pregunta fallada en el cuestionario de un módulo. Se guarda en formato
 * compacto (solo el id y las letras) porque viaja dentro de ProgressJSON, una
 * sola celda de la hoja INGRESOS; el texto de la pregunta y de las alternativas
 * se resuelve contra el banco de preguntas al mostrarla en el panel admin.
 */
export interface QuizWrongAnswer {
  idQuiz: string;
  selected: string;   // 'A' | 'B' | 'C' | 'D', o '' si se agotó el tiempo
  correct: string;    // letra correcta
}

export interface UserProgress {
  topicId: string;
  completed: boolean;
  currentChunk?: number;
  quizScore?: number;
  lastAccessed: number;
  /** Preguntas erradas del último intento del cuestionario de este módulo. */
  wrongAnswers?: QuizWrongAnswer[];
}

/** Nivel de confianza autoreportado antes de revelar el feedback (metacognición) */
export type Confidence = 'alta' | 'media' | 'baja';

/** Origen de una distracción detectada durante la evaluación calificada. */
export type DistractionReason = 'camera' | 'visibility';

export interface QuizSavedProgress {
  shuffledIds: string[];
  answeredMap: Record<string, { selected: string; correct: boolean; confidence?: Confidence }>;
  currentIdx: number;
  score: number;
  distractionCount?: number;
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

export type AdminTab = 'topics' | 'overview' | 'content' | 'quiz' | 'progress' | 'pac' | 'actas' | 'config';

export type AppView =
  | 'login'
  | 'profileForm'
  | 'consent'
  | 'onboarding'
  | 'dashboard'
  | 'courseDetail'
  | 'learning'
  | 'quiz'
  | 'admin'
  | 'certificateClaim'
  | 'shortEval'
  | 'pacEval'
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

// =============================================
// PAC - PROGRAMA ANUAL DE CAPACITACIONES
// =============================================

/** Una capacitación programada del PAC: material de referencia + banco de preguntas propio. */
export interface PacPrograma {
  id: string;
  nombre: string;
  descripcion: string;
  tema: string;
  capacitador: string;
  fechaProgramada: string;   // yyyy-MM-dd
  horaProgramada?: string;
  materialUrl?: string;
  materialNombre?: string;
  perfiles: string[];        // audiencia asignada (igual convención que ActaDocumento.perfiles)
  dnisAsignados: string[];
  notaAprobatoria: number;   // default 14
  maxIntentos: number;       // default 3
  activo: boolean;
  fechaCreacion: string;
}

export interface PacPregunta {
  idPregunta: string;
  programaId: string;
  pregunta: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  orden?: number;
}

export type PacWrongAnswer = ShortEvalWrongAnswer;

export type SatisfaccionRating = 'Excelente' | 'Bueno' | 'Regular' | 'Malo';

export interface PacEncuesta {
  respuestas: SatisfaccionRating[]; // longitud fija: una por pregunta de escala
  sugerencia: string;               // campo abierto
}

/** Un intento de evaluación PAC (se registra apruebe o no; firma+foto se piden en cada intento). */
export interface PacResultado {
  id: string;
  programaId: string;
  programaNombre: string;
  tema: string;
  intento: number;           // 1..maxIntentos, asignado por el servidor
  dni: string;
  apellidos: string;
  nombres: string;
  guardia: string;
  empresa: string;
  area: string;
  nota: number;
  aprobado: boolean;
  totalPreguntas: number;
  correctas: number;
  preguntasErroneas: PacWrongAnswer[];
  encuesta: PacEncuesta;
  consentimiento: boolean;
  firmaUrl: string;
  selfieUrl: string;
  constanciaPdfUrl: string;
  fechaHora: string;
  dispositivo?: string;
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
  categoria?: 'documento' | 'capacitacion'; // qué se está entregando/firmando: un documento o una capacitación
  // Asignación propia del documento (override); vacío/undefined = hereda la del acta padre
  perfiles?: string[];
  dnisAsignados?: string[];
  // Metadatos de control documental, usados en el PDF "Lista Maestra de Distribución"
  codigo?: string;
  version?: string;
  fechaVersion?: string;        // "fecha de actualización" del documento (texto libre)
  // Solo para categoria === 'capacitacion': datos de la "Lista de Asistencia" (RG-CL-SSMA-1-F62)
  tema?: string;
  capacitador?: string;
  horas?: string;
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
  linkDrive: string;           // enlace del archivo subido desde la app (carpeta ACTAS/DOCUMENTOS)
  requiereFirmaDibujada: boolean;
  activo: boolean;
  fechaCreacion: string;
}

/**
 * Registro de una firma: una persona firmó un documento. Para el acta general
 * (documentoId === GENERAL_ACTA_ID) puede haber más de una fila por DNI —una por
 * cada vez que firmó un lote de documentos nuevos—; `documentos` guarda los ids
 * de los renglones (ver GeneralActaDoc) cubiertos por esa firma en particular.
 */
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
  // Firma adicional pedida solo cuando el acta incluye alguna capacitación; llena
  // la columna "Firma" de la Lista de Asistencia (independiente de firmaUrl).
  firmaAsistenciaUrl: string;
  correoEnviado: string;   // 'SI' | 'NO'
  dispositivo: string;
  // Ids de los renglones (GeneralActaDoc.id) cubiertos por esta firma. Vacío en
  // firmas creadas antes de este campo: se tratan como si cubrieran todo lo que
  // el trabajador tenía asignado al momento de firmar (comportamiento previo).
  documentos: string[];
}
