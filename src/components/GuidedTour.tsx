import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2,
  GraduationCap, Timer, X, XCircle,
} from 'lucide-react';

/** Paleta de acento por paso (título, ícono y anillo del resaltado). */
export type TourAccent = 'blue' | 'emerald' | 'amber' | 'violet';

/** Módulo (pantalla) de la app en el que transcurre un paso. */
export type TourStage = 'dashboard' | 'courseDetail' | 'learning' | 'actas';

export interface TourStep {
  /** Identificador estable del paso (se usa como key de React). */
  id: string;
  title: string;
  body?: string;
  /** Viñetas cortas debajo del texto. */
  bullets?: string[];
  /**
   * Módulo en el que debe verse este paso. Al entrar al paso, el recorrido pide
   * a la app que abra ese módulo; el resaltado espera a que aparezca.
   */
  stage: TourStage;
  /**
   * Selector CSS del elemento a resaltar (por convención `[data-tour="..."]`).
   * Sin `target` — o si el elemento no llega a aparecer — la tarjeta se muestra
   * centrada sobre el módulo oscurecido, que sigue siendo la demostración.
   */
  target?: string;
  /** Opacidad del oscurecido en pasos sin resaltado (0–1). Por defecto 0.86. */
  dim?: number;
  /** Mini-demostración interactiva dentro de la tarjeta. */
  demo?: 'flow' | 'quiz' | 'score';
  accent?: TourAccent;
  icon?: ElementType;
}

interface GuidedTourProps {
  steps: TourStep[];
  /** Abre el módulo que pide el paso actual (lo implementa App). */
  onStage: (stage: TourStage) => void;
  /** `completed` = true si llegó al último paso; false si tocó "Omitir". */
  onClose: (completed: boolean) => void;
}

interface Box { top: number; left: number; width: number; height: number }

/** Aire alrededor del elemento resaltado, margen de pantalla y separación tarjeta↔objetivo. */
const PAD = 10;
const MARGIN = 16;
const GAP = 14;
const CARD_MAX_WIDTH = 380;

const ACCENT: Record<TourAccent, { text: string; badge: string; ring: string; dot: string }> = {
  blue:    { text: 'text-blue-400',    badge: 'bg-blue-500/15 border-blue-500/25',       ring: 'rgba(96,165,250,0.95)',  dot: 'bg-blue-400' },
  emerald: { text: 'text-emerald-400', badge: 'bg-emerald-500/15 border-emerald-500/25', ring: 'rgba(52,211,153,0.95)',  dot: 'bg-emerald-400' },
  amber:   { text: 'text-amber-400',   badge: 'bg-amber-500/15 border-amber-500/25',     ring: 'rgba(251,191,36,0.95)',  dot: 'bg-amber-400' },
  violet:  { text: 'text-violet-400',  badge: 'bg-violet-500/15 border-violet-500/25',   ring: 'rgba(167,139,250,0.95)', dot: 'bg-violet-400' },
};

function measure(selector?: string): Box | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/* ============================================================
   Mini-demostraciones dentro de la tarjeta
   ============================================================ */

/** Lección → Evaluación → Certificado */
function FlowDemo() {
  const items = [
    { icon: BookOpen, label: 'Lección', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/25' },
    { icon: Award, label: 'Evaluación', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25' },
    { icon: GraduationCap, label: 'Certificado', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/25' },
  ];
  return (
    <div className="flex items-center justify-between gap-1 mt-3">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="flex items-center gap-1 flex-1">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.12 }}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${it.cls}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{it.label}</span>
            </motion.div>
            {i < items.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0 mb-4" />}
          </div>
        );
      })}
    </div>
  );
}

const DEMO_QUESTION = {
  text: '¿Cuál es la nota mínima para aprobar un curso?',
  options: [
    { letter: 'A', text: '12 / 20' },
    { letter: 'B', text: '16 / 20' },
    { letter: 'C', text: '20 / 20' },
  ],
  correct: 'B',
};

