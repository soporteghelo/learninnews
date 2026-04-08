import { motion } from 'framer-motion';
import { 
  BookOpen, Award, ChevronLeft, 
  CheckCircle2, Info, ListChecks, HelpCircle
} from 'lucide-react';
import type { LearnTopic, QuizQuestion, UserProgress } from '../types';

interface CourseDetailProps {
  topic: LearnTopic;
  quizQuestions: QuizQuestion[];
  progress?: UserProgress;
  onBack: () => void;
  onStartLearning: () => void;
  onStartQuiz: () => void;
}

export default function CourseDetail({
  topic,
  quizQuestions,
  progress,
  onBack,
  onStartLearning,
  onStartQuiz,
}: CourseDetailProps) {
  const courseQuizQuestions = quizQuestions.filter(q => q.idMain === topic.id);
  const hasQuiz = courseQuizQuestions.length > 0;

  return (
    <div className="min-h-screen safe-area-top safe-area-bottom pb-10">
      {/* Header / Cover */}
      <div className="relative h-48 sm:h-64 bg-gradient-to-br from-blue-600 to-indigo-900 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
        
        <button
          onClick={onBack}
          className="absolute top-4 left-4 p-2 rounded-full glass hover:bg-white/20 transition-colors z-10"
        >
          <ChevronLeft className="w-6 h-6 text-[#ffffff]" />
        </button>

        <div className="absolute bottom-6 left-6 right-6 lg:inset-0 lg:flex lg:flex-col lg:items-center lg:justify-center lg:text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 
              className="text-2xl sm:text-3xl lg:text-5xl font-extrabold leading-tight text-[#ffffff]"
            >
              {topic.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 lg:justify-center">
              <span className="px-2 py-0.5 rounded-md bg-blue-500/30 text-blue-200 text-xs font-medium border border-blue-400/20">
                {topic.audience}
              </span>
              {progress?.completed && (
                <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Completado
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Summary Section */}
            <section>
              <div className="flex items-center gap-2 mb-4 text-blue-400">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Info className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-widest">Resumen del Módulo</h2>
              </div>
              <div className="glass-card rounded-2xl p-6 sm:p-8 text-slate-300 leading-relaxed shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -mr-16 -mt-16 rounded-full" />
                {topic.summary || topic.details}
              </div>
            </section>

            {/* Key Points Section - Moves here in mobile, or stays here if space allows */}
            {topic.keyPoints && topic.keyPoints.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4 text-amber-400">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <ListChecks className="w-5 h-5" />
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest">Puntos Clave</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {topic.keyPoints.map((point, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-4 glass p-5 rounded-2xl border-l-[6px] border-amber-500/50 hover:bg-white/5 transition-colors"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                      <span className="text-slate-200 font-bold text-sm sm:text-base leading-tight">{point}</span>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column - Side Panels & Actions */}
          <div className="lg:col-span-1 space-y-8 lg:sticky lg:top-24">
            {/* Action Buttons Panel */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-5 border-t border-white/10 shadow-2xl shadow-blue-500/5">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-2 text-center">Acciones Disponibles</h3>
               <button
                onClick={onStartLearning}
                className="w-full btn-primary py-5 text-lg shadow-[0_10px_40px_rgba(37,99,235,0.25)] relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <BookOpen className="w-6 h-6 mr-1" />
                <span>IR A LECCIÓN</span>
              </button>
              
              <button
                disabled={!hasQuiz}
                onClick={onStartQuiz}
                className={`
                  w-full py-5 text-lg rounded-2xl font-black flex items-center justify-center gap-2 transition-all relative overflow-hidden
                  ${hasQuiz 
                    ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-[0_10px_40px_rgba(16,185,129,0.2)]' 
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}
                `}
              >
                <Award className="w-6 h-6 mr-1" />
                {hasQuiz ? 'EVALUACIÓN' : 'SIN QUIZ'}
              </button>

              {/* Mostrar Nota Actual */}
              {hasQuiz && (
                <div className="pt-4 mt-2 border-t border-slate-700/50">
                  <div className="flex items-center justify-between glass px-4 py-3 rounded-xl border border-white/5 bg-slate-900/50">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Nota Actual:</span>
                    <div className="flex items-baseline gap-1">
                      {(() => {
                        // Clamp: legacy data stored as % (>20) gets converted on the fly
                        const raw = progress?.quizScore ?? 0;
                        const score = raw > 20 ? parseFloat(((raw / 100) * 20).toFixed(1)) : raw;
                        const isGood = score >= 16;
                        return (
                          <>
                            <span className={`text-2xl font-black ${
                              score > 0 ? (isGood ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-100'
                            }`}>
                              {Number(score.toFixed(1))}
                            </span>
                            <span className="text-xs font-bold text-slate-500">/ 20</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quiz Preview Section (Sidebar style) */}
            {hasQuiz && (
              <section className="glass p-6 sm:p-8 rounded-3xl border border-white/5 bg-slate-900/40">
                <div className="flex items-center gap-2 mb-4 text-emerald-400">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest">Preparación</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  Este módulo cuenta con un banco de <strong>{courseQuizQuestions.length} preguntas</strong> diseñadas para validar tu nivel técnico.
                </p>
                <div className="space-y-3 opacity-80">
                  {courseQuizQuestions.slice(0, 2).map((q, i) => (
                    <div key={i} className="text-[11px] p-3 rounded-xl bg-black/20 border border-white/5 italic text-slate-300 leading-normal">
                      " {q.question.substring(0, 65)}... "
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
