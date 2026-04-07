import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  ChevronLeft, ChevronRight, CheckCircle2,
  Video, FileText, ChevronDown
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
  const currentChunk = chunks[currentIndex];
  const progressPercent = Math.round(((currentIndex + 1) / chunks.length) * 100);
  const contentRef = useRef<HTMLDivElement>(null);

  // On chunk change
  useEffect(() => {
    onSaveProgress(currentIndex);
    // Scroll to top
    contentRef.current?.scrollTo({ top: 0 });
  }, [currentIndex]);

  const nextSlide = () => {
    if (currentIndex < chunks.length - 1) setCurrentIndex(currentIndex + 1);
    else onFinish();
  };

  const prevSlide = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (!currentChunk) return null;

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

                {/* Vídeos Horizontal Row */}
                {currentChunk.videos.length > 0 && (
                  <div className="flex w-full gap-2 mb-6">
                    {currentChunk.videos.map((videoUrl, idx) => (
                      <button
                        key={`vid-${idx}`}
                        onClick={() => onOpenMedia(videoUrl, 'video')}
                        className="group flex-1 min-w-0 flex items-center justify-center gap-2 py-2.5 px-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 transition-all shadow-md active:scale-[0.98]"
                      >
                        <div className="w-7 h-7 rounded-lg bg-white/20 flex flex-shrink-0 items-center justify-center group-hover:scale-110 transition-transform">
                          <Video className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="text-left min-w-0 hidden sm:block">
                          <span className="block font-black text-[10px] text-white leading-none truncate">
                            VIDEO {currentChunk.videos.length > 1 ? idx + 1 : ''}
                          </span>
                        </div>
                        <div className="text-left min-w-0 sm:hidden">
                          <span className="block font-black text-[10px] text-white leading-none truncate">
                            VID {currentChunk.videos.length > 1 ? idx + 1 : ''}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* PDF y Comentarios Apilados Verticalmente */}
                {(currentChunk.pdf || currentChunk.comentarioVideo) && (
                  <div className="flex flex-col gap-3 mb-10">
                    {/* PDF */}
                    {currentChunk.pdf && (
                      <button
                        onClick={() => onOpenMedia(currentChunk.pdf!, 'pdf')}
                        className="group w-full max-w-sm flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-white/10 hover:border-amber-500/50 hover:bg-slate-800 transition-all active:scale-[0.98]"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex flex-shrink-0 items-center justify-center group-hover:scale-110 transition-transform">
                          <FileText className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <span className="block font-black text-xs text-slate-200 leading-none truncate">ABRIR PDF TÉCNICO</span>
                        </div>
                      </button>
                    )}

                    {/* Comentario de video */}
                    {currentChunk.comentarioVideo && (
                      <div className="w-full max-w-sm p-3 rounded-xl bg-slate-200 border border-slate-300 flex items-center">
                        <p className="text-[11px] text-black font-medium leading-relaxed italic">{currentChunk.comentarioVideo}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Text Indicator & Message */}
                {(currentChunk.videos.length > 0 || currentChunk.pdf) && (
                  <div className="flex flex-col items-center mb-8">
                    <div className="flex items-center gap-3 w-full opacity-50 mb-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Lectura Teórica</span>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
                    </div>
                    <p className="text-xs text-slate-400/80 text-center max-w-sm leading-relaxed mb-3">
                      El contenido a continuación es el mismo que se muestra en el video y el PDF. Si desea leer el resumen, puede revisarlo aquí
                    </p>
                    <ChevronDown className="w-5 h-5 text-slate-500/50 animate-bounce" />
                  </div>
                )}

                <div className="markdown-content max-w-none">
                  <ReactMarkdown>{currentChunk.contenido}</ReactMarkdown>
                </div>
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
