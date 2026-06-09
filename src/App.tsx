import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon, Settings, X, AlertCircle, LogOut, Loader2, ExternalLink } from 'lucide-react';
import {
  fetchLearnTopics,
  fetchDataChunks,
  fetchQuizQuestions,
  registerIngreso,
  updateIngresoProgress,
  fetchIngresoByDni,
  fetchCertificateLinkByDni,
  fetchAppDynamicConfig,
  fetchGlobalKnownUsers,
  getStaleCachedSheetData,
} from './services/sheetsService';
import { getStorageKey, APP_CONFIG } from './config/app.config';
import type { 
  LearnTopic, 
  DataChunk, 
  QuizQuestion, 
  UserProgress, 
  UserSession,
  AudienceType, 
  AppView,
  AppDynamicConfig 
} from './types';

// Regular imports for immediate load
import LoginScreen from './components/LoginScreen';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import CourseDetail from './components/CourseDetail';

// Lazy loaded components for code splitting
const LearningMode = lazy(() => import('./components/LearningMode'));
const QuizMode = lazy(() => import('./components/QuizMode'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const CertificateClaim = lazy(() => import('./components/CertificateClaim'));

// Loading Fallback Component
const ViewLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-[#f8f9fa] safe-area-top safe-area-bottom">
    <Loader2 className="w-12 h-12 text-[#1b4d89] animate-spin mb-4" />
    <p className="text-[#424750] text-sm font-semibold tracking-wider uppercase">Cargando módulo...</p>
  </div>
);

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

/** Convierte audience de formato legacy (string) o nuevo (array) al array tipado */
function migrateAudience(raw: unknown): AudienceType[] {
  const RENAME: Record<string, AudienceType> = { 'Empleado': 'Empleado Superficie' };
  if (Array.isArray(raw)) {
    return (raw as string[]).map(a => RENAME[a] ?? a as AudienceType).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',')
      .map(s => { const t = s.trim(); return (RENAME[t] ?? t) as AudienceType; })
      .filter(Boolean);
  }
  return [];
}

export default function App() {
  // --- Global State ---
  const [view, setView] = useState<AppView>('login');
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [audience, setAudience] = useState<AudienceType[] | null>(null);
  const [topics, setTopics] = useState<LearnTopic[]>([]);
  const [chunks, setChunks] = useState<DataChunk[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<LearnTopic | null>(null);
  const [appConfig, setAppConfig] = useState<AppDynamicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('learn-theme');
    return saved !== 'light';
  });
  const [mediaOverlay, setMediaOverlay] = useState<{ url: string; type: 'video' | 'pdf' } | null>(null);
  const [globalKnownUsers, setGlobalKnownUsers] = useState<Record<string, { apellidos: string, nombres: string }>>({});

  // Apply theme class to html
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', !darkMode);
    localStorage.setItem('learn-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // --- Initialization ---
  useEffect(() => {
    const restoreLocalData = () => {
      const storedSession = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.session));
      if (storedSession) {
        try {
          const raw = JSON.parse(storedSession);
          const migratedAudience = migrateAudience(raw.audience);
          const session: UserSession = { ...raw, audience: migratedAudience };
          if (migratedAudience.join() !== (raw.audience ?? '').toString()) {
            localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));
          }
          setUserSession(session);
          setAudience(migratedAudience.length > 0 ? migratedAudience : null);
          setView('dashboard');
          fetchCertificateLinkByDni(session.dni).then(liveUrls => {
            if (Object.keys(liveUrls).length > 0) {
              const merged = { ...session.certificadoUrls, ...liveUrls };
              const isSame = JSON.stringify(merged) === JSON.stringify(session.certificadoUrls ?? {});
              if (!isSame) {
                const synced: UserSession = { ...session, certificadoUrls: merged };
                setUserSession(synced);
                localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(synced));
              }
            }
          }).catch(console.error);
        } catch {
          localStorage.removeItem(getStorageKey(APP_CONFIG.storage.keys.session));
        }
      }

      const storedProgress = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.progress));
      if (storedProgress) {
        try {
          const raw: UserProgress[] = JSON.parse(storedProgress);
          const migrated = raw.map(p => ({
            ...p,
            quizScore: p.quizScore !== undefined && p.quizScore > 20
              ? parseFloat(((p.quizScore / 100) * 20).toFixed(1))
              : p.quizScore,
          }));
          if (raw.some(p => p.quizScore !== undefined && p.quizScore > 20)) {
            localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(migrated));
          }
          setProgress(migrated);
        } catch {
          localStorage.removeItem(getStorageKey(APP_CONFIG.storage.keys.progress));
        }
      }
    };

    const initApp = async () => {
      // Phase 1: stale-while-revalidate — show stale cache instantly, don't wait for network
      const staleTopics = getStaleCachedSheetData<LearnTopic[]>('topics');
      const staleChunks = getStaleCachedSheetData<DataChunk[]>('chunks');
      const staleQuiz   = getStaleCachedSheetData<QuizQuestion[]>('quiz');
      const hasStale = !!(staleTopics && staleChunks);
      if (hasStale) {
        if (staleTopics) setTopics(staleTopics);
        if (staleChunks) setChunks(staleChunks);
        if (staleQuiz)   setQuizQuestions(staleQuiz);
        restoreLocalData();
        setIsLoading(false);
      }

      // Phase 2: fetch fresh data (background when stale existed, blocking when cold)
      try {
        const [loadedTopics, loadedChunks, loadedQuiz, loadedConfig, loadedUsers] = await Promise.all([
          fetchLearnTopics(hasStale),   // force=true bypasses cache when we already showed stale
          fetchDataChunks(hasStale),
          fetchQuizQuestions(hasStale),
          fetchAppDynamicConfig(),
          fetchCachedGlobalUsers(),
        ]);
        setTopics(loadedTopics);
        setChunks(loadedChunks);
        setQuizQuestions(loadedQuiz);
        setAppConfig(loadedConfig);
        setGlobalKnownUsers(loadedUsers);
        if (!hasStale) restoreLocalData();
      } catch (err) {
        console.error('App initialization error:', err);
      } finally {
        if (!hasStale) setIsLoading(false);
      }
    };

    async function fetchCachedGlobalUsers() {
      const STORAGE_KEY = 'learndrive_global_users_cache';
      const CACHE_TTL = 2 * 60 * 1000; // 2 minutes (was 30 minutes)

      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            // Background refresh when halfway through TTL (1 min)
            if (Date.now() - timestamp > CACHE_TTL / 2) {
              fetchGlobalKnownUsers().then(fresh => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: fresh, timestamp: Date.now() }));
                setGlobalKnownUsers(fresh);
              }).catch(console.error);
            }
            return data;
          }
        }
      } catch (e) {
        console.warn('Cache error:', e);
      }

      const fresh = await fetchGlobalKnownUsers();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: fresh, timestamp: Date.now() }));
      return fresh;
    }

    initApp();
  }, []);

  // Background polling — refresh content every 30s while app is open
  useEffect(() => {
    const poll = async () => {
      try {
        const [t, c, q] = await Promise.all([
          fetchLearnTopics(true),
          fetchDataChunks(true),
          fetchQuizQuestions(true),
        ]);
        setTopics(t);
        setChunks(c);
        setQuizQuestions(q);
      } catch { /* non-critical */ }
    };
    const id = setInterval(poll, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // --- Handlers ---
  const handleLogin = async (dni: string, apellidos: string, nombres: string) => {
    setIsRegistering(true);
    try {
      // Check if user already has progress in INGRESOS sheet
      const existingRecord = await fetchIngresoByDni(dni);
      
      if (existingRecord) {
        const liveUrls = await fetchCertificateLinkByDni(dni);
        // Restore session from sheet
        const restoredAudience = migrateAudience(existingRecord.publico);
        const session: UserSession = {
          dni,
          apellidos: existingRecord.apellidos || apellidos,
          nombres: existingRecord.nombres || nombres,
          audience: restoredAudience,
          inicio: existingRecord.inicio || new Date().toISOString(),
          certificadoUrls: Object.keys(liveUrls).length > 0 ? liveUrls : undefined,
        };
        setUserSession(session);
        localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));

        // Restore progress if exists — migrate legacy % scores (>20) to /20 scale
        if (existingRecord.progressJson) {
          try {
            const raw: UserProgress[] = JSON.parse(existingRecord.progressJson);
            const restoredProgress = raw.map(p => ({
              ...p,
              quizScore: p.quizScore !== undefined && p.quizScore > 20
                ? parseFloat(((p.quizScore / 100) * 20).toFixed(1))
                : p.quizScore,
            }));
            setProgress(restoredProgress);
            localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(restoredProgress));
          } catch { /* ignore parse errors */ }
        }

        if (restoredAudience.length > 0) {
          setAudience(restoredAudience);
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
          audience: [],
          inicio: new Date().toISOString(),
        };
        setUserSession(session);
        localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));
        registerIngreso({ dni, apellidos, nombres, publico: '' }).catch(console.error);
        setView('onboarding');
      }
    } catch (err) {
      console.error('Login error:', err);
      const session: UserSession = {
        dni,
        apellidos,
        nombres,
        audience: [],
        inicio: new Date().toISOString(),
      };
      setUserSession(session);
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));
      setView('onboarding');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSelectAudience = async (types: AudienceType[]) => {
    setAudience(types);
    if (userSession) {
      const updatedSession = { ...userSession, audience: types };
      setUserSession(updatedSession);
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(updatedSession));
      registerIngreso({
        dni: userSession.dni,
        apellidos: userSession.apellidos,
        nombres: userSession.nombres,
        publico: types.join(', '),
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
        const userAudiences = (audience || []).map(a => a.toLowerCase());
        const totalTopics = topics.filter(t => {
          if (t.active === false) return false;
          const topicAuds = t.audience.split(',').map(a => a.trim().toLowerCase());
          return userAudiences.length === 0 || userAudiences.some(ua => topicAuds.includes(ua));
        }).length;
        const completedTopics = newProg.filter(p => p.completed).length;
        const quizScores = newProg.filter(p => p.quizScore !== undefined).map(p => p.quizScore!);
        // avgNota is stored out of 20; convert to % for sheets readability
        const avgNotaOutOf20 = quizScores.length > 0 ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : 0;
        const avgNotaPct = Math.round((avgNotaOutOf20 / 20) * 100);
        const avancePct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
        const totalQuizAttempts = newProg.filter(p => p.quizScore !== undefined).length;

        updateIngresoProgress({
          dni: userSession.dni,
          avance: `${avancePct}%`,
          nota: `${avgNotaPct}%`,
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
        fetchLearnTopics(true),
        fetchDataChunks(true),
        fetchQuizQuestions(true)
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

  if (appConfig?.status === 'Inactivo') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
           initial={{ scale: 0 }}
           animate={{ scale: 1 }}
           className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 border border-amber-500/20"
        >
          <AlertCircle className="w-10 h-10 text-amber-500" />
        </motion.div>
        <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Acceso Restringido</h1>
        <p className="text-slate-400 max-w-xs leading-relaxed mb-8">
          La plataforma se encuentra fuera de servicio temporalmente. Por Favor, contacta con soporte para más información.
        </p>
        {appConfig.contact && (
          <a 
            href={`https://wa.me/${appConfig.contact.replace(/\+/g, '')}?text=Hola, la app ${appConfig.title} aparece como Inactiva. Necesito información.`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 bg-white text-slate-950 rounded-2xl font-black text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10"
          >
            CONTACTAR SOPORTE
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-slate-200 selection:bg-blue-500/30 selection:text-blue-200 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* Top-right floating buttons — hidden in admin view (admin has its own header) */}
      {view !== 'admin' && view !== 'learning' && (
        <div className="fixed top-4 right-4 z-[200] flex items-center gap-2">
          {userSession && (view === 'dashboard' || view === 'courseDetail') && (
            <button
               onClick={handleLogout}
               className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${darkMode ? 'border-white' : 'border-black'}`}
               style={{
                 background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
               }}
               aria-label="Cerrar sesión"
               title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" style={{ color: darkMode ? '#ffffff' : '#000000' }} />
            </button>
          )}
          <button
            onClick={() => setView('admin')}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${darkMode ? 'border-white' : 'border-black'}`}
            style={{
              background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            }}
            aria-label="Admin"
          >
            <Settings className="w-4 h-4" style={{ color: darkMode ? '#ffffff' : '#000000' }} />
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${darkMode ? 'border-white' : 'border-black'}`}
            style={{
              background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            }}
            aria-label="Cambiar tema"
          >
            {darkMode ? <Sun className="w-4 h-4" style={{ color: '#ffffff' }} /> : <Moon className="w-4 h-4" style={{ color: '#000000' }} />}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'login' && (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoginScreen 
              config={appConfig} 
              onLogin={handleLogin} 
              isRegistering={isRegistering} 
              globalKnownUsers={globalKnownUsers} 
            />
          </motion.div>
        )}

        {view === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Onboarding onSelectAudience={handleSelectAudience} />
          </motion.div>
        )}

        {view === 'dashboard' && audience && audience.length > 0 && (
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
              onClaimCertificate={(topic) => { setSelectedTopic(topic); setView('certificateClaim'); }}
              userSession={userSession}
              darkMode={darkMode}
            />
          </motion.div>
        )}

        {view === 'certificateClaim' && userSession && (
          <motion.div key="certificate" className="fixed inset-0 z-50">
            <Suspense fallback={<ViewLoader />}>
              <CertificateClaim
                userSession={userSession}
                onBack={() => setView('dashboard')}
                appConfig={appConfig}
                progress={progress}
                quizQuestions={quizQuestions}
                topic={selectedTopic ?? undefined}
                onSuccess={(url: string) => {
                  if (!selectedTopic?.id) return;
                  const updatedSession: UserSession = {
                    ...userSession,
                    certificadoUrls: { ...userSession.certificadoUrls, [selectedTopic.id]: url },
                  };
                  setUserSession(updatedSession);
                  localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(updatedSession));
                }}
              />
            </Suspense>
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
            <Suspense fallback={<ViewLoader />}>
              <LearningMode 
                topic={selectedTopic}
                chunks={chunks.filter(c => c.idMain === selectedTopic.id)}
                initialChunkIndex={progress.find(p => p.topicId === selectedTopic.id)?.currentChunk || 0}
                onBack={() => setView('courseDetail')}
                onFinish={() => handleFinishModule(selectedTopic.id)}
                onSaveProgress={(idx) => handleSaveProgress(selectedTopic.id, idx)}
                onOpenMedia={(url, type) => setMediaOverlay({ url, type })}
              />
            </Suspense>
          </motion.div>
        )}

        {view === 'quiz' && selectedTopic && (
          <motion.div key="quiz" className="fixed inset-0 z-50">
            <Suspense fallback={<ViewLoader />}>
              <QuizMode
                topic={selectedTopic}
                questions={quizQuestions}
                onBack={(partialScore) => {
                  if (partialScore !== undefined) {
                    setProgress(prev => {
                      const idx = prev.findIndex(p => p.topicId === selectedTopic.id);
                      const newProg = [...prev];
                      if (idx >= 0) {
                        newProg[idx] = { ...newProg[idx], quizScore: partialScore, lastAccessed: Date.now() };
                      } else {
                        newProg.push({ topicId: selectedTopic.id, completed: false, quizScore: partialScore, lastAccessed: Date.now() });
                      }
                      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(newProg));
                      return newProg;
                    });
                  }
                  setView('courseDetail');
                }}
                onComplete={(score) => handleQuizComplete(selectedTopic.id, score)}
                userDni={userSession?.dni}
              />
            </Suspense>
          </motion.div>
        )}

        {view === 'admin' && (
          <motion.div key="admin">
            <Suspense fallback={<ViewLoader />}>
              <AdminPanel 
                topics={topics}
                allChunks={chunks}
                allQuizQuestions={quizQuestions}
                onBack={() => (audience && audience.length > 0) ? setView('dashboard') : setView('login')}
                onRefreshData={handleRefreshData}
                adminPass={appConfig?.adminPass}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Overlay — Dramatic 'Lights Out' Effect */}
      <AnimatePresence>
        {mediaOverlay && (() => {
          const embedUrl = driveEmbedUrl(mediaOverlay.url, mediaOverlay.type);
          // Build a direct Drive view URL from the original link (always opens correctly)
          const rawUrl = mediaOverlay.url.trim();
          let driveFileId = '';
          for (const p of [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/]) {
            const m = rawUrl.match(p); if (m) { driveFileId = m[1]; break; }
          }
          if (!driveFileId && /^[a-zA-Z0-9_-]{25,}$/.test(rawUrl)) driveFileId = rawUrl;
          const driveViewUrl = driveFileId
            ? `https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`
            : rawUrl;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="fixed inset-0 bg-black flex flex-col sm:items-center sm:justify-center sm:p-8"
              style={{ zIndex: 99999 }}
            >
              {/* Video wrapper */}
              <div className="flex-1 sm:flex-none w-full sm:max-w-5xl">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className={`relative h-full sm:h-auto w-full bg-slate-900 overflow-hidden sm:rounded-2xl sm:shadow-[0_0_80px_rgba(59,130,246,0.15)] sm:border sm:border-white/5 sm:ring-1 sm:ring-white/10 ${
                    mediaOverlay.type === 'video' ? 'sm:aspect-video' : 'sm:aspect-[3/4]'
                  }`}
                >
                  {embedUrl ? (
                    <iframe
                      key={embedUrl}
                      src={embedUrl}
                      className="absolute inset-0 w-full h-full border-0"
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                      <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">Enlace no válido</h3>
                      <p className="text-slate-400 max-w-sm text-sm">El enlace no corresponde a un archivo de Google Drive válido.</p>
                    </div>
                  )}

                  {/* Botón "Abrir en Drive" flotante — siempre visible */}
                  {driveViewUrl && (
                    <a
                      href={driveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/20 text-white text-[11px] font-bold hover:bg-blue-600 hover:border-blue-500 transition-all z-10"
                      title="Abrir en Google Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir en Drive
                    </a>
                  )}
                </motion.div>
              </div>

              {/* Footer buttons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="shrink-0 mt-4 sm:mt-8 flex items-center gap-3"
              >
                {driveViewUrl && (
                  <a
                    href={driveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-bold hover:bg-blue-600 hover:text-white hover:scale-105 active:scale-95 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    ABRIR EN GOOGLE DRIVE
                  </a>
                )}
                <button
                  onClick={() => setMediaOverlay(null)}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/5 border border-white/10 text-white/50 text-xs font-bold hover:bg-white hover:text-slate-950 hover:scale-105 active:scale-95 transition-all group"
                >
                  <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                  SALIR
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
