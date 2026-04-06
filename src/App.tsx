import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon, Settings, Users, X, AlertCircle, LogOut } from 'lucide-react';
import { 
  fetchLearnTopics, 
  fetchDataChunks, 
  fetchQuizQuestions,
  registerIngreso,
  updateIngresoProgress,
  fetchIngresoByDni,
} from './services/sheetsService';
import { getStorageKey, APP_CONFIG } from './config/app.config';
import type { 
  LearnTopic, 
  DataChunk, 
  QuizQuestion, 
  UserProgress, 
  UserSession,
  AudienceType, 
  AppView 
} from './types';

// Components
import LoginScreen from './components/LoginScreen';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import CourseDetail from './components/CourseDetail';
import LearningMode from './components/LearningMode';
import QuizMode from './components/QuizMode';
import AdminPanel from './components/AdminPanel';

function driveEmbedUrl(url: string, _type: 'video' | 'pdf'): string {
  if (!url) return '';
  const trimmedUrl = url.trim();
  
  // 1. Try to extract ID from standard Drive URL patterns
  let fileId = '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/, 
    /id=([a-zA-Z0-9_-]+)/, 
    /\/d\/([a-zA-Z0-9_-]+)/
  ];
  for (const p of patterns) { 
    const m = trimmedUrl.match(p); 
    if (m) { fileId = m[1]; break; } 
  }
  
  // 2. If no pattern matched, check if it's a bare ID (typically 25+ chars)
  if (!fileId && /^[a-zA-Z0-9_-]{25,}$/.test(trimmedUrl)) {
    fileId = trimmedUrl;
  }
  
  // 3. Construct preview URL if we have an ID
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  
  // 4. Fallback: if it's already an absolute URL, return it; otherwise return empty to avoid relative path bugs
  if (trimmedUrl.startsWith('http')) {
    return trimmedUrl;
  }
  
  return '';
}

