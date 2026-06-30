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

export interface QuizSavedProgress {
  shuffledIds: string[];
  answeredMap: Record<string, { selected: string; correct: boolean }>;
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

export type AdminTab = 'topics' | 'overview' | 'content' | 'quiz' | 'progress';

export type AppView =
  | 'login'
  | 'profileForm'
  | 'onboarding'
  | 'dashboard'
  | 'courseDetail'
  | 'learning'
  | 'quiz'
  | 'admin'
  | 'certificateClaim';