/** Pregunta de práctica: replica el comportamiento real (elegir → feedback inmediato). */
function QuizDemo({ answer, onAnswer }: { answer: string | null; onAnswer: (letter: string) => void }) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[8px] font-black uppercase tracking-wider" style={{ color: '#ffffff' }}>
          Ejemplo
        </span>
        <span className="flex items-center gap-1 text-[9px] font-black text-slate-400">
          <Timer className="w-3 h-3" /> 00:30
        </span>
      </div>

      <p className="text-slate-100 text-[12px] font-bold leading-snug mb-2.5">{DEMO_QUESTION.text}</p>

      <div className="space-y-1.5">
        {DEMO_QUESTION.options.map(opt => {
          const isCorrect = opt.letter === DEMO_QUESTION.correct;
          const isPicked = answer === opt.letter;
          let cls = 'border-white/10 bg-white/5 text-slate-300';
          let icon = null;
          if (answer) {
            if (isCorrect) {
              cls = 'border-emerald-500 bg-emerald-500/20 text-emerald-400';
              icon = <CheckCircle2 className="w-4 h-4" />;
            } else if (isPicked) {
              cls = 'border-rose-500 bg-rose-500/20 text-rose-400';
              icon = <XCircle className="w-4 h-4" />;
            } else {
              cls = 'border-white/5 bg-white/5 text-slate-500 opacity-50';
            }
          }
          return (
            <button
              key={opt.letter}
              type="button"
              disabled={!!answer}
              onClick={() => onAnswer(opt.letter)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${cls} ${
                !answer ? 'hover:bg-white/10 active:scale-[0.98]' : ''
              }`}
            >
              <span className="w-5 h-5 rounded-md bg-black/30 text-[10px] font-black flex items-center justify-center shrink-0">
                {opt.letter}
              </span>
              <span className="flex-1 text-[11px] font-bold">{opt.text}</span>
              {icon}
            </button>
          );
        })}
      </div>

      {answer && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2.5 text-[11px] leading-snug text-slate-300"
        >
          {answer === DEMO_QUESTION.correct ? '¡Correcto! ' : 'La respuesta correcta es 16 / 20. '}
          En la evaluación real verás esta misma explicación después de confirmar cada respuesta.
        </motion.p>
      )}
    </div>
  );
}

/** Escala 0–20 con la marca de la nota aprobatoria. */
function ScoreDemo() {
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full overflow-hidden bg-slate-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 0.6 }}
          className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
        />
      </div>
      <div className="relative h-4">
        <div className="absolute -top-1 w-0.5 h-3 bg-white/80" style={{ left: '80%' }} />
      </div>
      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-500">
        <span>0</span>
        <span className="text-emerald-400">16 = aprobado</span>
        <span>20</span>
      </div>
    </div>
  );
}

/* ============================================================
   Recorrido
   ============================================================ */

export default function GuidedTour({ steps, onStage, onClose }: GuidedTourProps) {
  const activeSteps = steps;
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [demoAnswer, setDemoAnswer] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const total = activeSteps.length;
  const step: TourStep | undefined = activeSteps[idx];
  const isLast = idx === total - 1;
  const accent = ACCENT[step?.accent ?? 'blue'];
  const StepIcon = step?.icon;
  // El paso de práctica exige responder: es la parte interactiva del recorrido.
  const blockedByDemo = step?.demo === 'quiz' && !demoAnswer;

  const goNext = useCallback(() => {
    if (blockedByDemo) return;
    if (isLast) { onClose(true); return; }
    setDemoAnswer(null);
    setIdx(i => i + 1);
  }, [blockedByDemo, isLast, onClose]);

  const goPrev = useCallback(() => {
    if (idx === 0) return;
    setDemoAnswer(null);
    setIdx(i => i - 1);
  }, [idx]);

  // Sin pasos no hay nada que mostrar (se marca como visto igual).
  useEffect(() => {
    if (total === 0) onClose(true);
  }, [total, onClose]);

  // Abre el módulo del paso actual. Se pide una sola vez por módulo, así el
  // recorrido puede tener varios pasos seguidos dentro de la misma pantalla.
  const requestedStageRef = useRef<TourStage | null>(null);
  useLayoutEffect(() => {
    const stage = step?.stage;
    if (!stage || requestedStageRef.current === stage) return;
    requestedStageRef.current = stage;
    onStage(stage);
  }, [step, onStage]);

  // Ubica y sigue al elemento resaltado. Tras un cambio de módulo el elemento
  // tarda en existir (transición + carga diferida de la vista), así que se lo
  // espera hasta 6 s; mientras tanto la tarjeta se muestra centrada.
  useLayoutEffect(() => {
    const target = step?.target;
    if (!target) { setBox(null); return; }

    const sync = () => {
      const next = measure(target);
      setBox(prev => (sameBox(prev, next) ? prev : next));
    };

    const start = performance.now();
    let foundAt = 0;
    let raf = requestAnimationFrame(function follow(now: number) {
      const el = document.querySelector(target);
      if (el) {
        if (!foundAt) {
          foundAt = now;
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        }
        sync();
        // Sigue midiendo mientras dura el scroll suave y la animación de entrada.
        if (now - foundAt < 900) raf = requestAnimationFrame(follow);
        return;
      }
      setBox(prev => (prev === null ? prev : null));
      if (now - start < 6000) raf = requestAnimationFrame(follow);
    });

    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [step]);

  // Coloca la tarjeta: junto al objetivo en pantallas anchas, arriba o abajo en móvil.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !step) return;

    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(CARD_MAX_WIDTH, vw - MARGIN * 2);
      const h = el.offsetHeight;
      let top: number;
      let left: number;

      if (!box) {
        top = Math.max(MARGIN, (vh - h) / 2);
        left = (vw - width) / 2;
      } else if (vw < 640) {
        // Móvil: la tarjeta va al lado opuesto del resaltado para no taparlo.
        const targetIsLow = box.top + box.height / 2 > vh / 2;
        top = targetIsLow ? MARGIN : Math.max(MARGIN, vh - h - MARGIN);
        left = (vw - width) / 2;
      } else {
        const below = box.top + box.height + GAP;
        const above = box.top - GAP - h;
        if (below + h <= vh - MARGIN) top = below;
        else if (above >= MARGIN) top = above;
        else top = Math.max(MARGIN, (vh - h) / 2);
        left = Math.min(Math.max(box.left + box.width / 2 - width / 2, MARGIN), vw - width - MARGIN);
      }

      setCardPos(prev =>
        prev && prev.top === top && prev.left === left && prev.width === width
          ? prev
          : { top, left, width }
      );
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [step, box, demoAnswer]);

  // Teclado: → / Enter avanza, ← retrocede, Esc omite.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  if (!step) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Recorrido guiado de la aplicación">
      {/* Capa que bloquea la app: durante el recorrido solo se avanza con los botones */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9997, touchAction: 'none' }}
        onClick={e => e.stopPropagation()}
      />

      {/* Oscurecido: recorte alrededor del elemento, o pantalla completa en pasos centrados */}
      {box ? (
        <motion.div
          initial={false}
          animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          transition={{ type: 'spring', damping: 30, stiffness: 260 }}
          className="fixed rounded-2xl pointer-events-none"
          style={{
            zIndex: 9998,
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.82)',
            border: `2px solid ${accent.ring}`,
          }}
        >
          <motion.div
            animate={{ opacity: [0.55, 0, 0.55] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -inset-1.5 rounded-2xl"
            style={{ border: `2px solid ${accent.ring}` }}
          />
        </motion.div>
      ) : (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 9998, background: `rgba(2, 6, 23, ${step.dim ?? 0.86})` }}
        />
      )}

      {/* Tarjeta del paso */}
      <motion.div
        ref={cardRef}
        initial={false}
        animate={{ top: cardPos?.top ?? 0, left: cardPos?.left ?? 0, opacity: cardPos ? 1 : 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 260 }}
        className="tour-card fixed rounded-3xl p-5 shadow-2xl"
        style={{ zIndex: 9999, width: cardPos?.width ?? CARD_MAX_WIDTH }}
      >
        {/* Encabezado */}
        <div className="flex items-start gap-3 mb-3">
          {StepIcon && (
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${accent.badge}`}>
              <StepIcon className={`w-4 h-4 ${accent.text}`} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${accent.text}`}>
              Paso {idx + 1} de {total}
            </p>
            <h3 className="text-white font-black text-base leading-tight mt-0.5">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="p-1.5 -m-1 text-slate-500 hover:text-white transition-colors shrink-0"
            aria-label="Omitir recorrido"
            title="Omitir recorrido"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        {step.body && (
          <p className="text-slate-300 text-[13px] leading-relaxed">{step.body}</p>
        )}

        {step.bullets && step.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {step.bullets.map((b, i) => (
              <motion.li
                key={b}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 + i * 0.06 }}
                className="flex items-start gap-2"
              >
                <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${accent.text}`} />
                <span className="text-slate-300 text-[12px] leading-snug">{b}</span>
              </motion.li>
            ))}
          </ul>
        )}

        {step.demo === 'flow' && <FlowDemo />}
        {step.demo === 'quiz' && <QuizDemo answer={demoAnswer} onAnswer={setDemoAnswer} />}
        {step.demo === 'score' && <ScoreDemo />}

        {/* Puntos de avance */}
        <div className="flex items-center justify-center gap-1.5 mt-4 mb-3">
          {activeSteps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? `w-5 ${accent.dot}` : i < idx ? 'w-1.5 bg-slate-500' : 'w-1.5 bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Navegación */}
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="min-h-[44px] px-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={blockedByDemo}
            className={`flex-1 min-h-[44px] px-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all ${
              blockedByDemo
                ? 'bg-slate-700 cursor-not-allowed'
                : isLast
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/25'
            }`}
            style={{ color: blockedByDemo ? 'rgba(255,255,255,0.55)' : '#ffffff' }}
          >
            {blockedByDemo ? 'Elige una respuesta' : isLast ? 'Comenzar' : 'Siguiente'}
            {!blockedByDemo && (isLast ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />)}
          </button>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={() => onClose(false)}
            className="w-full mt-2 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors"
          >
            Omitir recorrido
          </button>
        )}
      </motion.div>
    </div>
  );
}