export default function App() {
  // --- Global State ---
  const [view, setView] = useState<AppView>('login');
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [audience, setAudience] = useState<AudienceType | null>(null);
  const [topics, setTopics] = useState<LearnTopic[]>([]);
  const [chunks, setChunks] = useState<DataChunk[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<LearnTopic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('learn-theme');
    return saved !== 'light';
  });
  const [mediaOverlay, setMediaOverlay] = useState<{ url: string; type: 'video' | 'pdf' } | null>(null);

  // Apply theme class to html
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', !darkMode);
    localStorage.setItem('learn-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // --- Initialization ---
  useEffect(() => {
    const initApp = async () => {
      try {
        const [loadedTopics, loadedChunks, loadedQuiz] = await Promise.all([
          fetchLearnTopics(),
          fetchDataChunks(),
          fetchQuizQuestions()
        ]);

        setTopics(loadedTopics);
        setChunks(loadedChunks);
        setQuizQuestions(loadedQuiz);

        // Load session from storage
        const storedSession = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.session));
        if (storedSession) {
          const session: UserSession = JSON.parse(storedSession);
          setUserSession(session);
          setAudience(session.audience);
          setView('dashboard');
        }

        // Load progress from storage
        const storedProgress = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.progress));
        if (storedProgress) {
          setProgress(JSON.parse(storedProgress));
        }
      } catch (err) {
        console.error('App initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  // --- Handlers ---
  const handleLogin = async (dni: string, apellidos: string, nombres: string) => {
    setIsRegistering(true);
    try {
      // Check if user already has progress in INGRESOS sheet
      const existingRecord = await fetchIngresoByDni(dni);
      
      if (existingRecord) {
        // Restore session from sheet
        const session: UserSession = {
          dni,
          apellidos: existingRecord.apellidos || apellidos,
          nombres: existingRecord.nombres || nombres,
          audience: (existingRecord.publico || '') as AudienceType,
          inicio: existingRecord.inicio || new Date().toISOString(),
        };
        setUserSession(session);
        localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));

        // Restore progress if exists
        if (existingRecord.progressJson) {
          try {
            const restoredProgress: UserProgress[] = JSON.parse(existingRecord.progressJson);
            setProgress(restoredProgress);
            localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(restoredProgress));
          } catch { /* ignore parse errors */ }
        }

        if (session.audience) {
          setAudience(session.audience);
          setView('dashboard');
        } else {
          setView('onboarding');
        }
      } else {
        // New user — register immediately in Sheets
        const session: UserSession = {
          dni,
          apellidos,
          nombres,
          audience: '' as AudienceType,
          inicio: new Date().toISOString(),
        };
        setUserSession(session);
        localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));
        // Register in INGRESOS right away (publico will be updated after onboarding)
        registerIngreso({
          dni,
          apellidos,
          nombres,
          publico: '',
        }).catch(console.error);
        setView('onboarding');
      }
    } catch (err) {
      console.error('Login error:', err);
      // Fallback: create session locally
      const session: UserSession = {
        dni,
        apellidos,
        nombres,
        audience: '' as AudienceType,
        inicio: new Date().toISOString(),
      };
      setUserSession(session);
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));
      setView('onboarding');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSelectAudience = async (type: AudienceType) => {
    setAudience(type);
    if (userSession) {
      const updatedSession = { ...userSession, audience: type };
      setUserSession(updatedSession);
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(updatedSession));
      // Register in INGRESOS sheet (fire and forget)
      registerIngreso({
        dni: userSession.dni,
        apellidos: userSession.apellidos,
        nombres: userSession.nombres,
        publico: type,
      }).catch(console.error);
    }
    setView('dashboard');
  };


  const handleChangeAudience = () => {
    // Go back to onboarding to pick a different audience, keeping the session
    setAudience(null);
    setView('onboarding');
  };

  const handleLogout = () => {
    if (window.confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      setUserSession(null);
      setAudience(null);
      setProgress([]);
      localStorage.removeItem(getStorageKey(APP_CONFIG.storage.keys.session));
      localStorage.removeItem(getStorageKey(APP_CONFIG.storage.keys.progress));
      setView('login');
    }
  };

  const handleSelectTopic = (topic: LearnTopic) => {
    setSelectedTopic(topic);
    setView('courseDetail');
  };

  const handleSaveProgress = useCallback((topicId: string, chunkIndex: number) => {
    setProgress(prev => {
      const idx = prev.findIndex(p => p.topicId === topicId);
      const newProg = [...prev];
      if (idx >= 0) {
        newProg[idx] = { ...newProg[idx], currentChunk: chunkIndex, lastAccessed: Date.now() };
      } else {
        newProg.push({ topicId, completed: false, currentChunk: chunkIndex, lastAccessed: Date.now() });
      }
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(newProg));

      // Sync progress snapshot to sheet periodically (every 3 chunks)
      if (userSession && chunkIndex % 3 === 0) {
        const completedCount = newProg.filter(p => p.completed).length;
        const totalTopics = topics.filter(t => t.active !== false).length;
        const avancePct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
        updateIngresoProgress({
          dni: userSession.dni,
          avance: `${avancePct}%`,
          nota: '',
          modulosCompletados: completedCount,
          progress: newProg,
        }).catch(console.error);
      }

      return newProg;
    });
  }, [userSession, topics]);

  const handleFinishModule = useCallback((topicId: string) => {
    setProgress(prev => {
      const idx = prev.findIndex(p => p.topicId === topicId);
      const newProg = [...prev];
      if (idx >= 0) {
        newProg[idx] = { ...newProg[idx], completed: true, lastAccessed: Date.now() };
      } else {
        newProg.push({ topicId, completed: true, currentChunk: 0, lastAccessed: Date.now() });
      }
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(newProg));
      return newProg;
    });
    setView('courseDetail');
  }, []);

  const handleQuizComplete = useCallback((topicId: string, score: number) => {
    setProgress(prev => {
      const idx = prev.findIndex(p => p.topicId === topicId);
      const newProg = [...prev];
      if (idx >= 0) {
        newProg[idx] = { ...newProg[idx], quizScore: score, lastAccessed: Date.now() };
      } else {
        newProg.push({ topicId, completed: false, quizScore: score, lastAccessed: Date.now() });
      }
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(newProg));

      // Sync to INGRESOS sheet
      if (userSession) {
        const totalTopics = topics.filter(t => t.active !== false && t.audience.toLowerCase().includes((audience || '').toLowerCase())).length;
        const completedTopics = newProg.filter(p => p.completed).length;
        const avgScore = newProg.filter(p => p.quizScore !== undefined).map(p => p.quizScore!);
        const avgNota = avgScore.length > 0 ? Math.round(avgScore.reduce((a, b) => a + b, 0) / avgScore.length) : 0;
        const avancePct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
        const totalQuizAttempts = newProg.filter(p => p.quizScore !== undefined).length;

        updateIngresoProgress({
          dni: userSession.dni,
          avance: `${avancePct}%`,
          nota: `${avgNota}%`,
          modulosCompletados: completedTopics,
          intentosQuiz: totalQuizAttempts,
          progress: newProg,
        }).catch(console.error);
      }

      return newProg;
    });
  }, [userSession, topics, audience]);

  const handleRefreshData = async () => {
    try {
      const [loadedTopics, loadedChunks, loadedQuiz] = await Promise.all([
        fetchLearnTopics(),
        fetchDataChunks(),
        fetchQuizQuestions()
      ]);
      setTopics(loadedTopics);
      setChunks(loadedChunks);
      setQuizQuestions(loadedQuiz);
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  // --- Rendering ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <motion.div
           animate={{ rotate: 360 }}
           transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
           className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"
        />
        <p className="text-slate-400 font-bold tracking-widest animate-pulse">CARGANDO LEARNDRIVE...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-slate-200 selection:bg-blue-500/30 selection:text-blue-200 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* Top-right floating buttons — hidden in admin view (admin has its own header) */}
      {view !== 'admin' && view !== 'learning' && (
        <div className="fixed top-4 right-4 z-[200] flex items-center gap-2">
          {view === 'dashboard' && (
            <button
              onClick={handleChangeAudience}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                borderColor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
              }}
              aria-label="Cambiar perfil"
              title="Cambiar perfil"
            >
              <Users className="w-4 h-4" style={{ color: darkMode ? '#94a3b8' : '#374151' }} />
            </button>
          )}
          {userSession && (view === 'dashboard' || view === 'courseDetail') && (
            <button
               onClick={handleLogout}
               className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border"
               style={{
                 background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                 borderColor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
               }}
               aria-label="Cerrar sesión"
               title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" style={{ color: darkMode ? '#f87171' : '#dc2626' }} />
            </button>
          )}
          <button
            onClick={() => setView('admin')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              borderColor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
            }}
            aria-label="Admin"
          >
            <Settings className="w-4 h-4" style={{ color: darkMode ? '#94a3b8' : '#374151' }} />
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              borderColor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
            }}
            aria-label="Cambiar tema"
          >
            {darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'login' && (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoginScreen onLogin={handleLogin} isRegistering={isRegistering} />
          </motion.div>
        )}

        {view === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Onboarding onSelectAudience={handleSelectAudience} />
          </motion.div>
        )}

        {view === 'dashboard' && audience && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dashboard 
              audience={audience} 
              topics={topics}
              chunks={chunks}
              quizQuestions={quizQuestions}
              progress={progress}
              onSelectTopic={handleSelectTopic}
              onChangeAudience={handleChangeAudience}
              onOpenAdmin={() => setView('admin')}
            />
          </motion.div>
        )}

        {view === 'courseDetail' && selectedTopic && (
          <motion.div key="detail" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
            <CourseDetail 
              topic={selectedTopic}
              quizQuestions={quizQuestions}
              progress={progress.find(p => p.topicId === selectedTopic.id)}
              onBack={() => setView('dashboard')}
              onStartLearning={() => setView('learning')}
              onStartQuiz={() => setView('quiz')}
            />
          </motion.div>
        )}

        {view === 'learning' && selectedTopic && (
          <motion.div key="learning" className="fixed inset-0 z-50">
            <LearningMode 
              topic={selectedTopic}
              chunks={chunks.filter(c => c.idMain === selectedTopic.id)}
              initialChunkIndex={progress.find(p => p.topicId === selectedTopic.id)?.currentChunk || 0}
              onBack={() => setView('courseDetail')}
              onFinish={() => handleFinishModule(selectedTopic.id)}
              onSaveProgress={(idx) => handleSaveProgress(selectedTopic.id, idx)}
              onOpenMedia={(url, type) => setMediaOverlay({ url, type })}
            />
          </motion.div>
        )}

        {view === 'quiz' && selectedTopic && (
          <motion.div key="quiz" className="fixed inset-0 z-50">
            <QuizMode 
              topic={selectedTopic}
              questions={quizQuestions}
              onBack={() => setView('courseDetail')}
              onComplete={(score) => handleQuizComplete(selectedTopic.id, score)}
            />
          </motion.div>
        )}

        {view === 'admin' && (
          <motion.div key="admin">
            <AdminPanel 
              topics={topics}
              allChunks={chunks}
              allQuizQuestions={quizQuestions}
              onBack={() => audience ? setView('dashboard') : setView('login')}
              onRefreshData={handleRefreshData}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Overlay — Dramatic 'Lights Out' Effect */}
      <AnimatePresence>
        {mediaOverlay && (() => {
          const embedUrl = driveEmbedUrl(mediaOverlay.url, mediaOverlay.type);
          return (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="fixed inset-0 bg-black/98 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-8" 
              style={{ zIndex: 99999 }}
            >
              <div className="w-full max-w-5xl flex flex-col items-center justify-center">
                {/* The Video/PDF Container with subtle halo glow */}
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5, type: 'spring', damping: 25 }}
                  className="relative w-full bg-slate-900 rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(59,130,246,0.15)] border border-white/5 ring-1 ring-white/10" 
                  style={{ aspectRatio: mediaOverlay.type === 'video' ? '16/9' : '3/4' }}
                >
                  {embedUrl ? (
                    <iframe
                      key={embedUrl}
                      src={embedUrl}
                      className="absolute inset-0 w-full h-full border-0"
                      allow="autoplay; encrypted-media; fullscreen"
                      allowFullScreen
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">Enlace no válido</h3>
                      <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
                        El recurso solicitado no se pudo cargar. Puede que el enlace esté roto o el formato sea incompatible.
                      </p>
                      <button 
                        onClick={() => setMediaOverlay(null)}
                        className="mt-8 px-6 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                      >
                        Volver
                      </button>
                    </div>
                  )}
                </motion.div>
                
                {/* Close Button — styled for immersive experience */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  onClick={() => setMediaOverlay(null)}
                  className="mt-10 flex items-center gap-3 px-10 py-4 rounded-full bg-white/5 border border-white/10 text-white/50 text-sm font-bold hover:bg-white hover:text-slate-950 hover:scale-105 active:scale-95 transition-all group"
                >
                  <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                  SALIR DEL CINE
                </motion.button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
