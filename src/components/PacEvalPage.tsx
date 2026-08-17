import { useState, useEffect, useMemo, useRef, useLayoutEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import html2pdf from 'html2pdf.js';
import {
  CheckCircle2, XCircle, ArrowRight, Award, Loader2,
  AlertCircle, GraduationCap, User, ChevronRight, Timer,
  PenTool, Camera, RefreshCw, FileSignature, Ban,
} from 'lucide-react';
import { shuffleArray } from '../lib/utils';
import {
  fetchPacProgramas, fetchPacPreguntas, fetchPacResultadosDni, savePacResultado,
  fetchAppDynamicConfig,
} from '../services/sheetsService';
import { EMPRESAS, AREAS, GUARDIAS } from '../lib/constants';
import { useFaceCapture } from '../hooks/useFaceCapture';
import type { PacPrograma, PacPregunta, PacWrongAnswer, PacEncuesta, SatisfaccionRating, AppDynamicConfig } from '../types';
import PacConstanciaTemplate from './PacConstanciaTemplate';

type PageState =
  | 'loading' | 'notFound' | 'inactive' | 'entry' | 'checking'
  | 'passed' | 'noAttemptsLeft' | 'quiz' | 'encuesta' | 'firma' | 'selfie'
  | 'generating' | 'done' | 'error';

const QUESTION_TIME = 30;

const SATISFACCION_PREGUNTAS = [
  '¿Se cumplió el objetivo de la capacitación?',
  '¿Los temas tratados son aplicables a tu puesto de trabajo?',
  '¿La exposición fue clara y organizada?',
  '¿El material utilizado fue de buena calidad?',
  '¿El capacitador demostró conocimiento del tema?',
  '¿Las explicaciones del capacitador fueron claras?',
  '¿Se fomentó el diálogo y la participación?',
];
const SATISFACCION_OPCIONES: SatisfaccionRating[] = ['Excelente', 'Bueno', 'Regular', 'Malo'];

interface PacEvalPageProps {
  evalId: string;
}

export default function PacEvalPage({ evalId }: PacEvalPageProps) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [programa, setPrograma] = useState<PacPrograma | null>(null);
  const [preguntas, setPreguntas] = useState<PacPregunta[]>([]);
  const [appConfig, setAppConfig] = useState<AppDynamicConfig | null>(null);

  // Entry form
  const [dni, setDni] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombres, setNombres] = useState('');
  const [guardia, setGuardia] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [area, setArea] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [entryError, setEntryError] = useState('');

  // Estado previo (para pantallas passed / noAttemptsLeft)
  const [prevNota, setPrevNota] = useState<number | null>(null);
  const [intentosUsados, setIntentosUsados] = useState(0);

  // Quiz
  const [activeQuestions, setActiveQuestions] = useState<PacPregunta[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answeredMap, setAnsweredMap] = useState<Record<number, { selected: string; correct: boolean; question: PacPregunta }>>({});
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);

  // Resultado calculado localmente (nota final se confirma recién al guardar)
  const [finalScore, setFinalScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<PacWrongAnswer[]>([]);

  // Encuesta de satisfacción
  const [encuestaRespuestas, setEncuestaRespuestas] = useState<(SatisfaccionRating | null)[]>(Array(SATISFACCION_PREGUNTAS.length).fill(null));
  const [sugerencia, setSugerencia] = useState('');
  const [encuestaError, setEncuestaError] = useState('');

  // Firma
  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [firmaError, setFirmaError] = useState('');

  // Selfie
  const {
    faceStatus, stabilityProgress, selfieData, setIsCameraReady,
    cameraSessionKey, webcamRef, resetSelfie, restartCamera, onCameraReady,
  } = useFaceCapture(pageState === 'selfie');

  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [savedResult, setSavedResult] = useState<{ intento: number; nota: number; aprobado: boolean } | null>(null);

  const constanciaRef = useRef<HTMLDivElement>(null);
  const dispositivo = typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 120) : '';

  const optionOrders = useMemo(
    () => activeQuestions.map(() => shuffleArray(['A', 'B', 'C', 'D'] as const)),
    [activeQuestions]
  );

  useEffect(() => {
    Promise.all([fetchPacProgramas(), fetchAppDynamicConfig()])
      .then(([programas, cfg]) => {
        setAppConfig(cfg);
        const prog = programas.find(p => p.id === evalId);
        if (!prog) { setPageState('notFound'); return; }
        if (!prog.activo) { setPrograma(prog); setPageState('inactive'); return; }
        setPrograma(prog);
        return fetchPacPreguntas(prog.id).then(qs => {
          setPreguntas(qs);
          setPageState('entry');
        });
      })
      .catch(() => setPageState('error'));
  }, [evalId]);

  const handleEntry = async () => {
    setEntryError('');
    if (!dni.trim() || !apellidos.trim() || !nombres.trim() || !guardia || !empresa || !area) {
      setEntryError('Por favor completa todos los campos.');
      return;
    }
    if (!/^\d{6,12}$/.test(dni.trim())) {
      setEntryError('DNI inválido (solo dígitos, 6–12 caracteres).');
      return;
    }
    if (!consentimiento) {
      setEntryError('Debes aceptar el tratamiento de tus datos para continuar.');
      return;
    }
    if (preguntas.length === 0) {
      setEntryError('Esta capacitación no tiene preguntas configuradas. Contacta al administrador.');
      return;
    }
    setPageState('checking');
    try {
      const previos = await fetchPacResultadosDni(evalId, dni.trim());
      const aprobado = previos.find(r => r.aprobado);
      if (aprobado) {
        setPrevNota(aprobado.nota);
        setPageState('passed');
        return;
      }
      setIntentosUsados(previos.length);
      if (previos.length >= (programa?.maxIntentos ?? 3)) {
        const mejorNota = previos.reduce((max, r) => Math.max(max, r.nota), 0);
        setPrevNota(mejorNota);
        setPageState('noAttemptsLeft');
        return;
      }
      const shuffled = shuffleArray(preguntas);
      setActiveQuestions(shuffled);
      setCurrentIdx(0);
      setAnsweredMap({});
      setScore(0);
      setSelectedOption(null);
      setShowFeedback(false);
      setPageState('quiz');
    } catch {
      setEntryError('Error al verificar. Intenta de nuevo.');
      setPageState('entry');
    }
  };

  const handleSelect = (option: string) => {
    if (showFeedback) return;
    const q = activeQuestions[currentIdx];
    const correct = option === q.correctAnswer;
    if (correct) setScore(s => s + 1);
    setAnsweredMap(prev => ({ ...prev, [currentIdx]: { selected: option, correct, question: q } }));
    setSelectedOption(option);
    setShowFeedback(true);
  };

  const handleTimeout = () => {
    if (showFeedback) return;
    const cur = activeQuestions[currentIdx];
    const newMap = { ...answeredMap, [currentIdx]: { selected: '', correct: false, question: cur } };
    setAnsweredMap(newMap);
    handleNext(newMap);
  };

  const handleNext = (mapOverride?: typeof answeredMap) => {
    const map = mapOverride ?? answeredMap;
    if (currentIdx < activeQuestions.length - 1) {
      setCurrentIdx(i => i + 1);
      setSelectedOption(null);
      setShowFeedback(false);
      return;
    }
    const total = activeQuestions.length;
    const finalScoreVal = parseFloat(((score / total) * 20).toFixed(1));
    const wrong: PacWrongAnswer[] = Object.values(map)
      .filter(a => !a.correct)
      .map(a => ({
        idQuiz: a.question.idPregunta,
        question: a.question.pregunta,
        selected: a.selected,
        correct: a.question.correctAnswer,
        explanation: a.question.explanation || '',
      }));
    setFinalScore(finalScoreVal);
    setWrongAnswers(wrong);
    setPageState('encuesta');
  };

  useEffect(() => {
    if (pageState !== 'quiz' || showFeedback) return;
    setTimeLeft(QUESTION_TIME);
    const intervalId = setInterval(() => setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, showFeedback, pageState]);

  useEffect(() => {
    if (timeLeft === 0 && pageState === 'quiz' && !showFeedback) handleTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const handleEncuestaContinue = () => {
    if (encuestaRespuestas.some(r => r === null)) {
      setEncuestaError('Por favor responde todas las preguntas de la encuesta.');
      return;
    }
    if (!sugerencia.trim()) {
      setEncuestaError('Escribe una sugerencia o coloca "Ninguna" si no tienes.');
      return;
    }
    setEncuestaError('');
    setPageState('firma');
  };

  useLayoutEffect(() => {
    if (pageState === 'firma' && sigContainerRef.current && sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      canvas.width = sigContainerRef.current.offsetWidth;
      canvas.height = sigContainerRef.current.offsetHeight;
    }
  }, [pageState]);

  const clearSignature = () => { sigCanvas.current?.clear(); setSignatureData(null); setHasDrawn(false); };
  // getTrimmedCanvas() está roto bajo Vite dev (ver ConsentSigning.tsx) — se usa getCanvas() sin recortar.
  const saveSig = () => {
    const data = sigCanvas.current?.getCanvas().toDataURL('image/png');
    if (data) { setSignatureData(data); setHasDrawn(true); }
  };

  const handleFirmaContinue = () => {
    if (!hasDrawn) { setFirmaError('Por favor, firma antes de continuar.'); return; }
    const finalSig = sigCanvas.current?.getCanvas().toDataURL('image/png') ?? signatureData;
    setSignatureData(finalSig);
    setFirmaError('');
    setPageState('selfie');
  };

  const generateAndUpload = async () => {
    setPageState('generating');
    setSubmitError('');
    try {
      const element = constanciaRef.current;
      if (!element) throw new Error('No se encontró la plantilla de la constancia');
      const opt = {
        margin: 0,
        filename: `PAC_${dni}_${evalId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      // @ts-ignore
      const worker = html2pdf().from(element).set(opt);
      const pdfBase64 = await worker.outputPdf('dataurlstring').then((dataUrl: string) => dataUrl.split(',')[1]);

      setIsUploading(true);
      const encuesta: PacEncuesta = { respuestas: encuestaRespuestas as SatisfaccionRating[], sugerencia: sugerencia.trim() };
      const result = await savePacResultado({
        programaId: evalId,
        programaNombre: programa?.nombre || '',
        tema: programa?.tema || '',
        dni: dni.trim(),
        apellidos: apellidos.trim(),
        nombres: nombres.trim(),
        guardia,
        empresa,
        area,
        nota: finalScore,
        totalPreguntas: activeQuestions.length,
        correctas: score,
        preguntasErroneas: wrongAnswers,
        encuesta,
        consentimiento,
        pdfBase64,
        signatureBase64: signatureData || '',
        selfieBase64: selfieData || '',
        dispositivo,
      });

      if (result.status === 'ok') {
        setSavedResult({ intento: result.intento ?? 1, nota: result.nota ?? finalScore, aprobado: !!result.aprobado });
        setPageState('done');
      } else if (result.code === 'ALREADY_PASSED') {
        setPrevNota(result.nota ?? finalScore);
        setPageState('passed');
      } else if (result.code === 'NO_ATTEMPTS_LEFT') {
        setPrevNota(result.nota ?? finalScore);
        setPageState('noAttemptsLeft');
      } else {
        throw new Error(result.message || 'Error al guardar el resultado');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al enviar la evaluación. Verifica tu conexión e intenta de nuevo.');
      setPageState('selfie');
    } finally {
      setIsUploading(false);
    }
  };

  const resetToEntry = () => {
    setDni(''); setApellidos(''); setNombres(''); setGuardia(''); setEmpresa(''); setArea(''); setConsentimiento(false);
    setActiveQuestions([]); setCurrentIdx(0); setAnsweredMap({}); setScore(0); setSelectedOption(null); setShowFeedback(false);
    setFinalScore(0); setWrongAnswers([]);
    setEncuestaRespuestas(Array(SATISFACCION_PREGUNTAS.length).fill(null)); setSugerencia(''); setEncuestaError('');
    setSignatureData(null); setHasDrawn(false); setFirmaError('');
    setSubmitError(''); setSavedResult(null); setPrevNota(null); setEntryError('');
    setPageState('entry');
  };

  const q = activeQuestions[currentIdx];
  const optOrder = optionOrders[currentIdx] ?? ['A', 'B', 'C', 'D'];
  const optionLabel: Record<string, string> = { A: q?.optionA ?? '', B: q?.optionB ?? '', C: q?.optionC ?? '', D: q?.optionD ?? '' };

  // La pantalla actual se calcula aparte (en vez de con "return" directo) para que la
  // plantilla oculta de generación de PDF pueda montarse siempre junto a ella — si
  // estuviera condicionada a un pageState puntual, constanciaRef.current sería null
  // justo cuando generateAndUpload() la necesita.
  function renderScreen(): ReactNode {
  // ── LOADING ──
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="w-10 h-10 text-[#1b4d89] animate-spin mb-3" />
        <p className="text-[#737781] text-sm">Cargando evaluación...</p>
      </div>
    );
  }

  // ── NOT FOUND / INACTIVE / ERROR ──
  if (pageState === 'notFound' || pageState === 'inactive' || pageState === 'error') {
    const info = pageState === 'notFound'
      ? { title: 'Capacitación no encontrada', text: 'El enlace puede ser incorrecto o la capacitación fue eliminada.', color: 'text-red-400' }
      : pageState === 'inactive'
      ? { title: programa?.nombre || 'Capacitación inactiva', text: 'Esta capacitación no está activa en este momento.', color: 'text-amber-400' }
      : { title: 'Error de conexión', text: 'No se pudo cargar la capacitación.', color: 'text-red-400' };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center">
        <AlertCircle className={`w-16 h-16 ${info.color} mb-4`} />
        <h2 className="text-xl font-bold text-[#191c1d] mb-2">{info.title}</h2>
        <p className="text-[#737781] text-sm mb-4">{info.text}</p>
        {pageState === 'error' && (
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
            Reintentar
          </button>
        )}
      </div>
    );
  }

  // ── PASSED (ya aprobado) ──
  if (pageState === 'passed') {
    const pct = Math.round(((prevNota ?? 0) / 20) * 100);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center border border-[#e1e3e4]">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#191c1d] mb-1">{programa?.nombre}</h2>
          <p className="text-sm text-[#737781] mb-6">Ya aprobaste esta capacitación</p>
          <div className="bg-[#f8f9fa] rounded-2xl p-6 mb-4">
            <p className="text-4xl font-black text-[#1b4d89]">{prevNota?.toFixed(1)}<span className="text-lg font-bold text-[#737781]">/20</span></p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{pct}%</p>
          </div>
          <p className="text-xs text-[#737781] mb-4">No es necesario volver a rendir.</p>
          <button onClick={resetToEntry} className="w-full flex items-center justify-center gap-2 py-3 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
            <ArrowRight className="w-4 h-4" /> Volver al inicio
          </button>
        </motion.div>
      </div>
    );
  }

  // ── NO ATTEMPTS LEFT ──
  if (pageState === 'noAttemptsLeft') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center border border-[#e1e3e4]">
          <Ban className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#191c1d] mb-1">{programa?.nombre}</h2>
          <p className="text-sm text-[#737781] mb-6">Ya usaste tus {programa?.maxIntentos ?? 3} intentos permitidos</p>
          <div className="bg-[#f8f9fa] rounded-2xl p-6 mb-4">
            <p className="text-xs text-[#737781] mb-1">Tu mejor nota</p>
            <p className="text-4xl font-black text-red-500">{prevNota?.toFixed(1)}<span className="text-lg font-bold text-[#737781]">/20</span></p>
          </div>
          <p className="text-xs text-[#737781] mb-4">Contacta al administrador si necesitas un intento adicional.</p>
          <button onClick={resetToEntry} className="w-full flex items-center justify-center gap-2 py-3 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
            <ArrowRight className="w-4 h-4" /> Volver al inicio
          </button>
        </motion.div>
      </div>
    );
  }

  // ── ENTRY / CHECKING ──
  if (pageState === 'entry' || pageState === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-[#e1e3e4]">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#1b4d89]/10 flex items-center justify-center mx-auto mb-3">
              <GraduationCap className="w-7 h-7 text-[#1b4d89]" />
            </div>
            <h1 className="text-lg font-black text-[#00366b] leading-tight">{programa?.nombre}</h1>
            {programa?.descripcion && <p className="text-xs text-[#737781] mt-1">{programa.descripcion}</p>}
            {programa?.tema && <p className="text-xs text-[#737781] mt-2">Tema: <span className="font-semibold">{programa.tema}</span></p>}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">DNI</label>
              <input type="number" value={dni} onChange={e => setDni(e.target.value)} placeholder="Ingresa tu DNI"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Apellidos</label>
              <input type="text" value={apellidos} onChange={e => setApellidos(e.target.value.toUpperCase())} placeholder="APELLIDOS"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Nombres</label>
              <input type="text" value={nombres} onChange={e => setNombres(e.target.value.toUpperCase())} placeholder="NOMBRES"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Guardia</label>
                <select value={guardia} onChange={e => setGuardia(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa]">
                  <option value="">--</option>
                  {GUARDIAS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Empresa</label>
                <select value={empresa} onChange={e => setEmpresa(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa]">
                  <option value="">--</option>
                  {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Área</label>
              <select value={area} onChange={e => setArea(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa]">
                <option value="">Selecciona tu área</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <button type="button" onClick={() => setConsentimiento(c => !c)}
              className={`w-full flex items-start gap-3 border rounded-xl px-3.5 py-3 text-left transition-all ${consentimiento ? 'bg-emerald-50 border-emerald-300' : 'bg-[#f8f9fa] border-[#e1e3e4]'}`}>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 mt-0.5 transition-colors ${consentimiento ? 'bg-emerald-500 border-emerald-500' : 'border-[#c3c6d1]'}`}>
                {consentimiento && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <p className="text-[#424750] text-xs font-medium leading-snug">
                Acepto el tratamiento de mis datos personales y la confidencialidad de esta evaluación.
              </p>
            </button>

            {entryError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">{entryError}</p>
              </div>
            )}

            <button onClick={handleEntry} disabled={pageState === 'checking'}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm disabled:opacity-60 mt-2">
              {pageState === 'checking' ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : <><User className="w-4 h-4" /> Iniciar evaluación</>}
            </button>
          </div>

          <p className="text-[10px] text-center text-[#737781] mt-4">
            Nota aprobatoria: <strong>{programa?.notaAprobatoria ?? 14}/20</strong> · Máximo <strong>{programa?.maxIntentos ?? 3} intentos</strong>
          </p>
        </motion.div>
      </div>
    );
  }

  // ── QUIZ ──
  if (pageState === 'quiz') {
    const total = activeQuestions.length;
    const answered = Object.keys(answeredMap).length;
    const progressPct = Math.round((answered / total) * 100);
    return (
      <div className="h-[100dvh] bg-[#f8f9fa] flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#e1e3e4] px-4 py-3 flex items-center justify-between flex-shrink-0 z-10">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-[#737781] uppercase tracking-wider truncate">{programa?.nombre}</p>
            <p className="text-xs font-semibold text-[#191c1d] truncate">{nombres} {apellidos}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {!showFeedback && (
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black tabular-nums border ${timeLeft <= 10 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-[#1b4d89]/10 text-[#1b4d89] border-[#1b4d89]/20'}`}>
                <Timer className="w-3.5 h-3.5" />{timeLeft}s
              </span>
            )}
            <div className="text-right">
              <p className="text-xs font-bold text-[#1b4d89]">{currentIdx + 1} / {total}</p>
              <p className="text-[10px] text-[#737781]">preguntas</p>
            </div>
          </div>
        </div>
        <div className="h-1.5 bg-[#e1e3e4] flex-shrink-0">
          <div className="h-full bg-[#1b4d89] transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start p-4 pt-6">
          <AnimatePresence mode="wait">
            <motion.div key={currentIdx} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="w-full max-w-lg">
              <div className="bg-white rounded-2xl shadow-sm border border-[#e1e3e4] p-6 mb-4">
                <p className="text-[10px] font-bold text-[#1b4d89] uppercase tracking-wider mb-3">Pregunta {currentIdx + 1}</p>
                <p className="text-sm font-semibold text-[#191c1d] leading-relaxed">{q?.pregunta}</p>
              </div>
              <div className="space-y-2.5">
                {optOrder.map(opt => {
                  const label = optionLabel[opt];
                  const isSelected = selectedOption === opt;
                  const isCorrect = q?.correctAnswer === opt;
                  let cls = 'bg-white border border-[#e1e3e4] text-[#424750] hover:border-[#1b4d89]/40 hover:bg-[#f8f9fa]';
                  if (showFeedback) {
                    if (isCorrect) cls = 'bg-emerald-50 border-emerald-400 text-emerald-800';
                    else if (isSelected && !isCorrect) cls = 'bg-red-50 border-red-400 text-red-800';
                    else cls = 'bg-white border-[#e1e3e4] text-[#c3c6d1]';
                  } else if (isSelected) {
                    cls = 'bg-[#1b4d89]/10 border-[#1b4d89] text-[#1b4d89]';
                  }
                  return (
                    <button key={opt} onClick={() => handleSelect(opt)} disabled={showFeedback}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${cls}`}>
                      <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black border-current">{opt}</span>
                      <span className="text-sm font-medium leading-snug">{label}</span>
                      {showFeedback && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 ml-auto" />}
                      {showFeedback && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              {showFeedback && q?.explanation && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="mt-3 px-4 py-3 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs text-blue-700 leading-relaxed">{q.explanation}</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {showFeedback && (
          <div className="flex-shrink-0 bg-white/95 backdrop-blur border-t border-[#e1e3e4] p-4">
            <div className="max-w-lg mx-auto">
              <button onClick={() => handleNext()} className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
                {currentIdx < total - 1 ? <><ArrowRight className="w-4 h-4" /> Siguiente pregunta</> : <><ChevronRight className="w-4 h-4" /> Continuar a la encuesta</>}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── ENCUESTA DE SATISFACCIÓN ──
  if (pageState === 'encuesta') {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg mx-auto bg-white rounded-3xl shadow-xl p-6 sm:p-8 border border-[#e1e3e4]">
          <h2 className="text-lg font-black text-[#00366b] mb-1">Encuesta de satisfacción</h2>
          <p className="text-xs text-[#737781] mb-6">Tu opinión nos ayuda a mejorar las próximas capacitaciones.</p>
          <div className="space-y-5">
            {SATISFACCION_PREGUNTAS.map((pregunta, i) => (
              <div key={i}>
                <p className="text-sm font-semibold text-[#191c1d] mb-2">{i + 1}. {pregunta}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {SATISFACCION_OPCIONES.map(op => (
                    <button key={op} onClick={() => setEncuestaRespuestas(prev => prev.map((r, idx) => idx === i ? op : r))}
                      className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${encuestaRespuestas[i] === op ? 'bg-[#1b4d89] text-white border-[#1b4d89]' : 'bg-[#f8f9fa] text-[#424750] border-[#e1e3e4] hover:border-[#1b4d89]/40'}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <label className="block text-sm font-semibold text-[#191c1d] mb-2">Sugerencias o comentarios</label>
              <textarea value={sugerencia} onChange={e => setSugerencia(e.target.value)} rows={3} placeholder="Escribe tu sugerencia (o 'Ninguna')"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm text-[#191c1d] focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa] resize-none" />
            </div>
            {encuestaError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">{encuestaError}</p>
              </div>
            )}
            <button onClick={handleEncuestaContinue} className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
              <ArrowRight className="w-4 h-4" /> Continuar a la firma
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── FIRMA ──
  if (pageState === 'firma') {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl p-6 sm:p-8 border border-[#e1e3e4]">
          <div className="flex items-center gap-3 mb-4">
            <PenTool className="w-5 h-5 text-[#1b4d89]" />
            <h2 className="text-lg font-black text-[#00366b]">Tu firma</h2>
          </div>
          <p className="text-xs text-[#737781] mb-4">Firma dentro del recuadro para confirmar tu evaluación.</p>
          <div ref={sigContainerRef} className="bg-[#f8f9fa] rounded-2xl overflow-hidden mb-4 border-2 border-[#e1e3e4]" style={{ height: '200px' }}>
            <SignatureCanvas ref={sigCanvas} penColor="#111827"
              canvasProps={{ style: { width: '100%', height: '100%', cursor: 'crosshair', display: 'block' } }}
              onBegin={() => { setHasDrawn(true); setFirmaError(''); }} onEnd={saveSig} />
          </div>
          {firmaError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600 font-medium">{firmaError}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={clearSignature} className="flex-1 py-3.5 bg-[#f8f9fa] text-[#737781] rounded-xl font-bold text-sm border border-[#e1e3e4]">
              Limpiar
            </button>
            <button onClick={handleFirmaContinue} className="flex-[2] py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
              <ArrowRight className="w-4 h-4" /> Continuar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── SELFIE ──
  if (pageState === 'selfie') {
    const cfg: Record<string, { color: string; bg: string; text: string }> = {
      loading: { color: 'text-[#737781]', bg: 'bg-[#f3f4f5]', text: 'Iniciando cámara...' },
      no_face: { color: 'text-[#424750]', bg: 'bg-[#f3f4f5]', text: 'Coloca tu rostro en el óvalo' },
      too_far: { color: 'text-amber-600', bg: 'bg-amber-50', text: 'Acércate más a la cámara' },
      too_close: { color: 'text-orange-600', bg: 'bg-orange-50', text: 'Aléjate un poco de la cámara' },
      off_center: { color: 'text-yellow-600', bg: 'bg-yellow-50', text: 'Centra tu rostro en el óvalo' },
      good: { color: 'text-emerald-600', bg: 'bg-emerald-50', text: '¡Perfecto! Mantente quieto...' },
    };
    const c = cfg[faceStatus] ?? cfg.no_face;
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl p-6 sm:p-8 border border-[#e1e3e4]">
          <div className="flex items-center gap-3 mb-4">
            <Camera className="w-5 h-5 text-[#1b4d89]" />
            <h2 className="text-lg font-black text-[#00366b]">Verificación fotográfica</h2>
          </div>

          {!selfieData ? (
            <>
              <p className={`text-center text-xs font-bold mb-3 px-3 py-2 rounded-lg ${c.color} ${c.bg}`}>{c.text}</p>
              <div className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-[#191c1d] mb-4"
                style={{ border: `2px solid ${faceStatus === 'good' ? '#10b981' : '#e1e3e4'}`, transition: 'border-color 0.3s' }}>
                <Webcam key={cameraSessionKey} audio={false} ref={webcamRef} screenshotFormat="image/jpeg"
                  onUserMedia={() => { onCameraReady(); setSubmitError(''); }}
                  onUserMediaError={() => { setIsCameraReady(false); setSubmitError('No se pudo acceder a la cámara'); }}
                  className="w-full h-full object-cover" videoConstraints={{ facingMode: 'user', width: 640, height: 480 }} />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div style={{ width: '62%', height: '72%', borderRadius: '50%', border: `2.5px ${faceStatus === 'good' ? 'solid' : 'dashed'} ${faceStatus === 'good' ? '#10b981' : 'rgba(255,255,255,0.5)'}`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
                </div>
                {faceStatus === 'good' && stabilityProgress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
                    <motion.div className="h-full bg-emerald-500" animate={{ width: `${stabilityProgress}%` }} transition={{ duration: 0.1 }} />
                  </div>
                )}
              </div>
              <button onClick={restartCamera} className="w-full py-3 bg-[#f8f9fa] text-[#737781] rounded-xl font-bold text-xs border border-[#e1e3e4] flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Reiniciar cámara
              </button>
            </>
          ) : (
            <>
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 bg-[#191c1d] mb-4">
                <img src={selfieData} alt="Selfie" className="w-full object-cover" style={{ maxHeight: '50vh' }} />
              </div>
              <div className="flex gap-3">
                <button onClick={resetSelfie} className="flex-1 py-3.5 bg-[#f8f9fa] text-[#737781] rounded-xl font-bold text-sm border border-[#e1e3e4] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Repetir
                </button>
                <button onClick={generateAndUpload} disabled={isUploading}
                  className="flex-[2] py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                  Finalizar evaluación
                </button>
              </div>
            </>
          )}

          {submitError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200 mt-4">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600 font-medium">{submitError}</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ── GENERATING ──
  if (pageState === 'generating') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="w-10 h-10 text-[#1b4d89] animate-spin mb-3" />
        <p className="text-[#737781] text-sm">Generando constancia y guardando tu evaluación...</p>
      </div>
    );
  }

  // ── DONE ──
  if (pageState === 'done' && savedResult) {
    const { nota, aprobado, intento } = savedResult;
    const pct = Math.round((nota / 20) * 100);
    const maxIntentos = programa?.maxIntentos ?? 3;
    const intentosRestantes = Math.max(0, maxIntentos - intento);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-[#e1e3e4]">
          <div className={`h-2 ${aprobado ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div className="p-8 text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${aprobado ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <Award className={`w-10 h-10 ${aprobado ? 'text-emerald-600' : 'text-red-500'}`} />
            </div>
            <h2 className="text-xl font-bold text-[#191c1d] mb-1">{aprobado ? '¡Aprobado!' : 'No aprobado'}</h2>
            <p className="text-sm text-[#737781] mb-4">{programa?.nombre}</p>
            <div className={`rounded-2xl p-5 mb-4 ${aprobado ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className={`text-5xl font-black ${aprobado ? 'text-emerald-600' : 'text-red-600'}`}>{nota.toFixed(1)}<span className="text-xl font-bold text-[#737781]">/20</span></p>
              <p className={`text-2xl font-bold mt-1 ${aprobado ? 'text-emerald-500' : 'text-red-400'}`}>{pct}%</p>
            </div>
            <p className="text-sm font-semibold text-[#424750] mb-1">{nombres} {apellidos}</p>
            <p className="text-xs text-[#737781] mb-3">DNI: {dni} · Intento {intento}/{maxIntentos}</p>
            {!aprobado && (
              <p className="text-xs font-semibold text-[#737781]">
                {intentosRestantes > 0 ? `Te quedan ${intentosRestantes} intento(s).` : 'No te quedan más intentos disponibles.'}
              </p>
            )}
          </div>
          {wrongAnswers.length > 0 && (
            <div className="border-t border-[#f3f4f5] px-6">
              <p className="text-[10px] font-bold text-[#737781] uppercase tracking-wider my-3">Respuestas incorrectas</p>
              <div className="space-y-3 pb-3">
                {wrongAnswers.map((w, i) => (
                  <div key={i} className="bg-red-50 rounded-xl p-3 text-left">
                    <p className="text-xs font-semibold text-[#191c1d] mb-1">{w.question}</p>
                    <p className="text-[10px] text-red-600">Tu respuesta: <strong>{w.selected}</strong></p>
                    <p className="text-[10px] text-emerald-600">Correcta: <strong>{w.correct}</strong></p>
                    {w.explanation && <p className="text-[10px] text-[#737781] mt-1 italic">{w.explanation}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="px-6 pb-6 pt-4">
            <button onClick={resetToEntry} className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
              <ArrowRight className="w-4 h-4" /> Volver al inicio
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return null;
  } // fin de renderScreen()

  return (
    <>
      {renderScreen()}
      {/* HIDDEN TEMPLATE FOR PDF GENERATION — siempre montada, no depende del pageState actual */}
      <div className="fixed left-[-9999px] top-0 overflow-hidden" aria-hidden="true">
        <PacConstanciaTemplate
          ref={constanciaRef}
          appConfig={appConfig}
          data={{
            programaNombre: programa?.nombre || '',
            tema: programa?.tema || '',
            capacitador: programa?.capacitador || '',
            fechaProgramada: programa?.fechaProgramada || '',
            intento: intentosUsados + 1,
            dni, apellidos, nombres, guardia, empresa, area,
            nota: finalScore,
            aprobado: finalScore >= (programa?.notaAprobatoria ?? 14),
            firmaData: signatureData,
            selfieData,
          }}
        />
      </div>
    </>
  );
}
