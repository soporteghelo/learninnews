import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { QuizQuestion } from '../types';

type Letter = 'A' | 'B' | 'C' | 'D';

interface QuizOptionsProps {
  question: QuizQuestion;
  /** Orden barajado y estable de las opciones (anti-copia) */
  optionOrder: readonly Letter[];
  selectedOption: string | null;
  showFeedback: boolean;
  /** Bloquea la selección (p. ej. mientras se pide la confianza) */
  locked?: boolean;
  onSelect: (letter: Letter) => void;
  /** Muestra el bloque de explicación al revelar el feedback */
  showExplanation?: boolean;
}

/**
 * Render reutilizable de las opciones (A–D) de una pregunta con su feedback
 * inmediato y la explicación. Compartido por QuizMode, LessonCheck y (fase 2)
 * ReviewSession / Flashcards para no duplicar la UI de evaluación.
 */
export default function QuizOptions({
  question,
  optionOrder,
  selectedOption,
  showFeedback,
  locked = false,
  onSelect,
  showExplanation = true,
}: QuizOptionsProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2">
        {optionOrder.map((letter) => {
          const optKey = `option${letter}` as keyof QuizQuestion;
          const optText = question[optKey] as string;
          if (!optText) return null;

          const isSelected = selectedOption === letter;
          const isCorrect = letter === question.correctAnswer;

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
              disabled={showFeedback || locked}
              whileTap={{ scale: showFeedback || locked ? 1 : 0.98 }}
              key={letter}
              onClick={() => onSelect(letter)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left ${cardClass}`}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-7 h-7 rounded-md flex items-center justify-center font-black text-xs flex-shrink-0
                  ${isSelected ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-500'}
                  ${showFeedback && isCorrect ? 'bg-emerald-500 text-white' : ''}
                  ${showFeedback && isSelected && !isCorrect ? 'bg-rose-500 text-white' : ''}
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

      {showExplanation && (
        <AnimatePresence>
          {showFeedback && question.explanation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-4 p-5 rounded-2xl glass-strong border-l-4 ${selectedOption === question.correctAnswer ? 'border-emerald-500' : 'border-rose-500'}`}
            >
              <p className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Explicación</p>
              <p className="text-sm text-slate-200 leading-relaxed italic">
                "{question.explanation}"
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
