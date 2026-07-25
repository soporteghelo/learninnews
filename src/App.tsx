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
  fetchActaDocumentos,
  fetchActaFirmas,
  flushOfflineQueue,
} from './services/sheetsService';
import { getStorageKey, APP_CONFIG } from './config/app.config';
import { getAssignedDocs, getGeneralActaDocuments, isGeneralRowSigned } from './lib/actaAssignment';
import type {
  LearnTopic,
  DataChunk,
  QuizQuestion,
  UserProgress,
  UserSession,
  AudienceType,
  AppView,
  AppDynamicConfig,
  ActaDocumento,
  ActaFirma
} from './types';

// Regular imports for immediate load
import LoginScreen from './components/LoginScreen';
import ProfileForm from './components/ProfileForm';
import type { ProfileFormData } from './components/ProfileForm';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import CourseDetail from './components/CourseDetail';
import DriveVideoPlayer from './components/DriveVideoPlayer';
import InstallAppButton from './components/InstallAppButton';

// Lazy loaded components for code splitting
const LearningMode = lazy(() => import('./components/LearningMode'));
const QuizMode = lazy(() => import('./components/QuizMode'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const CertificateClaim = lazy(() => import('./components/CertificateClaim'));
const ShortEvalPage = lazy(() => import('./components/ShortEvalPage'));
const ActasScreen = lazy(() => import('./components/ActasScreen'));
const ConsentSigning = lazy(() => import('./components/ConsentSigning'));

// Loading Fallback Component
const ViewLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-[#f8f9fa] safe-area-top safe-area-bottom">
    <Loader2 className="w-12 h-12 text-[#1b4d89] animate-spin mb-4" />
    <p className="text-[#424750] text-sm font-semibold tracking-wider uppercase">Cargando módulo...</p>
  </div>
);

function driveEmbedUrl(url: string): string {
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

/** Elimina quizSavedProgress y otros campos pesados antes de guardar en Sheets */
function slimProgress(prog: UserProgress[]): UserProgress[] {
  return prog.map(({ topicId, completed, currentChunk, quizScore, lastAccessed }) => ({
    topicId, completed, currentChunk, quizScore, lastAccessed,
  }));
}

/** Clave localStorage de progreso persistente por DNI (sobrevive logout) */
function dniProgressKey(dni: string): string {
  return `learndrive_progress_dni_${dni}`;
}

/** Merge de dos arrays de progreso: por topicId gana el más reciente (lastAccessed) */
function mergeProgress(a: UserProgress[], b: UserProgress[]): UserProgress[] {
  const map = new Map<string, UserProgress>();
  for (const p of a) map.set(p.topicId, p);
  for (const p of b) {
    const existing = map.get(p.topicId);
    if (!existing || (p.lastAccessed ?? 0) > (existing.lastAccessed ?? 0)) {
      map.set(p.topicId, p);
    }
  }
  return Array.from(map.values());
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
  // --- Detect short eval URL (#/eval/ID) before any other init ---
  const [shortEvalId] = useState<string | null>(() => {
    const m = window.location.hash.match(/^#\/eval\/([^/?&]+)/);
    return m ? m[1] : null;
  });

  // --- Global State ---
  const [view, setView] = useState<AppView>(() => shortEvalId ? 'shortEval' : 'login');
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
    return saved === 'dark';
  });
  const [mediaOverlay, setMediaOverlay] = useState<{ url: string; type: 'video' | 'pdf' } | null>(null);
  const [globalKnownUsers, setGlobalKnownUsers] = useState<Record<string, { apellidos: string, nombres: string }>>({});
  const [actaDocumentos, setActaDocumentos] = useState<ActaDocumento[]>([]);
  const [actaFirmas, setActaFirmas] = useState<ActaFirma[]>([]);

  // Apply theme class to html
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', !darkMode);
    localStorage.setItem('learn-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Load Actas (documentos asignados + firmas) for the active user
  const loadActas = useCallback(async () => {
    const [docs, firmas] = await Promise.all([fetchActaDocumentos(), fetchActaFirmas()]);
    setActaDocumentos(docs);
    setActaFirmas(firmas);
  }, []);

  useEffect(() => {
    if (!userSession?.dni || shortEvalId) return;
    loadActas().catch(console.error);
  }, [userSession?.dni, shortEvalId, loadActas]);

  // Reintenta escrituras encoladas offline (progreso/eval) al arrancar y al recuperar conexión
  useEffect(() => {
    const flush = () => { flushOfflineQueue().catch(() => {}); };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  // --- Initialization ---
  useEffect(() => {
    // Modo evaluación corta: página pública autónoma, no inicializar el app principal
    // (evita que una sesión guardada redirija a dashboard/perfil sobre la vista 'shortEval').
    if (shortEvalId) {
      setIsLoading(false);
      return;
    }

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
          // Restaura la misma vista que corresponde según cuánto avanzó (perfil → autorización
          // de firma → audiencia → dashboard), no siempre 'dashboard' — si no, recargar la
          // página a mitad del onboarding dejaba una pantalla en blanco (audience vacío).
          if (!session.profileComplete) {
            setView('profileForm');
          } else if (!session.consentFirmaUrl || !session.consentSelfieUrl) {
            setView('consent');
          } else if (migratedAudience.length > 0) {
            setAudience(migratedAudience);
            setView('dashboard');
          } else {
            setView('onboarding');
          }
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
          // Backup al caché DNI-específico y refrescar Sheets con slim format
          try {
            const sessionRaw = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.session));
            if (sessionRaw) {
              const { dni } = JSON.parse(sessionRaw);
              if (dni) {
                const slim = slimProgress(migrated);
                localStorage.setItem(dniProgressKey(dni), JSON.stringify(slim));
                // Re-escribir Sheets en background con formato limpio (fix para otros dispositivos)
                if (slim.some(p => p.quizScore !== undefined)) {
                  updateIngresoProgress({
                    dni,
                    avance: '',
                    nota: '',
                    progress: slim,
                  }).catch(console.error);
                }
              }
            }
          } catch { /* ignore */ }
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
          // Restore profile fields if already saved
          empresa: existingRecord.empresa || undefined,
          area: existingRecord.area || undefined,
          cargo: existingRecord.cargo || undefined,
          celular: existingRecord.celular || undefined,
          correo: existingRecord.correo || undefined,
          fechaIngreso: existingRecord.fechaIngreso || undefined,
          fechaNacimiento: existingRecord.fechaNacimiento || undefined,
          contacto1Numero: existingRecord.contacto1Numero || undefined,
          contacto1Parentesco: existingRecord.contacto1Parentesco || undefined,
          contacto2Numero: existingRecord.contacto2Numero || undefined,
          contacto2Parentesco: existingRecord.contacto2Parentesco || undefined,
          profileComplete: !!(existingRecord.area),
          consentFirmaUrl: existingRecord.fotografiaUrl || undefined,
          consentSelfieUrl: existingRecord.selfieUrl || undefined,
        };
        setUserSession(session);
        localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));

        // Restore progress: merge Sheets data with local DNI cache (handles stale CSV)
        try {
          const migrateScores = (arr: UserProgress[]) => arr.map(p => ({
            ...p,
            quizScore: p.quizScore !== undefined && p.quizScore > 20
              ? parseFloat(((p.quizScore / 100) * 20).toFixed(1))
              : p.quizScore,
          }));
          const sheetsProgress: UserProgress[] = existingRecord.progressJson
            ? migrateScores(JSON.parse(existingRecord.progressJson))
            : [];
          const localRaw = localStorage.getItem(dniProgressKey(dni));
          const localProgress: UserProgress[] = localRaw
            ? migrateScores(JSON.parse(localRaw))
            : [];
          const merged = mergeProgress(sheetsProgress, localProgress);
          if (merged.length > 0) {
            const slim = slimProgress(merged);
            setProgress(merged);
            localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.progress), JSON.stringify(merged));
            localStorage.setItem(dniProgressKey(dni), JSON.stringify(slim));
            // Re-escribir Sheets con formato limpio para que otros dispositivos lo lean bien
            if (slim.some(p => p.quizScore !== undefined)) {
              updateIngresoProgress({
                dni,
                avance: '',
                nota: '',
                progress: slim,
              }).catch(console.error);
            }
          }
        } catch { /* ignore parse errors */ }

        // If profile not yet filled, show ProfileForm first.
        // If profile is complete but the digital-signature authorization is still
        // missing (new column, or user dropped off mid-flow), require it before
        // letting them into the rest of the app.
        if (!existingRecord.area) {
          setView('profileForm');
        } else if (!existingRecord.fotografiaUrl || !existingRecord.selfieUrl) {
          setView('consent');
        } else if (restoredAudience.length > 0) {
          setAudience(restoredAudience);
          setView('dashboard');
        } else {
          setView('onboarding');
        }
      } else {
        // New user — create session and show ProfileForm (registration happens after form)
        const session: UserSession = {
          dni,
          apellidos,
          nombres,
          audience: [],
          inicio: new Date().toISOString(),
          profileComplete: false,
        };
        setUserSession(session);
        localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(session));
        setView('profileForm');
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

  const handleProfileComplete = (data: ProfileFormData) => {
    if (!userSession) return;
    const updatedSession: UserSession = {
      ...userSession,
      empresa: data.empresa,
      area: data.area,
      cargo: data.cargo,
      fechaIngreso: data.fechaIngreso,
      fechaNacimiento: data.fechaNacimiento,
      correo: data.correo,
      celular: data.celular,
      contacto1Numero: data.contacto1Numero,
      contacto1Parentesco: data.contacto1Parentesco,
      contacto2Numero: data.contacto2Numero || undefined,
      contacto2Parentesco: data.contacto2Parentesco || undefined,
      profileComplete: true,
    };
    setUserSession(updatedSession);
    localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(updatedSession));
    // No registramos en Sheets todavía — se guarda cuando confirme su perfil de audiencia.
    // Antes de poder usar el resto de la app, debe autorizar el uso de su firma digital.
    setView('consent');
  };

  const handleConsentComplete = (data: { firmaUrl?: string; selfieUrl?: string }) => {
    if (!userSession) return;
    const updatedSession: UserSession = {
      ...userSession,
      consentFirmaUrl: data.firmaUrl || userSession.consentFirmaUrl,
      consentSelfieUrl: data.selfieUrl || userSession.consentSelfieUrl,
    };
    setUserSession(updatedSession);
    localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(updatedSession));
    if (updatedSession.audience.length > 0) {
      setAudience(updatedSession.audience);
      setView('dashboard');
    } else {
      setView('onboarding');
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
        empresa: userSession.empresa,
        area: userSession.area,
        cargo: userSession.cargo,
        fechaIngreso: userSession.fechaIngreso,
        fechaNacimiento: userSession.fechaNacimiento,
        correo: userSession.correo,
        celular: userSession.celular,
        contacto1Numero: userSession.contacto1Numero,
        contacto1Parentesco: userSession.contacto1Parentesco,
        contacto2Numero: userSession.contacto2Numero,
        contacto2Parentesco: userSession.contacto2Parentesco,
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
      // Guardar snapshot del progreso actual antes de borrar, para restaurar al re-login
      if (userSession?.dni && progress.length > 0) {
        localStorage.setItem(dniProgressKey(userSession.dni), JSON.stringify(slimProgress(progress)));
      }
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
      if (userSession?.dni) localStorage.setItem(dniProgressKey(userSession.dni), JSON.stringify(newProg));

      // Sync progress snapshot to sheet periodically (every 3 chunks)
      if (userSession && chunkIndex % 3 === 0) {
        const completedCount = newProg.filter(p => p.completed).length;
        const userAudiences = (audience || []).map(a => a.toLowerCase());
        const totalTopics = topics.filter(t => {
          if (t.active === false) return false;
          const topicAuds = t.audience.split(',').map(a => a.trim().toLowerCase());
          return userAudiences.length === 0 || userAudiences.some(ua => topicAuds.includes(ua));
        }).length;
        const avancePct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
        updateIngresoProgress({
          dni: userSession.dni,
          avance: `${avancePct}%`,
          nota: '',
          modulosCompletados: completedCount,
          progress: slimProgress(newProg),
        }).catch(console.error);
      }

      return newProg;
    });
  }, [userSession, topics, audience]);

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
      if (userSession?.dni) localStorage.setItem(dniProgressKey(userSession.dni), JSON.stringify(newProg));

      // Sync completed status to Sheets so other devices see it
      if (userSession) {
        const completedCount = newProg.filter(p => p.completed).length;
        const userAudiences = (audience || []).map(a => a.toLowerCase());
        const totalTopics = topics.filter(t => {
          if (t.active === false) return false;
          const topicAuds = t.audience.split(',').map(a => a.trim().toLowerCase());
          return userAudiences.length === 0 || userAudiences.some(ua => topicAuds.includes(ua));
        }).length;
        const avancePct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
        const quizScores = newProg.filter(p => p.quizScore !== undefined).map(p => p.quizScore!);
        const avgNotaOutOf20 = quizScores.length > 0 ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : 0;
        const avgNotaPct = Math.round((avgNotaOutOf20 / 20) * 100);
        updateIngresoProgress({
          dni: userSession.dni,
          avance: `${avancePct}%`,
          nota: `${avgNotaPct}%`,
          modulosCompletados: completedCount,
          progress: slimProgress(newProg),
        }).catch(console.error);
      }

      return newProg;
    });
    setView('courseDetail');
  }, [userSession, topics, audience]);

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
      if (userSession?.dni) localStorage.setItem(dniProgressKey(userSession.dni), JSON.stringify(newProg));

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
          progress: slimProgress(newProg),
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
  if (view === 'shortEval' && shortEvalId) {
    return (
      <Suspense fallback={<ViewLoader />}>
        <ShortEvalPage evalId={shortEvalId} />
      </Suspense>
    );
  }

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

  // Documentos de actas asignados al usuario (total y pendientes de firma)
  const assignedActas = userSession ? getAssignedDocs(actaDocumentos, userSession) : [];
  const actasAsignadasTotal = assignedActas.length;
  // Modelo de acta general: cada documento se firma independientemente, así que un
  // documento agregado después de una firma anterior no se cuenta como ya firmado.
  const actasPendientes = (() => {
    if (!userSession) return 0;
    const docs = getGeneralActaDocuments(assignedActas, userSession);
    return docs.filter(d => !isGeneralRowSigned(actaFirmas, userSession.dni, d.id)).length;
  })();

  return (
    <div className={`min-h-screen text-slate-200 selection:bg-blue-500/30 selection:text-blue-200 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* Top-right floating buttons — hidden in views that have their own header */}
      {view !== 'admin' && view !== 'learning' && view !== 'quiz' && view !== 'certificateClaim' && view !== 'actas' && view !== 'consent' && (
        <div className="fixed top-4 right-4 z-[200] flex items-center gap-2">
          <InstallAppButton darkMode={darkMode} />
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

        {view === 'profileForm' && userSession && (
          <motion.div key="profileForm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProfileForm
              userSession={userSession}
              onComplete={handleProfileComplete}
            />
          </motion.div>
        )}

        {view === 'consent' && userSession && (
          <motion.div key="consent" className="fixed inset-0 z-50">
            <Suspense fallback={<ViewLoader />}>
              <ConsentSigning
                userSession={userSession}
                appConfig={appConfig}
                onSuccess={handleConsentComplete}
                onLogout={handleLogout}
              />
            </Suspense>
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
              onOpenActas={() => setView('actas')}
              actasPendientes={actasPendientes}
              actasAsignadas={actasAsignadasTotal}
              actasEnabled={appConfig?.actasHabilitado !== false}
              userSession={userSession}
              darkMode={darkMode}
              tutorialUrl={appConfig?.tutorialUrl}
              onPlayTutorial={() => appConfig?.tutorialUrl && setMediaOverlay({ url: appConfig.tutorialUrl, type: 'video' })}
            />
          </motion.div>
        )}

        {view === 'actas' && userSession && (
          <motion.div key="actas" className="fixed inset-0 z-50">
            <Suspense fallback={<ViewLoader />}>
              <ActasScreen
                userSession={userSession}
                appConfig={appConfig}
                documentos={actaDocumentos}
                firmas={actaFirmas}
                onBack={() => setView('dashboard')}
                onSigned={() => { loadActas().catch(console.error); }}
              />
            </Suspense>
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
                appConfig={appConfig}
                onConfigUpdate={setAppConfig}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Overlay — Dramatic 'Lights Out' Effect */}
      <AnimatePresence>
        {mediaOverlay && (() => {
          const embedUrl = driveEmbedUrl(mediaOverlay.url);
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
              className="fixed inset-0 bg-black"
              style={{ zIndex: 99999 }}
            >
              {/* video: <video> nativo (vía /api/drive-video) en vez del iframe /preview de
                  Drive, que infla sus propios controles en pantallas angostas. pdf: iframe a pantalla completa */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="absolute inset-0"
              >
                {mediaOverlay.type === 'video' ? (
                  embedUrl ? (
                    <DriveVideoPlayer key={mediaOverlay.url} driveUrl={mediaOverlay.url} fallbackEmbedUrl={embedUrl} />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                      <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">Enlace no válido</h3>
                      <p className="text-slate-400 max-w-sm text-sm">El enlace no corresponde a un archivo de Google Drive válido.</p>
                    </div>
                  )
                ) : embedUrl ? (
                  <iframe
                    key={embedUrl}
                    src={embedUrl}
                    className="w-full h-full border-0"
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
              </motion.div>

              {/* Botones flotantes — gradiente superior para visibilidad */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="absolute top-0 left-0 right-0 flex items-center justify-between gap-3 px-4 pt-5 pb-10 bg-gradient-to-b from-black/75 via-black/30 to-transparent pointer-events-none z-10"
              >
                <button
                  onClick={() => setMediaOverlay(null)}
                  className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-white/20 text-white text-xs font-bold backdrop-blur-sm hover:bg-white hover:text-slate-950 hover:scale-105 active:scale-95 transition-all group"
                >
                  <X className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300" />
                  SALIR
                </button>
                {driveViewUrl && (
                  <a
                    href={driveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/30 border border-blue-400/40 text-blue-300 text-xs font-bold backdrop-blur-sm hover:bg-blue-600 hover:text-white hover:scale-105 active:scale-95 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    ABRIR EN GOOGLE DRIVE
                  </a>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
