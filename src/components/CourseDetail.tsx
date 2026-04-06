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
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>

        <div className="absolute bottom-6 left-6 right-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 
              className="text-2xl sm:text-3xl font-extrabold leading-tight text-white"
              style={{ color: 'white' }}
            >
              {topic.title}
            </h1>
            <div className="flex items-center gap-2 mt-2">
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

      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-8">
        {/* Summary Section */}
        <section>
          <div className="flex items-center gap-2 mb-3 text-blue-400">
            <Info className="w-5 h-5" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Resumen del Módulo</h2>
          </div>
          <div className="glass-card rounded-2xl p-5 sm:p-6 text-slate-300 leading-relaxed shadow-xl">
            {topic.summary || topic.details}
          </div>
        </section>

        {/* Key Points Section */}
        {topic.keyPoints && topic.keyPoints.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 text-amber-400">
              <ListChecks className="w-5 h-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Puntos Clave</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topic.keyPoints.map((point, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 glass p-4 rounded-xl border-l-4 border-amber-500"
                >
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-slate-200 font-medium text-sm sm:text-base">{point}</span>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Quiz Preview Section */}
        {hasQuiz && (
          <section>
            <div className="flex items-center gap-2 mb-3 text-emerald-400">
              <HelpCircle className="w-5 h-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Evaluación Sugerida</h2>
            </div>
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <p className="text-sm text-slate-400">
                Resuelve {courseQuizQuestions.length} preguntas interactivas para validar tu conocimiento.
              </p>
              <div className="space-y-2 opacity-60">
                {courseQuizQuestions.slice(0, 2).map((q, i) => (
                  <div key={i} className="text-xs p-2 border-b border-white/5 last:border-0 italic text-slate-300">
                    " {q.question.substring(0, 60)}... "
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <button
            onClick={onStartLearning}
            className="flex-1 btn-primary py-4 text-lg shadow-2xl hover:shadow-blue-500/20"
          >
            <BookOpen className="w-6 h-6" />
            Comenzar a Aprender
          </button>
          
          <button
            disabled={!hasQuiz}
            onClick={onStartQuiz}
            className={`
              flex-1 py-4 text-lg rounded-2xl font-bold flex items-center justify-center gap-2 transition-all
              ${hasQuiz 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
            `}
          >
            <Award className="w-6 h-6" />
            {hasQuiz ? 'Evaluar Conocimiento' : 'Quiz no disponible'}
          </button>
        </div>
      </div>
    </div>
  );
}
