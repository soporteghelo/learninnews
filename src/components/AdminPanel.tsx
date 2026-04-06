import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  ChevronLeft, Save, Trash2, Edit3,
  Plus, Copy, Search, BookOpen, HelpCircle,
  CheckCircle2, Loader2, Lock, Eye, EyeOff, RefreshCw,
  Wifi, WifiOff, ChevronDown, ChevronUp,
  FileText, Settings, Video, Link2, MessageSquare, Undo2
} from 'lucide-react';
import { ADMIN_CONFIG } from '../config/app.config';
import {
  saveQuizToSheets, deleteQuizFromSheets,
  saveContentToSheets, deleteContentFromSheets,
  testSheetsConnection, testAppsScriptConnection,
} from '../services/sheetsService';
import type {
  LearnTopic, DataChunk, QuizQuestion, QuizDraft,
  ContentDraft, AdminTab, ConnectionTestResult
} from '../types';

interface AdminPanelProps {
  topics: LearnTopic[];
  allChunks: DataChunk[];
  allQuizQuestions: QuizQuestion[];
  onBack: () => void;
  onRefreshData: () => Promise<void> | void;
}

export default function AdminPanel({
  topics,
  allChunks,
  allQuizQuestions,
  onBack,
  onRefreshData,
}: AdminPanelProps) {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [isTopicSelectorOpen, setIsTopicSelectorOpen] = useState(false);

  // Content management
  const [draftContent, setDraftContent] = useState<ContentDraft[]>([]);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  // Quiz management
  const [draftQuestions, setDraftQuestions] = useState<QuizDraft[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'content' | 'quiz'; id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // General
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Connection test
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<ConnectionTestResult | null>(null);

  // Auth
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_CONFIG.password) {
      setIsAuthenticated(true);
      setError(null);
    } else {
      setError('Contraseña incorrecta');
    }
  };

  // Load data for selected topic
  useEffect(() => {
    if (selectedTopicId) {
      const existingChunks = allChunks
        .filter(c => c.idMain === selectedTopicId)
        .map(c => ({ ...c, _status: 'unchanged' as const }));
      setDraftContent(existingChunks);

      // Quiz IdMain references LEARN.Id (topic ID)
      const existingQuiz = allQuizQuestions
        .filter(q => q.idMain === selectedTopicId)
        .map(q => ({ ...q, _status: 'unchanged' as const }));
      setDraftQuestions(existingQuiz);

      setExpandedChunks(new Set());
      setExpandedQuestions(new Set());
    } else {
      setDraftContent([]);
      setDraftQuestions([]);
    }
    setStatusMessage(null);
    setError(null);
  }, [selectedTopicId, allChunks, allQuizQuestions]);

  const selectedTopic = topics.find(t => t.id === selectedTopicId);
  const topicChunks = allChunks.filter(c => c.idMain === selectedTopicId);

  // ========== CONNECTION TEST ==========
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResults(null);
    const [sheets, appsScript] = await Promise.all([
      testSheetsConnection(),
      testAppsScriptConnection(),
    ]);
    setTestResults({ sheetsRead: sheets, appsScript, geminiApi: { ok: true } });
    setIsTesting(false);
  };

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ========== CONTENT CRUD ==========
  const handleUpdateContent = (cod: string, updates: Partial<DataChunk>) => {
    setDraftContent(prev => prev.map(c => {
      if (c.cod === cod) {
        return { ...c, ...updates, _status: c._status === 'new' ? 'new' : 'modified' };
      }
      return c;
    }));
  };

  const handleDeleteContent = (cod: string) => {
    const c = draftContent.find(dc => dc.cod === cod);
    if (!c) return;
    setConfirmDelete({ type: 'content', id: cod, label: c.tema || cod });
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setIsDeleting(true);
    setError(null);

    try {
      if (type === 'content') {
        const c = draftContent.find(dc => dc.cod === id);
        if (c?._status === 'new') {
          setDraftContent(prev => prev.filter(dc => dc.cod !== id));
        } else {
          const result = await deleteContentFromSheets([id]);
          if (!result.success) {
            setError(`Error al eliminar: ${result.message}`);
            setIsDeleting(false);
            setConfirmDelete(null);
            return;
          }
          setDraftContent(prev => prev.filter(dc => dc.cod !== id));
          setStatusMessage({ type: 'success', text: 'Contenido eliminado' });
        }
      } else {
        const q = draftQuestions.find(dq => dq.idQuiz === id);
        if (q?._status === 'new') {
          setDraftQuestions(prev => prev.filter(dq => dq.idQuiz !== id));
        } else {
          const result = await deleteQuizFromSheets([id]);
          if (!result.success) {
            setError(`Error al eliminar: ${result.message}`);
            setIsDeleting(false);
            setConfirmDelete(null);
            return;
          }
          setDraftQuestions(prev => prev.filter(dq => dq.idQuiz !== id));
          setStatusMessage({ type: 'success', text: 'Pregunta eliminada' });
        }
      }
    } catch (err) {
      setError(`Error al eliminar: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleAddContentManual = () => {
    const newC: ContentDraft = {
      cod: `NEW-${Date.now()}`,
      idMain: selectedTopicId,
      tema: 'Nueva sección...',
      contenido: '',
      videos: [],
      contexto: 'Teórico',
      order: draftContent.length + 1,
      _status: 'new',
    };
    setDraftContent(prev => [...prev, newC]);
  };

  // ========== QUIZ CRUD ==========
  const handleUpdateQuestion = (id: string, updates: Partial<QuizQuestion>) => {
    setDraftQuestions(prev => prev.map(q => {
      if (q.idQuiz === id) {
        return { ...q, ...updates, _status: q._status === 'new' ? 'new' : 'modified' };
      }
      return q;
    }));
  };

  const handleDeleteQuestion = (id: string) => {
    const q = draftQuestions.find(dq => dq.idQuiz === id);
    if (!q) return;
    setConfirmDelete({ type: 'quiz', id, label: q.question || id });
  };

  const handleAddQuizManual = () => {
    const newQ: QuizDraft = {
      idQuiz: `NEW-${Date.now()}`,
      idMain: selectedTopicId,
      question: '',
      optionA: '', optionB: '', optionC: '', optionD: '',
      correctAnswer: 'A',
      explanation: '',
      difficulty: 'Media',
      _status: 'new',
    };
    setDraftQuestions(prev => [...prev, newQ]);
  };


  // ========== SAVE ALL ==========
  const handleSaveContent = async () => {
    setIsSaving(true);
    setError(null);
    const toSave = draftContent.filter(c => c._status === 'new' || c._status === 'modified');

    try {
      if (toSave.length > 0) {
        const saveResult = await saveContentToSheets(toSave, selectedTopicId);
        if (!saveResult.success) {
          setError(`Error al guardar: ${saveResult.message}`);
          setIsSaving(false);
          return;
        }
      }
      setStatusMessage({ type: 'success', text: 'Contenido sincronizado con Google Sheets' });
      setDraftContent(prev => prev
        .map(c => ({ ...c, _status: 'unchanged' as const })));
      await onRefreshData();
    } catch (err) {
      setError(`Error al sincronizar: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveQuiz = async () => {
    // Validate all questions have complete fields
    const toSave = draftQuestions.filter(q => q._status === 'new' || q._status === 'modified');

    const incomplete = toSave.find(q =>
      !q.question.trim() || !q.optionA.trim() || !q.optionB.trim() ||
      !q.optionC.trim() || !q.optionD.trim() || !q.idMain.trim()
    );
    if (incomplete) {
      setError('Completa todos los campos de cada pregunta antes de guardar (pregunta, 4 opciones y sección).');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (toSave.length > 0) {
        const saveResult = await saveQuizToSheets(toSave, selectedTopicId);
        if (!saveResult.success) {
          setError(`Error al guardar: ${saveResult.message}`);
          setIsSaving(false);
          return;
        }
      }
      setStatusMessage({ type: 'success', text: 'Quiz sincronizado con Google Sheets' });
      setDraftQuestions(prev => prev
        .map(q => ({ ...q, _status: 'unchanged' as const })));
      await onRefreshData();
    } catch (err) {
      setError(`Error al sincronizar: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ========== COPY CSV ==========
  const handleCopyContentCSV = () => {
    const active = draftContent;
    const headers = 'Cod,IdMain,Tema,Contenido,Video_1,Video_2,Video_3,ComentarioVideo,PDF,Contexto,Orden';
    const rows = active.map(c =>
      `"${c.cod}","${c.idMain}","${c.tema}","${c.contenido.replace(/"/g, '""')}","${c.videos?.[0] || ''}","${c.videos?.[1] || ''}","${c.videos?.[2] || ''}","${(c.comentarioVideo || '').replace(/"/g, '""')}","${c.pdf || ''}","${c.contexto}","${c.order}"`
    ).join('\n');
    navigator.clipboard.writeText(`${headers}\n${rows}`);
    setStatusMessage({ type: 'success', text: 'Contenido copiado al portapapeles (CSV)' });
  };

  const handleCopyQuizCSV = () => {
    const active = draftQuestions;
    const headers = 'IdQuiz,IdMain,Pregunta,OpcionA,OpcionB,OpcionC,OpcionD,RespuestaCorrecta,Explicacion,Dificultad';
    const rows = active.map(q =>
      `"${q.idQuiz}","${q.idMain}","${q.question}","${q.optionA}","${q.optionB}","${q.optionC}","${q.optionD}","${q.correctAnswer}","${q.explanation}","${q.difficulty}"`
    ).join('\n');
    navigator.clipboard.writeText(`${headers}\n${rows}`);
    setStatusMessage({ type: 'success', text: 'Quiz copiado al portapapeles (CSV)' });
  };

  // ========== UNDO UNSAVED CHANGES ==========
  const handleUndoContent = () => {
    const existingChunks = allChunks
      .filter(c => c.idMain === selectedTopicId)
      .map(c => ({ ...c, _status: 'unchanged' as const }));
    setDraftContent(existingChunks);
    setExpandedChunks(new Set());
    setStatusMessage({ type: 'success', text: 'Cambios de contenido descartados' });
  };

  const handleUndoQuiz = () => {
    const existingQuiz = allQuizQuestions
      .filter(q => q.idMain === selectedTopicId)
      .map(q => ({ ...q, _status: 'unchanged' as const }));
    setDraftQuestions(existingQuiz);
    setStatusMessage({ type: 'success', text: 'Cambios de quiz descartados' });
  };

  const toggleChunkExpand = (cod: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod); else next.add(cod);
      return next;
    });
  };

  // ========== AUTH SCREEN ==========
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8f9fa]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md bg-white rounded-2xl p-10 border-2 border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.08)]">
          <div className="w-20 h-20 bg-[#1b4d89]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-[#1b4d89]" />
          </div>
          <h1 className="text-xl font-bold text-[#00366b] text-center mb-2">Admin Control Center</h1>
          <p className="text-[#424750] text-sm text-center mb-8">Ingresa la contraseña para acceder al panel de gestión.</p>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                placeholder="Contraseña de administrador"
                className="w-full bg-[#f8f9fa] border-b-2 border-[#c3c6d1] focus:border-[#1b4d89] px-1 py-4 text-[#191c1d] text-base outline-none transition-all pr-12"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#737781] hover:text-[#1b4d89] rounded-lg transition-colors">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {error && <p className="text-[#ba1a1a] text-sm font-semibold text-center bg-[#ffdad6]/20 py-2 rounded-lg">{error}</p>}
            <button type="submit" className="w-full bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white py-4 rounded-xl text-base font-bold shadow-lg shadow-[#1b4d89]/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Acceder al Panel</button>
            <button type="button" onClick={onBack} className="w-full text-[#737781] text-sm font-semibold hover:text-[#00366b] transition-colors">Volver</button>
          </form>
        </motion.div>
      </div>
    );
  }

  const activeContentCount = draftContent.length;
  const activeQuizCount = draftQuestions.length;
  const contentChanges = draftContent.filter(c => c._status !== 'unchanged').length;
  const quizChanges = draftQuestions.filter(q => q._status !== 'unchanged').length;

  // ========== MAIN PANEL ==========
  return (
    <div className="min-h-screen bg-[#f8f9fa] safe-area-top safe-area-bottom pb-24">
      {/* Header */}
      <header className="w-full top-0 sticky bg-white border-b border-[#e1e3e4] z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-xl bg-[#f3f4f5] hover:bg-[#e7e8e9] transition-colors active:scale-95 duration-150">
              <ChevronLeft className="w-5 h-5 text-[#424750]" />
            </button>
            <div className="flex items-center gap-3">
              <Settings className="w-7 h-7 text-[#1b4d89]" />
              <h1 className="text-xl font-bold tracking-tight text-[#00366b]">Admin Control Center</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleTestConnection} disabled={isTesting} className="p-2.5 rounded-xl hover:bg-[#f3f4f5] transition-colors" title="Test conexión">
              {isTesting ? <Loader2 className="w-5 h-5 animate-spin text-[#1b4d89]" /> : <Wifi className="w-5 h-5 text-[#424750]" />}
            </button>
            <button onClick={onRefreshData} className="p-2.5 rounded-xl hover:bg-[#f3f4f5] transition-colors" title="Refrescar datos">
              <RefreshCw className="w-5 h-5 text-[#424750]" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-6 pb-8">
        {/* Connection Test Results */}
        <AnimatePresence>
          {testResults && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-8 bg-[#f3f4f5] rounded-2xl p-6 border border-[#e1e3e4]">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-[#00366b] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#1b4d89]" /> Diagnóstico de Conexión
                </h3>
                <button onClick={() => setTestResults(null)} className="text-xs text-[#737781] hover:text-[#00366b] font-semibold transition-colors">Cerrar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { label: 'Google Sheets (lectura)', result: testResults.sheetsRead },
                  { label: 'Apps Script (escritura)', result: testResults.appsScript },
                ] as const).map(item => (
                  <div key={item.label} className={`p-4 rounded-xl border-2 ${
                    item.result.ok ? 'border-[#006d36]/30 bg-[#9af7af]/10' : 'border-[#ba1a1a]/30 bg-[#ffdad6]'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {item.result.ok ? <CheckCircle2 className="w-5 h-5 text-[#006d36]" /> : <WifiOff className="w-5 h-5 text-[#ba1a1a]" />}
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        item.result.ok ? 'text-[#006d36]' : 'text-[#ba1a1a]'
                      }`}>
                        {item.result.ok ? 'CONECTADO' : 'ERROR'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#424750] font-medium leading-relaxed">{item.label}</p>
                    {item.result.error && <p className="text-[10px] text-[#93000a] mt-2 break-all font-mono bg-white/50 p-2 rounded">{item.result.error}</p>}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page Header */}
        <div className="mb-6">
          <h2 className="text-xl leading-tight font-bold text-[#00366b] mb-1">Gestión de Contenidos</h2>
          <p className="text-[#424750] text-sm max-w-2xl">Configure y sincronice la arquitectura de contenidos educativos del sistema industrial.</p>
        </div>

        {/* Topic Selector - Custom Modern Dropdown */}
        <div className="mb-5 relative">
          <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.2em] block mb-2 px-1">Módulo Activo</label>
          <button
            onClick={() => setIsTopicSelectorOpen(!isTopicSelectorOpen)}
            className={`w-full flex items-center justify-between gap-3 bg-white border-2 rounded-2xl px-5 py-4 text-sm font-bold transition-all shadow-sm ${
              isTopicSelectorOpen ? 'border-[#1b4d89] ring-4 ring-[#1b4d89]/5' : 'border-[#e1e3e4] hover:border-[#1b4d89]/50'
            }`}
          >
            <div className="flex items-center gap-3 truncate">
              <div className={`p-2 rounded-xl flex-shrink-0 ${selectedTopicId ? 'bg-[#1b4d89]/10 text-[#1b4d89]' : 'bg-slate-100 text-slate-400'}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <span className={`truncate ${selectedTopicId ? 'text-[#00366b]' : 'text-slate-400'}`}>
                {selectedTopicId 
                  ? topics.find(t => t.id === selectedTopicId)?.title 
                  : 'Selecciona un módulo del sistema...'}
              </span>
            </div>
            {isTopicSelectorOpen ? <ChevronUp className="w-5 h-5 text-[#1b4d89]" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </button>

          <AnimatePresence>
            {isTopicSelectorOpen && (
              <>
                {/* Backdrop overlay to close on click outside */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsTopicSelectorOpen(false)} 
                />
                
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 right-0 top-full mt-3 z-50 bg-white/95 backdrop-blur-2xl rounded-2xl border border-[#e1e3e4] shadow-2xl shadow-[#001b3c]/20 max-h-[400px] overflow-hidden flex flex-col"
                >
                  <div className="p-3 border-b border-[#e1e3e4] bg-slate-50/50">
                    <p className="text-[10px] font-bold text-[#424750] uppercase tracking-wider px-2">Bibliotecas de Aprendizaje</p>
                  </div>
                  <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {topics.map(t => {
                      const isActiveTopic = selectedTopicId === t.id;
                      const audiences = t.audience.split(',').map(a => a.trim());
                      
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTopicId(t.id);
                            setActiveTab('overview');
                            setIsTopicSelectorOpen(false);
                          }}
                          className={`w-full text-left p-4 rounded-xl transition-all flex flex-col gap-2 group ${
                            isActiveTopic 
                              ? 'bg-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20' 
                              : 'hover:bg-[#1b4d89]/5 text-[#424750] hover:text-[#00366b]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm leading-tight">{t.title}</span>
                            {!t.active && (
                              <span className={`text-[9px] font-black tracking-tighter px-1.5 py-0.5 rounded-md uppercase ${
                                isActiveTopic ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
                              }`}>
                                Inactivo
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {audiences.map((aud, i) => (
                              <span 
                                key={i} 
                                className={`text-[9px] px-1.5 py-0.5 rounded-lg border font-medium ${
                                  isActiveTopic 
                                    ? 'bg-white/10 border-white/20 text-white/90' 
                                    : 'bg-slate-100 border-slate-200 text-slate-500 group-hover:bg-white group-hover:border-[#1b4d89]/20'
                                }`}
                              >
                                {aud}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`p-5 rounded-xl flex items-center gap-4 mb-6 border-l-4 ${statusMessage.type === 'success' ? 'bg-[#9af7af]/10 text-[#006d36] border-[#006d36]' : 'bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]'}`}>
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">{statusMessage.text}</span>
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-5 rounded-xl flex items-center gap-4 mb-6 bg-[#ffdad6] text-[#93000a] border border-[#ba1a1a] border-l-4">
              <WifiOff className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation */}
        {selectedTopicId && (
          <>
            <div className="flex gap-2 mb-5 bg-[#f3f4f5] p-1.5 rounded-xl border border-[#e1e3e4]">
              {([
                { key: 'overview' as AdminTab, label: 'Resumen', icon: <Search className="w-4 h-4" /> },
                { key: 'content' as AdminTab, label: `Contenido (${activeContentCount})`, icon: <BookOpen className="w-4 h-4" /> },
                { key: 'quiz' as AdminTab, label: `Quiz (${activeQuizCount})`, icon: <HelpCircle className="w-4 h-4" /> },
              ]).map(tab => (
                <motion.button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === tab.key ? 'bg-[#00366b] text-white shadow-md' : 'text-[#737781] hover:text-[#00366b] hover:bg-white/50'
                  }`}
                >
                  {tab.icon} {tab.label}
                </motion.button>
              ))}
            </div>

            {/* ====== TAB: OVERVIEW ====== */}
            {activeTab === 'overview' && selectedTopic && (
              <div className="space-y-4">
                <div className="bg-[#f3f4f5] rounded-xl p-5 border border-[#e1e3e4]">
                  <h2 className="text-base font-bold text-[#00366b] mb-1">{selectedTopic.title}</h2>
                  <p className="text-xs text-[#424750] mb-4">{selectedTopic.details}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#1b4d89]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#1b4d89]">{topicChunks.length}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Secciones</p>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#006d36]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#006d36]">{allQuizQuestions.filter(q => q.idMain === selectedTopicId).length}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Preguntas</p>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#582a00]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#582a00]">{selectedTopic.active ? 'Sí' : 'No'}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Activo</p>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#1b4d89]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#1b4d89]">{selectedTopic.audience.split(',').length}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Audiencias</p>
                    </motion.div>
                  </div>
                </div>

              </div>
            )}

            {/* ====== TAB: CONTENT ====== */}
            {activeTab === 'content' && (
              <div className="space-y-4">
                {/* Content actions bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#f3f4f5] rounded-xl p-4 border border-[#e1e3e4]">
                  <h2 className="text-sm font-bold text-[#00366b] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#1b4d89]" />
                    Contenido Educativo
                    <span className="text-xs bg-[#e1e3e4] text-[#424750] px-3 py-1.5 rounded-lg font-mono font-bold">{activeContentCount}</span>
                  </h2>
                </div>

                {/* Content list */}
                <div className="space-y-3">
                  {draftContent.map(c => {
                    const isExpanded = expandedChunks.has(c.cod);

                    return (
                      <motion.div
                        layout
                        key={c.cod}
                        className={`bg-[#f3f4f5] rounded-xl border-l-4 transition-all overflow-hidden hover:shadow-lg hover:shadow-[#1b4d89]/5 ${
                          c._status === 'new' ? 'border-[#006d36]' :
                          c._status === 'modified' ? 'border-[#1b4d89]' : 'border-[#c3c6d1]'
                        }`}
                      >
                        {/* Header row */}
                        <div className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/50 transition-colors" onClick={() => toggleChunkExpand(c.cod)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase bg-[#1b4d89]/10 text-[#1b4d89] tracking-wider">{c.contexto}</span>
                              <span className="text-[10px] text-[#737781] font-mono">{c.cod}</span>
                              {c._status !== 'unchanged' && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                  c._status === 'new' ? 'text-[#006d36]' : 'text-[#1b4d89]'
                                }`}>
                                  {c._status === 'new' ? 'NUEVO' : 'MODIFICADO'}
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-[#00366b] text-base truncate">{c.tema}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteContent(c.cod); }} className="p-2 rounded-lg text-[#737781] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/20 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-[#424750]" /> : <ChevronDown className="w-5 h-5 text-[#424750]" />}
                          </div>
                        </div>

                        {/* Expanded editor */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-6 space-y-5 border-t border-[#e1e3e4] pt-6 bg-white">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Título</label>
                                  <input
                                    type="text"
                                    value={c.tema}
                                    onChange={e => handleUpdateContent(c.cod, { tema: e.target.value })}
                                    className="w-full bg-white border-b-2 border-[#c3c6d1]/30 focus:border-[#1b4d89] px-1 py-3 text-base text-[#191c1d] placeholder-[#737781] outline-none transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Contenido (Markdown)</label>
                                  <textarea
                                    value={c.contenido}
                                    onChange={e => handleUpdateContent(c.cod, { contenido: e.target.value })}
                                    className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm text-[#191c1d] font-mono min-h-[200px] resize-y placeholder-[#737781] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    rows={8}
                                  />
                                </div>
                                <div className="flex gap-4">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Contexto</label>
                                    <select
                                      value={c.contexto}
                                      onChange={e => handleUpdateContent(c.cod, { contexto: e.target.value })}
                                      className="w-full bg-white border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm text-[#191c1d] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    >
                                      <option value="Teórico">Teórico</option>
                                      <option value="Práctico">Práctico</option>
                                      <option value="Normativo">Normativo</option>
                                      <option value="Caso Real">Caso Real</option>
                                      <option value="Procedimiento">Procedimiento</option>
                                    </select>
                                  </div>
                                  <div className="w-28">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Orden</label>
                                    <input
                                      type="number"
                                      value={c.order || 0}
                                      onChange={e => handleUpdateContent(c.cod, { order: parseInt(e.target.value) || 0 })}
                                      className="w-full bg-white border border-[#e1e3e4] rounded-lg px-3 py-3 text-sm text-[#191c1d] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    />
                                  </div>
                                </div>

                                {/* Media Section */}
                                <div className="rounded-xl border-2 border-[#1b4d89]/20 bg-[#1b4d89]/5 p-5 space-y-4">
                                  <h4 className="text-xs font-bold uppercase text-[#00366b] tracking-[0.15em] flex items-center gap-2">
                                    <Video className="w-4 h-4" /> Videos y Recursos Multimedia
                                  </h4>
                                  {[0, 1, 2].map(idx => (
                                    <div key={idx}>
                                      <label className="text-[10px] font-medium text-[#424750] block mb-1.5 flex items-center gap-1.5">
                                        <Link2 className="w-3 h-3 text-[#1b4d89]" />
                                        Video {idx + 1} <span className="text-[#737781]">(URL de Google Drive)</span>
                                      </label>
                                      <input
                                        type="url"
                                        value={c.videos?.[idx] || ''}
                                        onChange={e => {
                                          const newVideos = [...(c.videos || []), '', '', ''].slice(0, 3);
                                          newVideos[idx] = e.target.value;
                                          handleUpdateContent(c.cod, { videos: newVideos.filter((v, i) => v.trim() || i <= idx) });
                                        }}
                                        placeholder="https://drive.google.com/file/d/..."
                                        className="w-full bg-white border-b-2 border-[#c3c6d1]/30 focus:border-[#1b4d89] px-1 py-2.5 text-sm text-[#191c1d] font-mono placeholder-[#737781] outline-none transition-all"
                                      />
                                    </div>
                                  ))}
                                  <div>
                                    <label className="text-[10px] font-medium text-[#424750] block mb-1.5 flex items-center gap-1.5">
                                      <MessageSquare className="w-3 h-3 text-[#1b4d89]" />
                                      Comentario de Video
                                    </label>
                                    <textarea
                                      value={c.comentarioVideo || ''}
                                      onChange={e => handleUpdateContent(c.cod, { comentarioVideo: e.target.value })}
                                      placeholder="Nota o descripción sobre los videos de esta sesión..."
                                      className="w-full bg-white border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm text-[#191c1d] placeholder-[#737781] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all resize-y"
                                      rows={2}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-medium text-[#424750] block mb-1.5 flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <FileText className="w-3 h-3 text-[#582a00]" />
                                        PDF <span className="text-[#737781]">(URL de Google Drive)</span>
                                      </div>
                                    </label>
                                    <input
                                      type="url"
                                      value={c.pdf || ''}
                                      onChange={e => handleUpdateContent(c.cod, { pdf: e.target.value })}
                                      placeholder="https://drive.google.com/file/d/..."
                                      className="w-full bg-white border-b-2 border-[#c3c6d1]/30 focus:border-[#582a00] px-1 py-2.5 text-sm text-[#191c1d] font-mono placeholder-[#737781] outline-none transition-all"
                                    />
                                  </div>
                                </div>

                                {/* Preview */}
                                {c.contenido && (
                                  <div>
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Vista previa</label>
                                    <div className="bg-[#f8f9fa] rounded-xl p-5 border border-[#e1e3e4] markdown-content max-h-[300px] overflow-y-auto">
                                      <ReactMarkdown>{c.contenido}</ReactMarkdown>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>

                {activeContentCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#e1e3e4] flex items-center justify-center mb-3">
                      <BookOpen className="w-8 h-8 text-[#737781]" />
                    </div>
                    <p className="text-sm font-medium text-[#424750]">No hay contenido educativo aún.</p>
                    <p className="text-xs text-[#737781] mt-1">Añade secciones manualmente con el botón +</p>
                  </div>
                )}

                {/* Content footer actions */}
                {activeContentCount > 0 && (
                  <div className="sticky bottom-8 flex flex-col sm:flex-row gap-3 z-40 bg-white p-4 rounded-xl border-2 border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.08)]">
                    <button onClick={handleCopyContentCSV} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f3f4f5] rounded-xl text-[#424750] font-semibold text-sm hover:bg-[#e7e8e9] transition-all active:scale-95">
                      <Copy className="w-4 h-4" /> Exportar CSV
                    </button>
                    {contentChanges > 0 && (
                      <button onClick={handleUndoContent} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#ffdad6]/30 rounded-xl text-[#ba1a1a] font-semibold text-sm hover:bg-[#ffdad6]/60 transition-all active:scale-95">
                        <Undo2 className="w-4 h-4" /> Deshacer
                      </button>
                    )}
                    <button
                      disabled={isSaving || contentChanges === 0}
                      onClick={handleSaveContent}
                      className={`flex-[2] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        isSaving || contentChanges === 0 ? 'bg-[#e1e3e4] text-[#737781] cursor-not-allowed' : 'bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20 hover:shadow-xl hover:shadow-[#1b4d89]/30'
                      }`}
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      {isSaving ? 'Guardando...' : `Sincronizar (${contentChanges} cambios)`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ====== TAB: QUIZ ====== */}
            {activeTab === 'quiz' && (
              <div className="space-y-4">
                {/* Quiz actions bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#f3f4f5] rounded-xl p-4 border border-[#e1e3e4]">
                  <h2 className="text-sm font-bold text-[#00366b] flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-[#006d36]" />
                    Editor de Preguntas
                    <span className="text-xs bg-[#e1e3e4] text-[#424750] px-3 py-1.5 rounded-lg font-mono font-bold">{activeQuizCount}</span>
                  </h2>
                </div>

                {/* Quiz list */}
                <div className="space-y-3">
                  {draftQuestions.map((q, idx) => {
                    const isComplete = q.question.trim() && q.optionA.trim() && q.optionB.trim() && q.optionC.trim() && q.optionD.trim();
                    const isExpanded = expandedQuestions.has(q.idQuiz) || !isComplete;

                    return (
                      <motion.div
                        layout
                        key={q.idQuiz}
                        className={`bg-[#f3f4f5] rounded-xl border-l-4 transition-all overflow-hidden hover:shadow-lg hover:shadow-[#006d36]/5 ${
                          q._status === 'new' ? 'border-[#006d36]' :
                          q._status === 'modified' ? 'border-[#1b4d89]' : 'border-[#c3c6d1]'
                        }`}
                      >
                        {/* Collapsed header */}
                        <div
                          className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/50 transition-colors"
                          onClick={() => isComplete && toggleQuestionExpand(q.idQuiz)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-mono text-[#737781]">#{idx + 1}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                q.difficulty === 'Fácil' ? 'bg-[#9af7af]/20 text-[#006d36]' :
                                q.difficulty === 'Media' ? 'bg-[#1b4d89]/10 text-[#1b4d89]' :
                                'bg-[#ffdad6] text-[#ba1a1a]'
                              }`}>{q.difficulty}</span>
                              <span className="text-[10px] font-bold text-[#006d36]">✓{q.correctAnswer}</span>
                              {q._status !== 'unchanged' && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                  q._status === 'new' ? 'text-[#006d36]' : 'text-[#1b4d89]'
                                }`}>
                                  {q._status === 'new' ? 'NUEVO' : 'MODIFICADO'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-[#00366b] truncate">{q.question || 'Sin pregunta...'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.idQuiz); }} className="p-2 rounded-lg text-[#737781] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/20 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {isComplete && (isExpanded ? <ChevronUp className="w-5 h-5 text-[#424750]" /> : <ChevronDown className="w-5 h-5 text-[#424750]" />)}
                          </div>
                        </div>

                        {/* Expanded editor */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-5 space-y-4 border-t border-[#e1e3e4] pt-4 bg-white">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Pregunta</label>
                                  <textarea
                                    value={q.question}
                                    onChange={e => handleUpdateQuestion(q.idQuiz, { question: e.target.value })}
                                    className="w-full bg-[#f8f9fa] text-[#00366b] font-bold text-sm resize-none outline-none border-2 border-[#e1e3e4] focus:border-[#1b4d89] rounded-xl px-4 py-3 transition-all"
                                    rows={2}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {['A', 'B', 'C', 'D'].map(letter => {
                                    const key = `option${letter}` as keyof QuizQuestion;
                                    const isCorrect = q.correctAnswer === letter;
                                    return (
                                      <div key={letter} className="relative">
                                        <input
                                          type="text"
                                          value={q[key] as string}
                                          onChange={e => handleUpdateQuestion(q.idQuiz, { [key]: e.target.value })}
                                          className={`w-full bg-[#f8f9fa] border-2 rounded-xl pl-14 pr-4 py-3 text-sm text-[#191c1d] transition-all outline-none ${
                                            isCorrect ? 'border-[#006d36] ring-2 ring-[#006d36]/10' : 'border-[#e1e3e4] focus:border-[#1b4d89]'
                                          }`}
                                          placeholder={`Opción ${letter}`}
                                        />
                                        <button
                                          onClick={() => handleUpdateQuestion(q.idQuiz, { correctAnswer: letter as any })}
                                          className={`absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center font-black rounded-l-xl transition-all ${
                                            isCorrect ? 'bg-[#006d36] text-white shadow-md' : 'bg-[#e7e8e9] text-[#737781] hover:bg-[#d9dadb]'
                                          }`}
                                        >
                                          {letter}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="flex flex-col md:flex-row gap-3">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Justificación</label>
                                    <input
                                      type="text"
                                      value={q.explanation}
                                      onChange={e => handleUpdateQuestion(q.idQuiz, { explanation: e.target.value })}
                                      className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-xl px-4 py-3 text-sm text-[#424750] italic focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    />
                                  </div>
                                  <div className="w-full md:w-36">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Dificultad</label>
                                    <select
                                      value={q.difficulty}
                                      onChange={e => handleUpdateQuestion(q.idQuiz, { difficulty: e.target.value as any })}
                                      className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-xl px-3 py-3 text-sm text-[#191c1d] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    >
                                      <option value="Fácil">Fácil</option>
                                      <option value="Media">Media</option>
                                      <option value="Difícil">Difícil</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>

                {activeQuizCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#e1e3e4] flex items-center justify-center mb-3">
                      <HelpCircle className="w-8 h-8 text-[#737781]" />
                    </div>
                    <p className="text-sm font-medium text-[#424750]">No hay preguntas de evaluación aún.</p>
                    <p className="text-xs text-[#737781] mt-1">Añade preguntas manualmente con el botón +</p>
                  </div>
                )}

                {/* Quiz footer actions */}
                {activeQuizCount > 0 && (
                  <div className="sticky bottom-8 flex flex-col sm:flex-row gap-3 z-40 bg-white p-4 rounded-xl border-2 border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.08)]">
                    <button onClick={handleCopyQuizCSV} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f3f4f5] rounded-xl text-[#424750] font-semibold text-sm hover:bg-[#e7e8e9] transition-all active:scale-95">
                      <Copy className="w-4 h-4" /> Exportar CSV
                    </button>
                    {quizChanges > 0 && (
                      <button onClick={handleUndoQuiz} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#ffdad6]/30 rounded-xl text-[#ba1a1a] font-semibold text-sm hover:bg-[#ffdad6]/60 transition-all active:scale-95">
                        <Undo2 className="w-4 h-4" /> Deshacer
                      </button>
                    )}
                    <button
                      disabled={isSaving || quizChanges === 0}
                      onClick={handleSaveQuiz}
                      className={`flex-[2] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        isSaving || quizChanges === 0 ? 'bg-[#e1e3e4] text-[#737781] cursor-not-allowed' : 'bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20 hover:shadow-xl hover:shadow-[#1b4d89]/30'
                      }`}
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      {isSaving ? 'Guardando...' : `Sincronizar Quiz (${quizChanges} cambios)`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!selectedTopicId && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-[#e1e3e4] flex items-center justify-center mb-4">
              <Search className="w-10 h-10 text-[#737781]" />
            </div>
            <p className="text-sm font-semibold text-[#424750]">Selecciona un módulo para comenzar</p>
            <p className="text-sm text-[#737781] mt-2">Usa el selector superior para gestionar contenidos del sistema</p>
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) */}
      {selectedTopicId && (activeTab === 'content' || activeTab === 'quiz') && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={activeTab === 'content' ? handleAddContentManual : handleAddQuizManual}
          className={`fixed bottom-8 right-8 w-16 h-16 rounded-full shadow-[0_8px_24px_rgba(0,27,60,0.2)] flex items-center justify-center transition-all z-50 hover:shadow-[0_12px_32px_rgba(0,27,60,0.3)] ${
            activeTab === 'content' ? 'bg-gradient-to-r from-[#00366b] to-[#1b4d89]' :
            'bg-gradient-to-r from-[#006d36] to-[#005227]'
          }`}
          title={activeTab === 'content' ? 'Añadir sección manual' : 'Añadir pregunta manual'}
        >
          <Plus className="w-8 h-8 text-white" strokeWidth={3} />
        </motion.button>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => !isDeleting && setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-[0_16px_48px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#ffdad6] flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-[#ba1a1a]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#00366b]">Confirmar eliminación</h3>
                  <p className="text-sm text-[#737781]">
                    {confirmDelete.type === 'content' ? 'Sección de contenido' : 'Pregunta de quiz'}
                  </p>
                </div>
              </div>
              <p className="text-sm text-[#424750] mb-6 bg-[#f3f4f5] rounded-xl p-3 line-clamp-3">
                "{confirmDelete.label.substring(0, 120)}{confirmDelete.label.length > 120 ? '...' : ''}"
              </p>
              <p className="text-sm text-[#ba1a1a] font-semibold mb-6">
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl border-2 border-[#e1e3e4] text-[#424750] font-semibold text-sm hover:bg-[#f3f4f5] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteAction}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl bg-[#ba1a1a] text-white font-semibold text-sm hover:bg-[#93000a] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
