import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, CheckCircle, Award,
  ChevronRight, TrendingUp, Clock, ExternalLink
} from 'lucide-react';
import { APP_CONFIG } from '../config/app.config';
import type { LearnTopic, DataChunk, QuizQuestion, UserProgress, AudienceType } from '../types';

interface DashboardProps {
  audience: AudienceType;
  topics: LearnTopic[];
  chunks: DataChunk[];
  quizQuestions: QuizQuestion[];
  progress: UserProgress[];
  onSelectTopic: (topic: LearnTopic) => void;
  onChangeAudience: () => void;
  onOpenAdmin: () => void;
  onClaimCertificate: () => void;
  userSession: any;
}

export default function Dashboard({
  audience,
  topics,
  chunks,
  quizQuestions,
  progress,
  onSelectTopic,
  onChangeAudience,
  onOpenAdmin,
  onClaimCertificate,
  userSession,
}: DashboardProps) {
  const filteredTopics = useMemo(() => {
    return topics
      .filter((t) => t.active !== false)
      .filter((t) => {
        const audiences = t.audience.split(',').map((a) => a.trim());
        return audiences.some(
          (a) => a.toLowerCase() === audience.toLowerCase()
        );
      })
      .sort((a, b) => (a.order || 999) - (b.order || 999));
  }, [topics, audience]);

  const getTopicProgress = (topicId: string) => {
    return progress.find((p) => p.topicId === topicId);
  };

  const getChunkCount = (topicId: string) => {
    return chunks.filter((c) => c.idMain === topicId).length;
  };

  const getQuizCount = (topicId: string) => {
    return quizQuestions.filter((q) => q.idMain === topicId).length;
  };

  // Passing score: 19/20 = 95%
  const PASSING_SCORE = 19;
  const MAX_SCORE = 20;

  const totalCompleted = progress.filter((p) => p.completed).length;
  const avgScore =
    progress.filter((p) => p.quizScore !== undefined).length > 0
      ? parseFloat((
          progress
            .filter((p) => p.quizScore !== undefined)
            .reduce((sum, p) => sum + (p.quizScore || 0), 0) /
          progress.filter((p) => p.quizScore !== undefined).length
        ).toFixed(1))
      : null;

  const allModulesCompleted = filteredTopics.length > 0 && totalCompleted >= filteredTopics.length;
  const meetsScoreThreshold = avgScore !== null && avgScore >= PASSING_SCORE;
  const canClaimCertificate = allModulesCompleted && meetsScoreThreshold;

  return (
    <div className="min-h-screen safe-area-top safe-area-bottom">
      {/* Header */}
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 glass-strong px-4 py-3 sm:px-6"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div onClick={onChangeAudience} className="cursor-pointer hover:opacity-80 transition-opacity">
            <h1 className="text-lg font-bold text-white">{APP_CONFIG.name}</h1>
            <p className="text-xs text-slate-400 capitalize">{audience}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onOpenAdmin}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title="Panel de Administración"
            >
              <TrendingUp className="w-5 h-5 rotate-45" /> {/* Using TrendingUp as a tech-looking icon */}
            </button>
          </div>
        </div>
      </motion.header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-8 space-y-8">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-4 md:gap-6"
        >
          <div className="glass-card rounded-2xl p-4 text-center">
            <BookOpen className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <p className="text-xl font-bold text-white">{filteredTopics.length}</p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-tight">Cursos</p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-center">
            <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-xl font-bold text-white">{totalCompleted}</p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-tight">Hechos</p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-center">
            <Award className={`w-5 h-5 mx-auto mb-2 ${meetsScoreThreshold ? 'text-emerald-400' : avgScore !== null ? 'text-amber-400' : 'text-amber-400'}`} />
            <p className={`font-bold leading-none ${meetsScoreThreshold ? 'text-emerald-400' : 'text-white'}`}>
              <span className="text-xl">{avgScore !== null ? avgScore : '—'}</span>
              {avgScore !== null && <span className="text-xs text-slate-500 font-bold">/{MAX_SCORE}</span>}
            </p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-tight mt-1">Calificación</p>
            <p className="text-[9px] text-slate-500 font-bold tracking-widest mt-0.5">MÍN. {PASSING_SCORE}/20</p>
          </div>
        </motion.div>

        {/* Certificate Section — shown when all modules are done */}
        {allModulesCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden group"
          >
            {/* Background glow — green if passed, amber if not */}
            <div className={`absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity rounded-2xl bg-gradient-to-r ${
              canClaimCertificate || userSession?.certificadoUrl
                ? 'from-blue-600 to-indigo-600'
                : 'from-amber-600 to-orange-600'
            }`} />

            <div className={`relative glass-card rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 ${
              canClaimCertificate || userSession?.certificadoUrl ? 'border-blue-500/30' : 'border-amber-500/30'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center border ${
                  canClaimCertificate || userSession?.certificadoUrl
                    ? 'bg-blue-500/20 border-blue-500/30'
                    : 'bg-amber-500/20 border-amber-500/30'
                }`}>
                  <Award className={`w-8 h-8 ${
                    canClaimCertificate || userSession?.certificadoUrl ? 'text-blue-400' : 'text-amber-400'
                  }`} />
                </div>
                <div>
                  {userSession?.certificadoUrl ? (
                    <>
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter">¡Certificado Disponible!</h3>
                      <p className="text-slate-400 text-sm max-w-sm">Ya puedes visualizar y descargar tu certificado oficial "ANEXO 04" desde Google Drive.</p>
                    </>
                  ) : canClaimCertificate ? (
                    <>
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter">¡Aprobado! Genera tu Certificado</h3>
                      <p className="text-slate-400 text-sm max-w-sm">Completaste todos los módulos con nota aprobatoria ({avgScore}/{MAX_SCORE} ≥ {PASSING_SCORE}/{MAX_SCORE}). Ya puedes emitir tu ANEXO 04 oficial.</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-black text-amber-400 uppercase tracking-tighter">Nota Insuficiente</h3>
                      <p className="text-slate-400 text-sm max-w-sm">
                        Tu nota actual es <span className="font-black text-amber-400">{avgScore ?? 0}/{MAX_SCORE}</span>. Necesitas al menos <span className="font-black text-white">{PASSING_SCORE}/{MAX_SCORE}</span> para generar el certificado. Repasa los quizzes.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                {userSession?.certificadoUrl ? (
                  <a
                    href={userSession.certificadoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-8 py-4 bg-white text-slate-950 rounded-xl font-black text-xs tracking-widest hover:scale-105 active:scale-95 transition-all text-center"
                  >
                    VER MI CERTIFICADO
                  </a>
                ) : canClaimCertificate ? (
                  <button
                    onClick={onClaimCertificate}
                    className="px-8 py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:scale-105 active:scale-95 transition-all"
                  >
                    GENERAR ANEXO 04
                  </button>
                ) : (
                  <div className="px-8 py-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl font-black text-xs tracking-widest text-center cursor-not-allowed">
                    BLOQUEADO — {avgScore ?? 0}/{MAX_SCORE} (mín. {PASSING_SCORE})
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Section title */}
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
            Tus cursos cargados
          </h2>
        </div>

        {/* Course list - Grid responsivo adaptado para Desktop ampliado */}
        {filteredTopics.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card rounded-2xl p-12 text-center"
          >
            <BookOpen className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay lecciones disponibles para tu perfil</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 xl:gap-8">
            {filteredTopics.map((topic, index) => {
              const prog = getTopicProgress(topic.id);
              const chunkCount = getChunkCount(topic.id);
              const quizCount = getQuizCount(topic.id);

              return (
                <motion.button
                  key={topic.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + index * 0.06 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelectTopic(topic)}
                  className="w-full glass-card rounded-xl p-3.5 text-left border border-white/5
                    hover:border-blue-500/30 hover:bg-white/5 transition-all duration-300 group shadow-lg relative overflow-hidden"
                >
                  <div className="flex items-center gap-3">
                    {/* Icon container */}
                    <div
                      className={`
                        w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                        ${prog?.completed
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : prog
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }
                      `}
                    >
                      {prog?.completed ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : prog ? (
                        <Clock className="w-5 h-5" />
                      ) : (
                        <BookOpen className="w-5 h-5" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-white text-sm truncate">
                          {topic.title}
                        </h3>
                        {prog?.completed ? (
                          <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1 flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> COMPLETO
                          </span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-all flex-shrink-0" />
                        )}
                      </div>
                      
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 mb-1.5">
                        {topic.details}
                      </p>

                      {/* Meta chips */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] uppercase font-bold text-slate-400 tracking-wider">
                          {chunkCount} Lecc
                        </span>
                        {quizCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] uppercase font-bold text-slate-400 tracking-wider">
                            {quizCount} Pregs
                          </span>
                        )}
                        {prog?.quizScore !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider ${
                            prog.quizScore >= 19 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            PTS: {prog.quizScore}/20
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Absolute Progress bar edge footer */}
                  {prog && !prog.completed && prog.currentChunk !== undefined && chunkCount > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50">
                      <div
                        className="h-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)] transition-all duration-500"
                        style={{
                          width: `${Math.round(((prog.currentChunk + 1) / chunkCount) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating "Ver Mi Certificado" button — always visible when URL exists */}
      {userSession?.certificadoUrl && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <a
            href={userSession.certificadoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase shadow-2xl
              bg-gradient-to-r from-blue-600 to-indigo-600 text-white
              hover:from-blue-500 hover:to-indigo-500 hover:scale-105 active:scale-95 transition-all
              border border-white/20 backdrop-blur-xl"
            style={{ boxShadow: '0 0 30px rgba(37,99,235,0.45)' }}
          >
            <Award className="w-4 h-4 text-yellow-300 flex-shrink-0" />
            Ver Mi Certificado
            <ExternalLink className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
          </a>
        </motion.div>
      )}
    </div>
  );
}
