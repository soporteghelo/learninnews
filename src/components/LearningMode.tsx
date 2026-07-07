import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RichContent from './RichContent';
import {
  ChevronLeft, ChevronRight, CheckCircle2,
  Play, FileText, ChevronDown, BookOpen, ListChecks, Award
} from 'lucide-react';
import type { LearnTopic, DataChunk } from '../types';

interface LearningModeProps {
  topic: LearnTopic;
  chunks: DataChunk[];
  onBack: () => void;
  onFinish: () => void;
  onSaveProgress: (chunkIndex: number) => void;
  onOpenMedia: (url: string, type: 'video' | 'pdf') => void;
  initialChunkIndex?: number;
}

function getDriveThumbUrl(url: string): string {
  if (!url) return '';
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w640`;
  }
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url.trim())) {
    return `https://drive.google.com/thumbnail?id=${url.trim()}&sz=w640`;
  }
  return '';
}

export default function LearningMode({
  topic,
  chunks,
  onBack,
  onFinish,
  onSaveProgress,
  onOpenMedia,
  initialChunkIndex = 0,
}: LearningModeProps) {
  const [currentIndex, setCurrentIndex] = useState(initialChunkIndex);
  const [viewMode, setViewMode] = useState<'video' | 'read'>('video');
  const [showRecap, setShowRecap] = useState(false);
  const currentChunk = chunks[currentIndex];
  const progressPercent = chunks.length > 0
    ? Math.round(((currentIndex + 1) / chunks.length) * 100)
    : 0;
  const contentRef = useRef<HTMLDivElement>(null);
  const onSaveProgressRef = useRef(onSaveProgress);
  useEffect(() => { onSaveProgressRef.current = onSaveProgress; });

  // Reset view mode to 'video' on chunk change
  useEffect(() => { setViewMode('video'); }, [currentIndex]);

  // Save progress and scroll to top on chunk change (forward navigation)
  useEffect(() => {
    onSaveProgressRef.current(currentIndex);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex]);

  const nextSlide = useCallback(() => {
    if (currentIndex < chunks.length - 1) setCurrentIndex(i => i + 1);
    else setShowRecap(true);
  }, [currentIndex, chunks.length]);

  const prevSlide = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  if (chunks.length === 0) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-card p-10 rounded-2xl max-w-sm">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
            <ChevronDown className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Sin contenido</h2>
          <p className="text-slate-400 mb-6 text-sm leading-relaxed">
            Este módulo aún no tiene lecciones cargadas.
          </p>
          <button onClick={onBack} className="btn-secondary w-full">Regresar</button>
        </div>
      </div>
    );
  }

  if (!currentChunk) return null;

  // ── RECAPITULACIÓN AL FINALIZAR EL MÓDULO (antes de la evaluación) ──
  if (showRecap) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 overflow-y-auto safe-area-top safe-area-bottom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg glass-card rounded-3xl p-8 my-auto"
        >
          <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Award className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white text-center mb-1">¡Módulo completado!</h1>
          <p className="text-slate-400 text-sm text-center mb-6">
            Antes de la evaluación, repasa lo esencial de <span className="text-white font-semibold">{topic.title}</span>.
          </p>

          {topic.keyPoints && topic.keyPoints.length > 0 && (
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-3 text-amber-400">
                <ListChecks className="w-4 h-4" />
                <h2 className="text-xs font-black uppercase tracking-widest">Puntos clave</h2>
              </div>
              <div className="space-y-2">
                {topic.keyPoints.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 glass px-3 py-2.5 rounded-xl border-l-4 border-amber-500/50">
                    <div className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="text-slate-200 text-xs font-semibold leading-snug">{p}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-7">
            <div className="flex items-center gap-2 mb-3 text-blue-400">
              <BookOpen className="w-4 h-4" />
              <h2 className="text-xs font-black uppercase tracking-widest">Temas cubiertos</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {chunks.map((c, i) => (
                <span key={c.cod} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                  {i + 1}. {c.tema}
                </span>
              ))}
            </div>
          </section>

          <button
            onClick={onFinish}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" /> Ir a la evaluación
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col lg:flex-row safe-area-top safe-area-bottom overflow-hidden">
      {/* Sidebar - Desktop Only */}
      <aside className="hidden lg:flex w-80 flex-shrink-0 flex-col bg-slate-900 border-r border-white/5 z-40 overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest mb-6">
            <ChevronLeft className="w-4 h-4" /> Volver al Tema
          </button>
          <h3 className="text-white font-extrabold text-lg leading-tight line-clamp-2">{topic.title}</h3>
          <div className="mt-4 progress-bar h-1.5">
            <motion.div className="progress-bar-fill" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-2 text-[10px] text-blue-400 font-bold uppercase tracking-widest">{currentIndex + 1} de {chunks.length} lecciones</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {chunks.map((chunk, idx) => (
            <button
              key={chunk.cod}
              onClick={() => setCurrentIndex(idx)}
              className={`w-full flex items-start gap-3 p-4 rounded-2xl transition-all text-left ${
                currentIndex === idx 
                ? 'bg-blue-600/20 border border-blue-500/30 text-white shadow-lg' 
                : 'hover:bg-white/5 text-slate-400 border border-transparent'
              }`}
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-black ${
                currentIndex === idx ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold truncate ${currentIndex === idx ? 'text-blue-200' : ''}`}>{chunk.tema}</p>
                <p className="text-[10px] opacity-50 truncate mt-0.5 capitalize">{chunk.contexto || 'Sección'}</p>
              </div>
              {idx < currentIndex && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        {/* Header - Mobile Only */}
        <header className="lg:hidden flex-shrink-0 px-4 py-3 glass flex items-center justify-between z-30">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-400">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="text-center flex-1 min-w-0">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-tighter truncate">
              {topic.title}
            </h2>
            <p className="text-[10px] text-blue-400 font-mono">
              {currentIndex + 1} DE {chunks.length}
            </p>
          </div>
          <div className="w-10"></div> {/* Spacer to keep title centered */}
        </header>

        {/* Progress - Mobile Only */}
        <div className="lg:hidden flex-shrink-0 h-1 bg-white/5 w-full">
          <motion.div className="h-full bg-blue-500" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} />
        </div>

        {/* Scrollable Content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain flex justify-center"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="w-full max-w-4xl px-6 py-10 lg:py-16 pb-48">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                {/* Context Badge */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-[0.15em] border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                    {currentChunk.contexto || 'Fundamentos'}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                </div>

                <h1 className="text-3xl lg:text-4xl font-black text-white mb-8 lg:mb-10 leading-tight tracking-tight">
                  {currentChunk.tema}
                </h1>

                {/* ── SELECTOR DE MODO (solo cuando hay video) ── */}
                {currentChunk.videos.length > 0 && (
                  <div className="flex gap-2 mb-5 p-1 rounded-2xl bg-black/30 border border-white/10">
                    <button
                      onClick={() => setViewMode('video')}
                      className={`relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all duration-200 ${
                        viewMode === 'video'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Play className={`w-4 h-4 ${viewMode === 'video' ? 'fill-white' : ''}`} />
                      <span>VER VIDEO</span>
                      {currentChunk.videos.length > 1 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${viewMode === 'video' ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-500'}`}>
                          {currentChunk.videos.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setViewMode('read')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all duration-200 ${
                        viewMode === 'read'
                          ? 'bg-slate-600 text-white shadow-lg'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>LEER RESUMEN</span>
                    </button>
                  </div>
                )}

                {/* ── CONTENIDO SEGÚN EL MODO ── */}
                <AnimatePresence mode="wait">
                  {(currentChunk.videos.length === 0 || viewMode === 'video') && (
                    <motion.div
                      key="video-mode"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Video cards */}
                      {currentChunk.videos.length > 0 && (
                        <div className={`grid gap-3 mb-4 ${currentChunk.videos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {currentChunk.videos.map((videoUrl, idx) => {
                            const thumbUrl = getDriveThumbUrl(videoUrl);
                            return (
                              <motion.button
                                key={`vid-${idx}`}
                                onClick={() => onOpenMedia(videoUrl, 'video')}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                className="group relative w-full overflow-hidden rounded-2xl bg-slate-900 border border-white/10 hover:border-blue-500/60 transition-all shadow-lg"
                                style={{ aspectRatio: '16/9' }}
                              >
                                {thumbUrl && (
                                  <img
                                    src={thumbUrl}
                                    alt={`Video ${idx + 1}`}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                {!thumbUrl && <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />}
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/25 transition-all duration-300" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur border-2 border-white/30 flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-400 group-hover:scale-110 transition-all duration-300 shadow-2xl">
                                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                                  </div>
                                </div>
                                <div className="absolute bottom-0 inset-x-0 px-3 py-2.5 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[9px] font-black text-white/90 uppercase tracking-wider">
                                      {currentChunk.videos.length > 1 ? `Video ${idx + 1}` : 'Reproducir'}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-white/40 font-medium">Modo Cine</span>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      )}

                      {/* PDF y Comentario */}
                      {(currentChunk.pdf || currentChunk.comentarioVideo) && (
                        <div className="flex flex-col gap-2 mt-2">
                          {currentChunk.pdf && (
                            <button
                              onClick={() => onOpenMedia(currentChunk.pdf!, 'pdf')}
                              className="group w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-white/10 hover:border-amber-500/50 hover:bg-slate-800 transition-all active:scale-[0.98]"
                            >
                              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex flex-shrink-0 items-center justify-center group-hover:scale-110 transition-transform">
                                <FileText className="w-4 h-4 text-amber-500" />
                              </div>
                              <span className="font-black text-xs text-slate-200">ABRIR PDF TÉCNICO</span>
                            </button>
                          )}
                          {currentChunk.comentarioVideo && (
                            <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5">
                              <p className="text-[11px] text-slate-300 font-medium leading-relaxed italic">{currentChunk.comentarioVideo}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Hint para leer */}
                      {currentChunk.videos.length > 0 && (
                        <button
                          onClick={() => setViewMode('read')}
                          className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all text-[11px] font-semibold"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          Prefiero leer el resumen
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  )}

                  {currentChunk.videos.length > 0 && viewMode === 'read' && (
                    <motion.div
                      key="read-mode"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Hint para volver a video */}
                      <button
                        onClick={() => setViewMode('video')}
                        className="mb-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-blue-500/20 text-blue-400/60 hover:text-blue-400 hover:border-blue-500/40 transition-all text-[11px] font-semibold"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Volver a ver los videos
                      </button>

                      <div className="markdown-content max-w-none">
                        <RichContent content={currentChunk.contenido} onLinkClick={onOpenMedia} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Contenido sin video: siempre visible */}
                {currentChunk.videos.length === 0 && (
                  <div className="markdown-content max-w-none">
                    <RichContent content={currentChunk.contenido} onLinkClick={onOpenMedia} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>


        <footer className="flex-shrink-0 px-6 py-5 glass border-t border-white/5 flex gap-4 z-20">
          <button
            onClick={prevSlide}
            disabled={currentIndex === 0}
            className={`flex-1 lg:flex-none lg:px-8 py-4 rounded-2xl flex items-center justify-center transition-all ${currentIndex === 0 ? 'opacity-10 pointer-events-none' : 'glass hover:bg-white/10'}`}
            title="Anterior"
          >
            <ChevronLeft className="w-6 h-6 text-slate-300" />
            <span className="hidden md:inline ml-2 font-bold uppercase text-xs">Anterior</span>
          </button>

          <button
            onClick={nextSlide}
            className={`flex-[2] lg:flex-1 py-4 rounded-2xl flex items-center justify-center gap-3 font-black transition-all shadow-xl group ${currentIndex === chunks.length - 1 ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'}`}
          >
            {currentIndex === chunks.length - 1 ? (
              <><CheckCircle2 className="w-6 h-6 animate-bounce" /> FINALIZAR MÓDULO</>
            ) : (
              <>SIGUIENTE LECCIÓN <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
