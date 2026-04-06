export type AudienceType = 'Obrero' | 'Empleado' | 'Energías' | 'Conductor';

export interface UserSession {
  dni: string;
  apellidos: string;
  nombres: string;
  audience: AudienceType;
  inicio: string; // ISO date
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

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Admin types
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

export type AdminTab = 'overview' | 'content' | 'quiz';

export type AppView =
  | 'login'
  | 'onboarding'
  | 'dashboard'
  | 'courseDetail'
  | 'learning'
  | 'quiz'
  | 'admin';
