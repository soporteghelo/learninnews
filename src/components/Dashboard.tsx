import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, CheckCircle, Award,
  ChevronRight, TrendingUp, Clock
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

  const totalCompleted = progress.filter((p) => p.completed).length;
  const avgScore =
    progress.filter((p) => p.quizScore !== undefined).length > 0
      ? Math.round(
          progress
            .filter((p) => p.quizScore !== undefined)
            .reduce((sum, p) => sum + (p.quizScore || 0), 0) /
            progress.filter((p) => p.quizScore !== undefined).length
        )
      : null;

  return (
    <div className="min-h-screen safe-area-top safe-area-bottom">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 glass-strong px-4 py-3 sm:px-6"
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">{APP_CONFIG.name}</h1>
            <p className="text-xs text-slate-400 capitalize">{audience}</p>
          </div>
          <div className="flex items-center gap-2">
            <div /> {/* spacer — controls are in the global floating bar */}
          </div>
        </div>
      </motion.header>

      <div className="max-w-3xl mx-auto px-4 py-5 sm:px-6 space-y-5">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="glass-card rounded-xl p-3 text-center">
            <BookOpen className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{filteredTopics.length}</p>
            <p className="text-xs text-slate-400">Cursos</p>
          </div>
          <div className="glass-card rounded-xl p-3 text-center">
            <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{totalCompleted}</p>
            <p className="text-xs text-slate-400">Completados</p>
          </div>
          <div className="glass-card rounded-xl p-3 text-center">
            <Award className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">
              {avgScore !== null ? `${avgScore}%` : '—'}
            </p>
            <p className="text-xs text-slate-400">Promedio</p>
          </div>
        </motion.div>

        {/* Section title */}
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Tus cursos
          </h2>
        </div>

        {/* Course list */}
        {filteredTopics.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card rounded-2xl p-8 text-center"
          >
            <BookOpen className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">No hay cursos disponibles para tu perfil</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
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
                  className="w-full glass-card rounded-2xl p-4 sm:p-5 text-left
                    hover:border-white/20 transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3">
                    {/* Status indicator */}
                    <div
                      className={`
                        w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5
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
                      <h3 className="font-semibold text-white text-sm sm:text-base mb-1 truncate">
                        {topic.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 mb-2">
                        {topic.details}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{chunkCount} lecciones</span>
                        {quizCount > 0 && <span>{quizCount} preguntas</span>}
                        {prog?.quizScore !== undefined && (
                          <span className={`font-medium ${
                            prog.quizScore >= 70 ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            Score: {prog.quizScore}%
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {prog && !prog.completed && prog.currentChunk !== undefined && chunkCount > 0 && (
                        <div className="mt-2 progress-bar">
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.round(
                                ((prog.currentChunk + 1) / chunkCount) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1
                      group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
