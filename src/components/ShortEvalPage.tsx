import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, ArrowRight, Award, Loader2,
  AlertCircle, ClipboardCheck, User, ChevronRight, Timer,
} from 'lucide-react';
import { shuffleArray } from '../lib/utils';
import {
  fetchShortEvals, fetchShortResultsDni, saveShortEvalResult,
  fetchQuizQuestions, fetchDataChunks,
} from '../services/sheetsService';
import type { ShortEval, QuizQuestion, DataChunk, ShortEvalWrongAnswer } from '../types';

type PageState =
  | 'loading'
  | 'notFound'
  | 'inactive'
  | 'entry'
  | 'checking'
  | 'alreadyTaken'
  | 'quiz'
  | 'saving'
  | 'done'
  | 'error';

// Tiempo límite (segundos) por pregunta. Al agotarse, se avanza automáticamente.
const QUESTION_TIME = 30;

interface ShortEvalPageProps {
  evalId: string;
}

export default function ShortEvalPage({ evalId }: ShortEvalPageProps) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [evalData, setEvalData] = useState<ShortEval | null>(null);
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [allChunks, setAllChunks] = useState<DataChunk[]>([]);

  // Entry form
  const [dni, setDni] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombres, setNombres] = useState('');
  const [guardia, setGuardia] = useState('');
  const [entryError, setEntryError] = useState('');

  // Already taken
  const [prevNota, setPrevNota] = useState<number | null>(null);
  const [prevFecha, setPrevFecha] = useState('');

  // Resultados previos de esta evaluación (para auto-reconocer DNI y bloquear repetición)
  type PrevResult = { dni: string; apellidos: string; nombres: string; nota: number; fechaHora: string };
  const [evalResults, setEvalResults] = useState<PrevResult[]>([]);

  // Quiz
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answeredMap, setAnsweredMap] = useState<Record<number, { selected: string; correct: boolean; question: QuizQuestion }>>({});
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);

  // Results
  const [finalScore, setFinalScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<ShortEvalWrongAnswer[]>([]);

  // Stable shuffled option order per question
  const optionOrders = useMemo(
    () => activeQuestions.map(() => shuffleArray(['A', 'B', 'C', 'D'] as const)),
    [activeQuestions]
  );

  useEffect(() => {
    Promise.all([fetchShortEvals(), fetchQuizQuestions(), fetchDataChunks(), fetchShortResultsDni(evalId)])
      .then(([evals, questions, chunks, prevResults]) => {
        const ev = evals.find(e => e.id === evalId);
        if (!ev) { setPageState('notFound'); return; }
        if (!ev.activo) { setEvalData(ev); setPageState('inactive'); return; }
        setEvalData(ev);
        setAllQuestions(questions);
        setAllChunks(chunks);
        setEvalResults(prevResults);
        setPageState('entry');
      })
      .catch(() => setPageState('error'));
  }, [evalId]);

  // Auto-reconocer apellidos/nombres cuando el DNI coincide con un resultado previo
  useEffect(() => {
    const d = dni.trim();
    if (!d) return;
    const match = evalResults.find(r => r.dni === d);
    if (match) {
      if (match.apellidos) setApellidos(match.apellidos);
      if (match.nombres) setNombres(match.nombres);
    }
  }, [dni, evalResults]);

  const handleEntry = async () => {
    setEntryError('');
    if (!dni.trim() || !apellidos.trim() || !nombres.trim() || !guardia) {
      setEntryError('Por favor completa todos los campos.');
      return;
    }
    if (!/^\d{6,12}$/.test(dni.trim())) {
      setEntryError('DNI inválido (solo dígitos, 6–12 caracteres).');
      return;
    }
    setPageState('checking');
    try {
      // Revisar primero lo registrado localmente (evita el retraso de caché del CSV
      // cuando alguien acaba de rendir y vuelve a ingresar con el mismo DNI), luego el sheet.
      const localTaken = evalResults.find(r => r.dni === dni.trim());
      const results = await fetchShortResultsDni(evalId);
      const remoteTaken = results.find(r => r.dni === dni.trim());
      const taken = localTaken || remoteTaken;
      if (results.length > 0) setEvalResults(results);
      if (taken) {
        setPrevNota(taken.nota);
        setPrevFecha(taken.fechaHora);
        setPageState('alreadyTaken');
        return;
      }
      // Filtrar preguntas del tema. Si hay secciones seleccionadas (chunkIds = cod
      // de secciones), mapear esos cod a su 'tema' y filtrar por categoriaContenido,
      // que es como la app vincula preguntas ↔ secciones (q.categoriaContenido === chunk.tema).
      const topicQuestions = allQuestions.filter(q => q.idMain === evalData!.topicId);
      let pool = topicQuestions;
      if (evalData!.chunkIds.length > 0) {
        const selectedTemas = allChunks
          .filter(c => evalData!.chunkIds.includes(c.cod))
          .map(c => (c.tema || '').trim());
        const filtered = topicQuestions.filter(q => selectedTemas.includes((q.categoriaContenido || '').trim()));
        // Si el match por sección no arroja preguntas, caer a todas las del tema
        pool = filtered.length > 0 ? filtered : topicQuestions;
      }

      if (pool.length === 0) {
        setEntryError('Esta evaluación no tiene preguntas configuradas. Contacta al administrador.');
        setPageState('entry');
        return;
      }
      // Máximo 15 preguntas, elegidas al azar. La nota (0–20) se recalcula sobre
      // la cantidad realmente mostrada (ver handleNext), así que menos de 15 también
      // reparte correctamente el puntaje hasta 20.
      const shuffled = shuffleArray(pool).slice(0, 15);
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

  // Se agotó el tiempo: la pregunta cuenta como no respondida (incorrecta) y avanza.
  const handleTimeout = () => {
    if (showFeedback) return;
    const cur = activeQuestions[currentIdx];
    const newMap = { ...answeredMap, [currentIdx]: { selected: '', correct: false, question: cur } };
    setAnsweredMap(newMap);
    handleNext(newMap);
  };

  const handleNext = async (mapOverride?: typeof answeredMap) => {
    const map = mapOverride ?? answeredMap;
    if (currentIdx < activeQuestions.length - 1) {
      setCurrentIdx(i => i + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      // Finished — compute results
      const total = activeQuestions.length;
      // score ya fue actualizado por handleSelect
      const finalScoreVal = parseFloat(((score / total) * 20).toFixed(1));
      const pct = Math.round((score / total) * 100);

      const wrong: ShortEvalWrongAnswer[] = Object.values(map)
        .filter(a => !a.correct)
        .map(a => ({
          idQuiz: a.question.idQuiz,
          question: a.question.question,
          selected: a.selected,
          correct: a.question.correctAnswer,
          explanation: a.question.explanation,
        }));

      setFinalScore(finalScoreVal);
      setWrongAnswers(wrong);
      setPageState('saving');

      try {
        await saveShortEvalResult({
          evaluacionId: evalId,
          evaluacionNombre: evalData!.nombre,
          tema: evalData!.topicTitle,
          dni: dni.trim(),
          apellidos: apellidos.trim(),
          nombres: nombres.trim(),
          guardia,
          nota: finalScoreVal,
          porcentaje: pct,
          totalPreguntas: total,
          correctas: score,
          preguntasErroneas: wrong,
        });
      } catch { /* result shown even if save fails */ }

      // Registrar localmente para reconocer/bloquear si vuelve a ingresar con el mismo DNI
      setEvalResults(prev => ([
        ...prev,
        { dni: dni.trim(), apellidos: apellidos.trim(), nombres: nombres.trim(), nota: finalScoreVal, fechaHora: '' },
      ]));

      setPageState('done');
    }
  };

  // Volver al inicio del login de la evaluación (limpia el formulario)
  const resetToEntry = () => {
    setDni('');
    setApellidos('');
    setNombres('');
    setGuardia('');
    setActiveQuestions([]);
    setCurrentIdx(0);
    setAnsweredMap({});
    setScore(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setFinalScore(0);
    setWrongAnswers([]);
    setPrevNota(null);
    setPrevFecha('');
    setEntryError('');
    setPageState('entry');
  };

  // Cuenta regresiva por pregunta. Se reinicia al cambiar de pregunta y se detiene al responder.
  useEffect(() => {
    if (pageState !== 'quiz' || showFeedback) return;
    setTimeLeft(QUESTION_TIME);
    const intervalId = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, showFeedback, pageState]);

  // Al llegar a 0 sin respuesta, avanzar automáticamente.
  useEffect(() => {
    if (timeLeft === 0 && pageState === 'quiz' && !showFeedback) {
      handleTimeout();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const q = activeQuestions[currentIdx];
  const optOrder = optionOrders[currentIdx] ?? ['A', 'B', 'C', 'D'];

  const optionLabel: Record<string, string> = {
    A: q?.optionA ?? '',
    B: q?.optionB ?? '',
    C: q?.optionC ?? '',
    D: q?.optionD ?? '',
  };

  // ── LOADING ──
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="w-10 h-10 text-[#1b4d89] animate-spin mb-3" />
        <p className="text-[#737781] text-sm">Cargando evaluación...</p>
      </div>
    );
  }

  // ── NOT FOUND ──
  if (pageState === 'notFound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-[#191c1d] mb-2">Evaluación no encontrada</h2>
        <p className="text-[#737781] text-sm">El enlace puede ser incorrecto o la evaluación fue eliminada.</p>
      </div>
    );
  }

  // ── INACTIVE ──
  if (pageState === 'inactive') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center">
        <AlertCircle className="w-16 h-16 text-amber-400 mb-4" />
        <h2 className="text-xl font-bold text-[#191c1d] mb-2">{evalData?.nombre}</h2>
        <p className="text-[#737781] text-sm">Esta evaluación no está activa en este momento.</p>
      </div>
    );
  }

  // ── ERROR ──
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-[#191c1d] mb-2">Error de conexión</h2>
        <p className="text-[#737781] text-sm mb-4">No se pudo cargar la evaluación.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm">
          Reintentar
        </button>
      </div>
    );
  }

  // ── ALREADY TAKEN ──
  if (pageState === 'alreadyTaken') {
    const pct = Math.round((prevNota! / 20) * 100);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center border border-[#e1e3e4]">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#191c1d] mb-1">{evalData?.nombre}</h2>
          <p className="text-sm text-[#737781] mb-6">Ya completaste esta evaluación</p>
          <div className="bg-[#f8f9fa] rounded-2xl p-6 mb-4">
            <p className="text-4xl font-black text-[#1b4d89]">{prevNota?.toFixed(1)}<span className="text-lg font-bold text-[#737781]">/20</span></p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{pct}%</p>
            <p className="text-xs text-[#737781] mt-2">{prevFecha}</p>
          </div>
          <p className="text-xs text-[#737781] mb-4">Solo se permite un intento por evaluación.</p>
          <button
            onClick={resetToEntry}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#1b4d89] text-white rounded-xl font-bold text-sm"
          >
            <ArrowRight className="w-4 h-4" /> Volver al inicio
          </button>
        </motion.div>
      </div>
    );
  }

  // ── SAVING ──
  if (pageState === 'saving') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="w-10 h-10 text-[#1b4d89] animate-spin mb-3" />
        <p className="text-[#737781] text-sm">Guardando resultado...</p>
      </div>
    );
  }

  // ── DONE ──
  if (pageState === 'done') {
    const passed = finalScore >= 16;
    const pct = Math.round((finalScore / 20) * 100);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-[#e1e3e4]">
          <div className={`h-2 ${passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div className="p-8 text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <Award className={`w-10 h-10 ${passed ? 'text-emerald-600' : 'text-red-500'}`} />
            </div>
            <h2 className="text-xl font-bold text-[#191c1d] mb-1">{passed ? '¡Aprobado!' : 'No aprobado'}</h2>
            <p className="text-sm text-[#737781] mb-4">{evalData?.nombre}</p>
            <div className={`rounded-2xl p-5 mb-4 ${passed ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className={`text-5xl font-black ${passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {finalScore.toFixed(1)}<span className="text-xl font-bold text-[#737781]">/20</span>
              </p>
              <p className={`text-2xl font-bold mt-1 ${passed ? 'text-emerald-500' : 'text-red-400'}`}>{pct}%</p>
            </div>
            <p className="text-sm font-semibold text-[#424750] mb-1">{nombres} {apellidos}</p>
            <p className="text-xs text-[#737781]">DNI: {dni}</p>
          </div>

          {wrongAnswers.length > 0 && (
            <div className="border-t border-[#f3f4f5] px-6">
              <p className="text-[10px] font-bold text-[#737781] uppercase tracking-wider my-3">Respuestas incorrectas</p>
              <div className="space-y-3">
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
            <button
              onClick={resetToEntry}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm"
            >
              <ArrowRight className="w-4 h-4" /> Volver al inicio
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── ENTRY FORM ──
  if (pageState === 'entry' || pageState === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-[#e1e3e4]">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#1b4d89]/10 flex items-center justify-center mx-auto mb-3">
              <ClipboardCheck className="w-7 h-7 text-[#1b4d89]" />
            </div>
            <h1 className="text-lg font-black text-[#00366b] leading-tight">{evalData?.nombre}</h1>
            {evalData?.descripcion && <p className="text-xs text-[#737781] mt-1">{evalData.descripcion}</p>}
            <p className="text-xs text-[#737781] mt-2">Módulo: <span className="font-semibold">{evalData?.topicTitle}</span></p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">DNI</label>
              <input
                type="number"
                value={dni}
                onChange={e => setDni(e.target.value)}
                placeholder="Ingresa tu DNI"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Apellidos</label>
              <input
                type="text"
                value={apellidos}
                onChange={e => setApellidos(e.target.value.toUpperCase())}
                placeholder="APELLIDOS"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Nombres</label>
              <input
                type="text"
                value={nombres}
                onChange={e => setNombres(e.target.value.toUpperCase())}
                placeholder="NOMBRES"
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1">Guardia</label>
              <select
                value={guardia}
                onChange={e => setGuardia(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#e1e3e4] text-sm font-semibold text-[#191c1d] focus:outline-none focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 bg-[#f8f9fa]"
              >
                <option value="">Selecciona tu guardia</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>

            {entryError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">{entryError}</p>
              </div>
            )}

            <button
              onClick={handleEntry}
              disabled={pageState === 'checking'}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm disabled:opacity-60 mt-2"
            >
              {pageState === 'checking' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
              ) : (
                <><User className="w-4 h-4" /> Iniciar evaluación</>
              )}
            </button>
          </div>

          <p className="text-[10px] text-center text-[#737781] mt-4">
            Solo se permite <strong>un intento</strong> por evaluación.
          </p>
        </motion.div>
      </div>
    );
  }

  // ── QUIZ ──
  const total = activeQuestions.length;
  const answered = Object.keys(answeredMap).length;
  const progressPct = Math.round((answered / total) * 100);

  return (
    <div className="h-[100dvh] bg-[#f8f9fa] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#e1e3e4] px-4 py-3 flex items-center justify-between flex-shrink-0 z-10">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-[#737781] uppercase tracking-wider truncate">{evalData?.nombre}</p>
          <p className="text-xs font-semibold text-[#191c1d] truncate">{nombres} {apellidos}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!showFeedback && (
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black tabular-nums border ${
              timeLeft <= 10
                ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                : 'bg-[#1b4d89]/10 text-[#1b4d89] border-[#1b4d89]/20'
            }`}>
              <Timer className="w-3.5 h-3.5" />
              {timeLeft}s
            </span>
          )}
          <div className="text-right">
            <p className="text-xs font-bold text-[#1b4d89]">{currentIdx + 1} / {total}</p>
            <p className="text-[10px] text-[#737781]">preguntas</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#e1e3e4] flex-shrink-0">
        <div className="h-full bg-[#1b4d89] transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Question (área con scroll propio) */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start p-4 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="w-full max-w-lg"
          >
            <div className="bg-white rounded-2xl shadow-sm border border-[#e1e3e4] p-6 mb-4">
              <p className="text-[10px] font-bold text-[#1b4d89] uppercase tracking-wider mb-3">Pregunta {currentIdx + 1}</p>
              <p className="text-sm font-semibold text-[#191c1d] leading-relaxed">{q?.question}</p>
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
                  <button
                    key={opt}
                    onClick={() => handleSelect(opt)}
                    disabled={showFeedback}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${cls}`}
                  >
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

      {/* Footer fijo con el botón — siempre visible tras responder (sin scroll) */}
      {showFeedback && (
        <div className="flex-shrink-0 bg-white/95 backdrop-blur border-t border-[#e1e3e4] p-4">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => handleNext()}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#1b4d89] text-white rounded-xl font-bold text-sm"
            >
              {currentIdx < total - 1 ? (
                <><ArrowRight className="w-4 h-4" /> Siguiente pregunta</>
              ) : (
                <><ChevronRight className="w-4 h-4" /> Finalizar evaluación</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
