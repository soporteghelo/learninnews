import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Award,
  ArrowRight, RefreshCw, BarChart3, HelpCircle, BookmarkCheck, Loader2, Timer
} from 'lucide-react';
import { shuffleArray } from '../lib/utils';
import { fetchQuizProgressFromSheets, saveQuizProgressToSheets } from '../services/sheetsService';
import QuizOptions from './QuizOptions';
import ConfidencePrompt from './ConfidencePrompt';
import type { QuizQuestion, LearnTopic, QuizSavedProgress, Confidence } from '../types';

// Tiempo límite (segundos) por pregunta. Al agotarse, se avanza automáticamente.
const QUESTION_TIME = 30;
// Pedir autoevaluación de confianza antes de revelar el feedback (metacognición).
const ASK_CONFIDENCE = true;

interface QuizModeProps {
  topic: LearnTopic;
  questions: QuizQuestion[];
  onBack: (partialScore?: number) => void;
  onComplete: (score: number) => void;
  userDni?: string;
}

export default function QuizMode({
  topic,
  questions,
  onBack,
  onComplete,
  userDni,
}: QuizModeProps) {
  const storageKey = `ldc_quiz_progress_${topic.id}_${userDni || 'anon'}`;

  // Initialize state from localStorage (resume) or fresh shuffle
  const [initState] = useState<{
    activeQuestions: QuizQuestion[];
    currentIdx: number;
    answeredMap: Record<number, { selected: string; correct: boolean; confidence?: Confidence }>;
    score: number;
    isResumed: boolean;
  }>(() => {
    const filtered = questions.filter(q => q.idMain === topic.id);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const p: QuizSavedProgress = JSON.parse(saved);
        const qMap = new Map(filtered.map(q => [q.idQuiz, q]));
        const ordered = p.shuffledIds
          .map(id => qMap.get(id))
          .filter(Boolean) as QuizQuestion[];
        if (ordered.length === filtered.length) {
          return {
            activeQuestions: ordered,
            currentIdx: Math.min(p.currentIdx, ordered.length - 1),
            answeredMap: p.answeredMap || {},
            score: p.score || 0,
            isResumed: true,
          };
        }
      }
    } catch { /* ignore parse errors */ }
    return {
      activeQuestions: shuffleArray(filtered),
      currentIdx: 0,
      answeredMap: {},
      score: 0,
      isResumed: false,
    };
  });

  const [activeQuestions, setActiveQuestions] = useState(initState.activeQuestions);
  const [currentIdx, setCurrentIdx] = useState(initState.currentIdx);
  const [answeredMap, setAnsweredMap] = useState(initState.answeredMap);
  const [score, setScore] = useState(initState.score);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(!!userDni && !initState.isResumed);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);

  const totalQuestions = activeQuestions.length;
  const currentQuestion = activeQuestions[currentIdx];
  const answeredCount = Object.keys(answeredMap).length;
  const isResumed = initState.isResumed && answeredCount > 0;

  // Stable shuffled option order per question (anti-copy)
  const optionOrders = useMemo(
    () => activeQuestions.map(() => shuffleArray(['A', 'B', 'C', 'D'] as const)),
    [activeQuestions]
  );

  // Fetch progress from Sheets if no local progress and user is logged in
  useEffect(() => {
    if (!userDni || initState.isResumed) return;
    let cancelled = false;
    fetchQuizProgressFromSheets(userDni, topic.id).then(remote => {
      if (cancelled || !remote) { setIsLoadingSheets(false); return; }
      const filtered = questions.filter(q => q.idMain === topic.id);
      const qMap = new Map(filtered.map(q => [q.idQuiz, q]));
      const ordered = remote.shuffledIds.map(id => qMap.get(id)).filter(Boolean) as typeof filtered;
      if (ordered.length === filtered.length) {
        setActiveQuestions(ordered);
        setCurrentIdx(Math.min(remote.currentIdx, ordered.length - 1));
        setAnsweredMap(remote.answeredMap || {});
        setScore(remote.score || 0);
        try { localStorage.setItem(storageKey, JSON.stringify(remote)); } catch { /* ignore */ }
      }
      setIsLoadingSheets(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProgress = () => {
    try {
      const data: QuizSavedProgress = {
        shuffledIds: activeQuestions.map(q => q.idQuiz),
        answeredMap,
        currentIdx,
        score,
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
      if (userDni) saveQuizProgressToSheets(userDni, topic.id, data);
    } catch { /* ignore quota errors */ }
  };

  const clearProgress = () => {
    localStorage.removeItem(storageKey);
    if (userDni) saveQuizProgressToSheets(userDni, topic.id, null);
  };

  const resetQuiz = () => {
    clearProgress();
    const fresh = shuffleArray(questions.filter(q => q.idMain === topic.id));
    setActiveQuestions(fresh);
    setCurrentIdx(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setScore(0);
    setAnsweredMap({});
    setIsFinished(false);
  };

  const handleBack = () => {
    saveProgress();
    onBack(answeredCount > 0 ? runningScore : undefined);
  };

  const revealAnswer = (option: 'A' | 'B' | 'C' | 'D', confidence?: Confidence) => {
    const correct = option === currentQuestion.correctAnswer;
    if (correct) setScore(prev => prev + 1);
    setAnsweredMap(prev => ({ ...prev, [currentIdx]: { selected: option, correct, confidence } }));
    setShowFeedback(true);
  };

  const handleSelect = (option: 'A' | 'B' | 'C' | 'D') => {
    if (showFeedback || selectedOption) return;
    setSelectedOption(option);
    // Con confianza activada, esperamos su autoevaluación antes de revelar.
    if (!ASK_CONFIDENCE) revealAnswer(option);
  };

  const handleConfidence = (level: Confidence) => {
    if (!selectedOption || showFeedback) return;
    revealAnswer(selectedOption, level);
  };

  const handleNext = () => {
    if (currentIdx < totalQuestions - 1) {
      const nextIdx = currentIdx + 1;
      try {
        const data: QuizSavedProgress = {
          shuffledIds: activeQuestions.map(q => q.idQuiz),
          answeredMap,
          currentIdx: nextIdx,
          score,
        };
        localStorage.setItem(storageKey, JSON.stringify(data));
        if (userDni) saveQuizProgressToSheets(userDni, topic.id, data);
      } catch { /* ignore quota errors */ }
      setCurrentIdx(nextIdx);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      clearProgress();
      setIsFinished(true);
      onComplete(parseFloat(((score / totalQuestions) * 20).toFixed(1)));
    }
  };

  // Se agotó el tiempo: la pregunta cuenta como no respondida (incorrecta) y avanza.
  const handleTimeout = () => {
    if (showFeedback || selectedOption) return;
    setAnsweredMap(prev => ({ ...prev, [currentIdx]: { selected: '', correct: false } }));
    handleNext();
  };

  // Cuenta regresiva por pregunta. Se reinicia al cambiar de pregunta y se detiene
  // al elegir una opción (para no presionar durante la autoevaluación de confianza).
  useEffect(() => {
    if (showFeedback || selectedOption || isFinished || isLoadingSheets || totalQuestions === 0) return;
    setTimeLeft(QUESTION_TIME);
    const intervalId = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [currentIdx, showFeedback, selectedOption, isFinished, isLoadingSheets, totalQuestions]);

  // Al llegar a 0 sin respuesta, avanzar automáticamente.
  useEffect(() => {
    if (timeLeft === 0 && !showFeedback && !selectedOption && !isFinished && !isLoadingSheets && totalQuestions > 0) {
      handleTimeout();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // ── LOADING SHEETS STATE ──
  if (isLoadingSheets) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Sincronizando progreso...</p>
      </div>
    );
  }

  // ── EMPTY STATE ──
  if (totalQuestions === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-card p-10 rounded-2xl">
          <HelpCircle className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Sin Evaluación</h2>
          <p className="text-slate-400 mb-6 font-medium leading-relaxed">
            Aún no hay preguntas cargadas para el módulo <span className="text-blue-400 italic">"{topic.title}"</span>.
          </p>
          <button onClick={() => onBack()} className="btn-secondary w-full">Regresar</button>
        </div>
      </div>
    );
  }

  // ── RESULTS SCREEN ──
  if (isFinished) {
    const scoreOutOf20 = parseFloat(((score / totalQuestions) * 20).toFixed(1));
    const passed = scoreOutOf20 >= 16;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 safe-area-top safe-area-bottom">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-card rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          <div className={`absolute top-0 left-0 right-0 h-2 ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            <Award className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">¡Módulo Finalizado!</h1>
          <p className="text-slate-400 font-medium mb-8">Has completado la evaluación de {topic.title}</p>
          <div className="flex justify-center items-center gap-8 mb-10">
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Nota Final</p>
              <p className={`text-4xl font-black ${passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {scoreOutOf20}<span className="text-xl text-slate-500">/20</span>
              </p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Correctas</p>
              <p className="text-4xl font-black text-white">{score}<span className="text-xl text-slate-500">/{totalQuestions}</span></p>
            </div>
          </div>
          <div className="space-y-3">
            <button onClick={() => onBack()} className="w-full btn-primary py-4 text-lg shadow-xl">
              Finalizar y Continuar
            </button>
            <button onClick={resetQuiz} className="w-full btn-secondary py-4 text-lg flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Intentar de nuevo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Running score indicator
  const runningScore = totalQuestions > 0
    ? parseFloat(((score / totalQuestions) * 20).toFixed(1))
    : 0;

  // ── QUIZ SCREEN ──
  return (
    <div className="h-screen flex flex-col safe-area-top safe-area-bottom overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 glass-strong flex items-center justify-between z-20">
        <button onClick={handleBack} className="p-2 -ml-2 text-slate-400">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 px-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Pregunta {currentIdx + 1} de {totalQuestions}
              </span>
            </div>
            {/* Running score + answered count */}
            <div className="flex items-center gap-2">
              {!showFeedback && !selectedOption && (
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider tabular-nums border ${
                  timeLeft <= 10
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'
                    : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                }`}>
                  <Timer className="w-3 h-3" />
                  {timeLeft}s
                </span>
              )}
              {answeredCount > 0 && (
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">
                  NOTA {runningScore}/20
                </span>
              )}
              {isResumed && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase">
                  <BookmarkCheck className="w-3 h-3" />
                  Retomando
                </span>
              )}
            </div>
          </div>
          <div className="progress-bar">
            <motion.div
              className="progress-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIdx + 1) / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-6 py-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-3xl mx-auto w-full pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Question Card */}
              <div className="glass-card rounded-2xl p-6 sm:p-8 relative">
                <div className="absolute -top-3 left-6 flex items-center gap-2">
                  <div className="px-3 py-1 bg-blue-600 rounded-lg shadow-lg text-[10px] font-black uppercase text-white border border-blue-400/30">
                    {currentQuestion.difficulty}
                  </div>
                  {currentQuestion.categoriaContenido && (
                    <div className="quiz-category-badge px-3 py-1 rounded-lg shadow-sm text-[10px] font-black uppercase max-w-[160px] truncate">
                      {currentQuestion.categoriaContenido}
                    </div>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* Options + feedback + explanation (componente reutilizable) */}
              <QuizOptions
                question={currentQuestion}
                optionOrder={optionOrders[currentIdx]}
                selectedOption={selectedOption}
                showFeedback={showFeedback}
                locked={!!selectedOption && !showFeedback}
                onSelect={handleSelect}
              />

              {/* Autoevaluación de confianza (antes de revelar el feedback) */}
              {ASK_CONFIDENCE && selectedOption && !showFeedback && (
                <ConfidencePrompt onSelect={handleConfidence} />
              )}

              {/* Next button */}
              {showFeedback && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <button
                    onClick={handleNext}
                    className={`
                      w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-2xl transition-all
                      ${currentIdx === totalQuestions - 1 ? 'bg-emerald-600 text-white shadow-emerald-600/30' : 'btn-primary'}
                    `}
                  >
                    {currentIdx === totalQuestions - 1 ? 'Ver Resultado Final' : 'Siguiente Pregunta'}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
