import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, Award, CheckCircle2, XCircle, 
  ArrowRight, RefreshCw, BarChart3, HelpCircle 
} from 'lucide-react';
import { shuffleArray } from '../lib/utils';
import type { QuizQuestion, LearnTopic } from '../types';

interface QuizModeProps {
  topic: LearnTopic;
  questions: QuizQuestion[];
  onBack: () => void;
  onComplete: (score: number) => void;
}

export default function QuizMode({
  topic,
  questions,
  onBack,
  onComplete,
}: QuizModeProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Shuffle questions once on mount
  const shuffledQuestions = useMemo(() => {
    return shuffleArray(questions.filter(q => q.idMain === topic.id));
  }, [questions, topic.id]);

  // Shuffle option order per question for anti-copy
  const optionOrders = useMemo(() => {
    return shuffledQuestions.map(() => shuffleArray(['A', 'B', 'C', 'D'] as const));
  }, [shuffledQuestions]);

  const currentQuestion = shuffledQuestions[currentIdx];
  const totalQuestions = shuffledQuestions.length;

  const handleSelect = (option: 'A' | 'B' | 'C' | 'D') => {
    if (showFeedback) return;
    setSelectedOption(option);
    setShowFeedback(true);
    
    if (option === currentQuestion.correctAnswer) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIdx < totalQuestions - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      setIsFinished(true);
      const totalCorrect = score + (selectedOption === currentQuestion.correctAnswer ? 1 : 0); 
      onComplete(Math.round((totalCorrect / totalQuestions) * 100));
    }
  };

  if (totalQuestions === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-card p-10 rounded-2xl">
          <HelpCircle className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Sin Evaluación</h2>
          <p className="text-slate-400 mb-6 font-medium leading-relaxed">
            Aún no hay preguntas cargadas para el módulo <span className="text-blue-400 italic">"{topic.title}"</span>.
          </p>
          <button onClick={onBack} className="btn-secondary w-full">Regresar</button>
        </div>
      </div>
    );
  }

  if (isFinished) {
    const percentage = Math.round((score / totalQuestions) * 100);
    const passed = percentage >= 70;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 safe-area-top safe-area-bottom">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-card rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          {/* Background Highlight */}
          <div className={`absolute top-0 left-0 right-0 h-2 ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          
          <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            <Award className="w-10 h-10" />
          </div>

          <h1 className="text-3xl font-extrabold text-white mb-2">¡Módulo Finalizado!</h1>
          <p className="text-slate-400 font-medium mb-8">Has completado la evaluación de {topic.title}</p>

          <div className="flex justify-center items-center gap-8 mb-10">
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Resultado</p>
              <p className={`text-4xl font-black ${passed ? 'text-emerald-400' : 'text-rose-400'}`}>{percentage}%</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Aprobado</p>
              <p className="text-4xl font-black text-white">{passed ? 'SÍ' : 'NO'}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={onBack}
              className="w-full btn-primary py-4 text-lg shadow-xl"
            >
              Finalizar y Continuar
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="w-full btn-secondary py-4 text-lg flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Intentar de nuevo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col safe-area-top safe-area-bottom overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 glass-strong flex items-center justify-between z-20">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-400">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 px-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Pregunta {currentIdx + 1} de {totalQuestions}
            </span>
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
              <div className="absolute -top-3 left-6 px-3 py-1 bg-blue-600 rounded-lg shadow-lg text-[10px] font-black uppercase text-white border border-blue-400/30">
                {currentQuestion.difficulty}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-1 gap-3">
              {optionOrders[currentIdx].map((letter) => {
                const optKey = `option${letter}` as keyof QuizQuestion;
                const optText = currentQuestion[optKey] as string;
                if (!optText) return null;

                const isSelected = selectedOption === letter;
                const isCorrect = letter === currentQuestion.correctAnswer;
                
                let cardClass = 'glass hover:bg-white/5 border-white/10';
                let icon = null;

                if (showFeedback) {
                  if (isCorrect) {
                     cardClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-400 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-500/10';
                     icon = <CheckCircle2 className="w-6 h-6" />;
                  } else if (isSelected) {
                     cardClass = 'bg-rose-500/20 border-rose-500 text-rose-400 ring-1 ring-rose-500/30 shadow-lg shadow-rose-500/10';
                     icon = <XCircle className="w-6 h-6" />;
                  } else {
                     cardClass = 'opacity-40 border-white/5';
                  }
                } else if (isSelected) {
                   cardClass = 'bg-blue-600/30 border-blue-400 text-blue-200 ring-1 ring-blue-500/30';
                }

                return (
                  <motion.button
                    disabled={showFeedback}
                    whileTap={{ scale: showFeedback ? 1 : 0.98 }}
                    key={letter}
                    onClick={() => handleSelect(letter as any)}
                    className={`
                      w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left
                      ${cardClass}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0
                        ${isSelected ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-500'}
                        ${showFeedback && isCorrect ? 'bg-emerald-500 text-white shadow-emerald-500/50' : ''}
                        ${showFeedback && isSelected && !isCorrect ? 'bg-rose-500 text-white shadow-rose-500/50' : ''}
                      `}>
                        {letter}
                      </div>
                      <span className="font-semibold text-sm">{optText}</span>
                    </div>
                    {icon}
                  </motion.button>
                );
              })}
            </div>

            {/* Explanation Feedback */}
            <AnimatePresence>
              {showFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-5 rounded-2xl glass-strong border-l-4 ${selectedOption === currentQuestion.correctAnswer ? 'border-emerald-500' : 'border-rose-500'}`}
                >
                  <p className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Explicación</p>
                  <p className="text-sm text-slate-200 leading-relaxed italic">
                    "{currentQuestion.explanation}"
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Next button inline */}
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
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
