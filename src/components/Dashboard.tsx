import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, CheckCircle, Award,
  ChevronRight, TrendingUp, Clock,
  ExternalLink, MessageCircle, FileSignature, Play
} from 'lucide-react';
import { APP_CONFIG, AUDIENCE_CONFIG } from '../config/app.config';
import type { LearnTopic, DataChunk, QuizQuestion, UserProgress, AudienceType } from '../types';

// Chip color per profile color key — dark / light variants
const CHIP_DARK: Record<string, string> = {
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  blue: 'bg-blue-500/20   text-blue-300   border-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};
const CHIP_LIGHT: Record<string, string> = {
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  blue: 'bg-blue-100   text-blue-700   border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  yellow: 'bg-amber-100  text-amber-700  border-amber-200',
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

interface DashboardProps {
  audience: AudienceType[];
  topics: LearnTopic[];
  chunks: DataChunk[];
  quizQuestions: QuizQuestion[];
  progress: UserProgress[];
  onSelectTopic: (topic: LearnTopic) => void;
  onChangeAudience: () => void;
  onOpenAdmin: () => void;
  onClaimCertificate: (topic: LearnTopic) => void;
  onOpenActas?: () => void;
  actasPendientes?: number;
  actasAsignadas?: number;
  actasEnabled?: boolean;
  userSession: any;
  darkMode?: boolean;
  tutorialUrl?: string;
  onPlayTutorial?: () => void;
}

export default function Dashboard({
  audience,
  topics,
  chunks,
  quizQuestions,
  progress,
  onSelectTopic,
  onOpenAdmin,
  onClaimCertificate,
  onOpenActas,
  actasPendientes = 0,
  actasAsignadas = 0,
  actasEnabled = true,
  userSession,
  darkMode = true,
  tutorialUrl,
  onPlayTutorial,
}: DashboardProps) {
  const [showCertOptions, setShowCertOptions] = useState<string | null>(null);

  const profileColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of AUDIENCE_CONFIG.profiles) map[p.id] = p.color;
    return map;
  }, []);
  const userAudiencesLower = useMemo(
    () => audience.map(a => a.toLowerCase()),
    [audience]
  );

  const filteredTopics = useMemo(() => {
    return topics
      .filter((t) => t.active !== false)
      .filter((t) => {
        const topicAuds = t.audience.split(',').map((a) => a.trim().toLowerCase());
        return userAudiencesLower.some(ua => topicAuds.includes(ua));
      })
      .sort((a, b) => (a.order || 999) - (b.order || 999));
  }, [topics, userAudiencesLower]);

  const chunkCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of chunks) map[c.idMain] = (map[c.idMain] || 0) + 1;
    return map;
  }, [chunks]);

  const quizCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of quizQuestions) map[q.idMain] = (map[q.idMain] || 0) + 1;
    return map;
  }, [quizQuestions]);

  const progressMap = useMemo(() => {
    const map: Record<string, typeof progress[number]> = {};
    for (const p of progress) map[p.topicId] = p;
    return map;
  }, [progress]);

  // Passing score: 16/20 = 80%
  const PASSING_SCORE = 16;

  const totalApproved = filteredTopics.filter(t => {
    const p = progressMap[t.id];
    return p?.quizScore !== undefined && p.quizScore >= PASSING_SCORE;
  }).length;

  const approvedPct = filteredTopics.length > 0
    ? Math.round((totalApproved / filteredTopics.length) * 100)
    : 0;

  return (
    <div className="min-h-screen safe-area-top safe-area-bottom">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 glass-strong px-4 py-3 sm:px-6"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div data-tour="perfil">
            <h1 className="text-lg font-bold text-white">{APP_CONFIG.name}</h1>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {audience.map(a => {
                const color = profileColorMap[a] ?? 'blue';
                const chipClass = darkMode ? CHIP_DARK[color] : CHIP_LIGHT[color];
                return (
                  <span key={a} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${chipClass}`}>
                    {a}
                  </span>
                );
              })}
            </div>
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
        {/* Actas y Compromisos — visible si el módulo está habilitado en CONFIG (columna Actas)
            y el usuario tiene documentos asignados, sin importar su avance en los cursos. */}
        {onOpenActas && actasEnabled && actasAsignadas > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.99 }}
            onClick={onOpenActas}
            data-tour="actas"
            className={`w-full glass-card rounded-2xl p-4 text-left border transition-all flex items-center gap-3 group ${
              actasPendientes > 0 ? 'border-amber-500/30 hover:border-amber-500/50' : 'border-emerald-500/20 hover:border-emerald-500/40'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${
              actasPendientes > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'
            }`}>
              <FileSignature className={`w-5 h-5 ${actasPendientes > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Actas y Compromisos</p>
              <p className="text-slate-400 text-xs">
                {actasPendientes > 0
                  ? `${actasPendientes} documento${actasPendientes > 1 ? 's' : ''} por firmar`
                  : 'Todos tus documentos están firmados'}
              </p>
            </div>
            {actasPendientes > 0 && (
              <span className="flex-shrink-0 min-w-[26px] h-[26px] px-2 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center">
                {actasPendientes}
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors flex-shrink-0" />
          </motion.button>
        )}

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          data-tour="stats"
          className="grid grid-cols-3 gap-4 md:gap-6"
        >
          <div className="glass-card rounded-2xl p-4 text-center">
            <BookOpen className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <p className="text-xl font-bold text-white">{filteredTopics.length}</p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-tight">Cursos</p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-center">
            <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-xl font-bold text-white">{totalApproved}</p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-tight">Aprobados</p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-center">
            <Award className={`w-5 h-5 mx-auto mb-2 ${approvedPct === 100 ? 'text-emerald-400' : approvedPct > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
            <p className={`text-xl font-bold leading-none ${approvedPct === 100 ? 'text-emerald-400' : approvedPct > 0 ? 'text-amber-400' : 'text-white'}`}>
              {approvedPct}%
            </p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-tight mt-1">Aprobados</p>
            <p className="text-[9px] text-slate-500 font-bold tracking-widest mt-0.5">{totalApproved}/{filteredTopics.length}</p>
          </div>
        </motion.div>

        {/* Section title */}
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
              Tus cursos programados
            </h2>
          </div>
          {userSession && (
            <p className="text-xs font-semibold text-slate-400 mt-1 ml-6">
              {userSession.nombres} {userSession.apellidos}
            </p>
          )}
        </div>

        {/* Course list - Grid responsivo adaptado para Desktop ampliado */}
        {filteredTopics.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            data-tour="cursos"
            className="glass-card rounded-2xl p-12 text-center"
          >
            <BookOpen className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay lecciones disponibles para tu perfil</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 xl:gap-8">
            {filteredTopics.map((topic, index) => {
              const prog = progressMap[topic.id];
              const chunkCount = chunkCountMap[topic.id] || 0;
              const quizCount = quizCountMap[topic.id] || 0;

              // El recorrido guiado resalta la primera tarjeta como ejemplo (data-tour)
              return (
                <motion.button
                  key={topic.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + index * 0.06 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelectTopic(topic)}
                  data-tour={index === 0 ? 'cursos' : undefined}
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
                          <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider ${prog.quizScore >= PASSING_SCORE ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                            PTS: {prog.quizScore}/20
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Certificate CTA — only for passing courses */}
                  {prog?.quizScore !== undefined && prog.quizScore >= PASSING_SCORE && (
                    <div className="mt-3">
                      {!userSession?.certificadoUrls?.[topic.id] ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onClaimCertificate(topic); }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all shadow-md shadow-blue-600/20"
                        >
                          <div className="flex items-center gap-2">
                            <Award className="w-3.5 h-3.5 text-white/80" />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Generar Certificado</span>
                          </div>
                          <span className="text-white/60 text-xs">→</span>
                        </button>
                      ) : (
                        <div>
                          {/* Toggle button — rounds only top when expanded */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCertOptions(prev => prev === topic.id ? null : topic.id);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition-all shadow-md shadow-emerald-600/20 ${
                              showCertOptions === topic.id ? 'rounded-t-lg' : 'rounded-lg'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Award className="w-3.5 h-3.5 text-yellow-300" />
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">Ver Certificado</span>
                            </div>
                            <span className={`text-white/80 text-[9px] transition-transform duration-200 inline-block ${
                              showCertOptions === topic.id ? 'rotate-180' : ''
                            }`}>▼</span>
                          </button>

                          {/* Inline options — no absolute positioning, no overflow issue */}
                          {showCertOptions === topic.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-b-lg overflow-hidden border border-t-0 border-emerald-700/50 bg-slate-900"
                            >
                              <a
                                href={userSession.certificadoUrls?.[topic.id]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 active:bg-white/10 transition-colors border-b border-white/5"
                                onClick={() => setShowCertOptions(null)}
                              >
                                <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                  <ExternalLink className="w-3 h-3 text-blue-400" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-200 uppercase tracking-widest">Abrir en Drive</span>
                              </a>
                              <a
                                href={`https://wa.me/${userSession.celular || ''}?text=${encodeURIComponent(`Hola, aquí tienes mi certificado oficial de capacitación "${topic.title}": ${userSession.certificadoUrls?.[topic.id] ?? ''}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 active:bg-white/10 transition-colors"
                                onClick={() => setShowCertOptions(null)}
                              >
                                <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                  <MessageCircle className="w-3 h-3 text-emerald-400" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-200 uppercase tracking-widest">Enviar a WhatsApp</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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

      {/* Botón flotante — tutorial en video */}
      {tutorialUrl && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.92 }}
          onClick={onPlayTutorial}
          data-tour="tutorial"
          title="Ver tutorial"
          className="fixed right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/40 border border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <Play className="w-6 h-6 text-white fill-white ml-0.5" />
        </motion.button>
      )}
    </div>
  );
}
