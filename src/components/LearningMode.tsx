import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  ChevronLeft, ChevronRight, Square,
  Settings2, Headphones, CheckCircle2, Pause, Play,
  Video, FileText
} from 'lucide-react';
import { TTS_CONFIG } from '../config/app.config';
import { stripMarkdown } from '../lib/utils';
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentRate, setCurrentRate] = useState<number>(TTS_CONFIG.defaultRate);
  const [autoRead, setAutoRead] = useState<boolean>(TTS_CONFIG.autoReadEnabled);
  const [showSettings, setShowSettings] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const plainTextRef = useRef('');

  const currentChunk = chunks[currentIndex];
  const progressPercent = Math.round(((currentIndex + 1) / chunks.length) * 100);

  const plainText = useMemo(() => {
    if (!currentChunk) return '';
    return stripMarkdown(currentChunk.contenido);
  }, [currentChunk]);

  // Preload voices
  useEffect(() => {
    window.speechSynthesis?.getVoices();
    const h = () => window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', h);
    return () => {
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', h);
    };
  }, []);

  // On chunk change
  useEffect(() => {
    onSaveProgress(currentIndex);
    plainTextRef.current = plainText;
    // Scroll to top
    contentRef.current?.scrollTo({ top: 0 });
    if (autoRead) {
      const t = setTimeout(() => speak(plainText), 500);
      return () => clearTimeout(t);
    } else {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [currentIndex, plainText]);

  const getLatamVoice = (): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const langs = [TTS_CONFIG.lang, ...TTS_CONFIG.fallbackLangs];
    for (const lang of langs) {
      const m = voices.find(v => v.lang === lang || v.lang.replace('_', '-') === lang);
      if (m) return m;
    }
    return voices.find(v => v.lang.startsWith('es') && !v.lang.startsWith('es-ES'))
      || voices.find(v => v.lang.startsWith('es'))
      || null;
  };

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsPaused(false);
    plainTextRef.current = text;

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = currentRate;
    utt.pitch = TTS_CONFIG.defaultPitch;

    const voice = getLatamVoice();
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    else { utt.lang = 'es'; }

    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => { setIsSpeaking(false); setIsPaused(false); };
    utt.onerror = () => { setIsSpeaking(false); setIsPaused(false); };



    window.speechSynthesis.speak(utt);
  }, [currentRate]);

  const togglePause = () => {
    if (isPaused) { window.speechSynthesis.resume(); setIsPaused(false); }
    else { window.speechSynthesis.pause(); setIsPaused(true); }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  };

  const nextSlide = () => {
    stopSpeaking();
    if (currentIndex < chunks.length - 1) setCurrentIndex(currentIndex + 1);
    else onFinish();
  };

  const prevSlide = () => {
    stopSpeaking();
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (!currentChunk) return null;

  return (
    <div className="h-screen bg-slate-950 flex flex-col safe-area-top safe-area-bottom overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 glass flex items-center justify-between z-30">
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
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 -mr-2 ${showSettings ? 'text-blue-400' : 'text-slate-400'}`}
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </header>

      {/* Progress */}
      <div className="flex-shrink-0 h-1 bg-white/5 w-full">
        <motion.div className="h-full bg-blue-500" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} />
      </div>

      {/* Settings */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-4 right-4 z-50 glass-strong p-4 rounded-2xl border border-white/10"
          >
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Ajustes de Voz</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">Velocidad</span>
                <div className="flex bg-slate-800 rounded-lg p-1">
                  {TTS_CONFIG.rates.map(rate => (
                    <button
                      key={rate}
                      onClick={() => setCurrentRate(rate)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${currentRate === rate ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400'}`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">Lectura Automática</span>
                <button
                  onClick={() => setAutoRead(!autoRead)}
                  className={`w-12 h-6 rounded-full relative transition-colors ${autoRead ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  <motion.div className="absolute top-1 left-1 bottom-1 w-4 h-4 rounded-full bg-white" animate={{ x: autoRead ? 24 : 0 }} />
                </button>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full mt-6 py-2 text-xs font-bold text-blue-400 uppercase">
              Cerrar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Content */}
      <main
        ref={contentRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="px-6 py-8 pb-36">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Context Badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20">
                  {currentChunk.contexto || 'Concepto'}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
              </div>

              <h1 className="text-2xl font-extrabold text-white mb-6 leading-tight">
                {currentChunk.tema}
              </h1>

              {/* Media Resources - above content */}
              {(currentChunk.videos.length > 0 || currentChunk.pdf) && (
                <div className="mb-8 space-y-3">
                  {/* Video buttons — simple inline row */}
                  {currentChunk.videos.length > 0 && (
                    <div className="flex gap-3">
                      {currentChunk.videos.map((videoUrl, idx) => (
                        <button
                          key={`vid-${idx}`}
                          onClick={() => onOpenMedia(videoUrl, 'video')}
                          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 active:bg-blue-700 transition-colors"
                        >
                          <Video className="w-5 h-5" style={{ color: 'white' }} />
                          <span className="font-bold text-sm" style={{ color: 'white' }}>
                            Video {currentChunk.videos.length > 1 ? idx + 1 : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Comentario de video */}
                  {currentChunk.comentarioVideo && (
                    <div className="px-4 py-3 rounded-xl bg-slate-800/50 border border-white/5">
                      <p className="text-xs text-white/90 font-medium leading-relaxed video-comment-text">{currentChunk.comentarioVideo}</p>
                    </div>
                  )}

                  {/* PDF - secondary action */}
                  {currentChunk.pdf && (
                    <button
                      onClick={() => onOpenMedia(currentChunk.pdf!, 'pdf')}
                      className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-all"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="block text-amber-200 font-bold text-sm pdf-button-primary-text">Abrir documento completo</span>
                        <span className="block text-amber-100/90 text-xs mt-0.5 font-medium pdf-button-secondary-text">Lectura detallada en PDF</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-400/40" />
                    </button>
                  )}
                </div>
              )}

              {/* Summary label */}
              {(currentChunk.videos.length > 0 || currentChunk.pdf) && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Resumen en texto</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
              )}

              <div className="markdown-content max-w-none">
                <ReactMarkdown>{currentChunk.contenido}</ReactMarkdown>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating TTS Control */}
      <div className="fixed bottom-24 left-0 right-0 z-30 flex justify-center pointer-events-none px-4">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="pointer-events-auto flex items-center gap-2 px-2 py-2 rounded-full bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50"
        >
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => isSpeaking ? stopSpeaking() : speak(plainText)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-bold text-xs uppercase tracking-wider ${isSpeaking ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'}`}
          >
            {isSpeaking ? (
              <><Square className="w-4 h-4 fill-current" /> Detener</>
            ) : (
              <><Headphones className="w-4 h-4" /> Escuchar</>
            )}
          </motion.button>

          {isSpeaking && (
            <motion.button
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              whileTap={{ scale: 0.9 }}
              onClick={togglePause}
              className="p-2.5 rounded-full bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </motion.button>
          )}

          {isSpeaking && !isPaused && (
            <div className="flex gap-0.5 items-end h-4 px-2">
              {[0, 1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  className="w-1 bg-blue-400 rounded-full"
                  animate={{ height: ['3px', '14px', '3px'] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.12 }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Navigation Footer */}
      <footer className="flex-shrink-0 px-6 py-4 glass flex gap-4 z-20">
        <button
          onClick={prevSlide}
          disabled={currentIndex === 0}
          className={`flex-1 p-4 rounded-2xl flex items-center justify-center transition-all ${currentIndex === 0 ? 'opacity-20 pointer-events-none' : 'glass hover:bg-white/10'}`}
        >
          <ChevronLeft className="w-6 h-6 text-slate-300" />
        </button>

        <button
          onClick={nextSlide}
          className={`flex-[2] py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all shadow-xl ${currentIndex === chunks.length - 1 ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20' : 'btn-primary'}`}
        >
          {currentIndex === chunks.length - 1 ? (
            <><CheckCircle2 className="w-6 h-6" /> Finalizar Módulo</>
          ) : (
            <>Siguiente <ChevronRight className="w-6 h-6" /></>
          )}
        </button>
      </footer>
    </div>
  );
}
