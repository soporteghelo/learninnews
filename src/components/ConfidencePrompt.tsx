import { motion } from 'framer-motion';
import type { Confidence } from '../types';

interface ConfidencePromptProps {
  onSelect: (level: Confidence) => void;
}

const LEVELS: { level: Confidence; label: string; cls: string }[] = [
  { level: 'alta', label: 'Seguro', cls: 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15' },
  { level: 'media', label: 'Más o menos', cls: 'border-amber-500/40 text-amber-300 hover:bg-amber-500/15' },
  { level: 'baja', label: 'Adivinando', cls: 'border-rose-500/40 text-rose-300 hover:bg-rose-500/15' },
];

/**
 * Paso rápido de metacognición: antes de revelar si acertó, el usuario declara
 * qué tan seguro está. Distingue "sabía" de "acertó por suerte" y alimenta el
 * repaso espaciado (fase 2).
 */
export default function ConfidencePrompt({ onSelect }: ConfidencePromptProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 p-4 rounded-2xl glass-strong border border-white/10"
    >
      <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest mb-3 text-center">
        ¿Qué tan seguro estás?
      </p>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map(({ level, label, cls }) => (
          <button
            key={level}
            onClick={() => onSelect(level)}
            className={`py-2.5 rounded-xl border font-bold text-xs transition-all active:scale-95 ${cls}`}
          >
            {label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
