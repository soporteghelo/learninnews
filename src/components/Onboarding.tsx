import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardHat, Briefcase, Zap, Truck, Sparkles, CheckCircle2, Pickaxe, ArrowRight, AlertCircle, X, Ban } from 'lucide-react';
import { AUDIENCE_CONFIG, APP_CONFIG } from '../config/app.config';
import type { AudienceType } from '../types';

const iconMap: Record<string, React.ElementType> = {
  HardHat,
  Briefcase,
  Zap,
  Truck,
  Pickaxe,
};

const colorMap: Record<string, string> = {
  orange: 'from-orange-500 to-amber-500',
  blue: 'from-blue-500 to-indigo-500',
  purple: 'from-purple-500 to-violet-600',
  yellow: 'from-yellow-500 to-amber-400',
  green: 'from-emerald-500 to-teal-500',
};

const glowMap: Record<string, string> = {
  orange: 'shadow-orange-500/25',
  blue: 'shadow-blue-500/25',
  purple: 'shadow-purple-500/25',
  yellow: 'shadow-yellow-500/25',
  green: 'shadow-emerald-500/25',
};

const ringMap: Record<string, string> = {
  orange: 'ring-orange-400/60',
  blue: 'ring-blue-400/60',
  purple: 'ring-purple-400/60',
  yellow: 'ring-yellow-400/60',
  green: 'ring-emerald-400/60',
};

interface OnboardingProps {
  onSelectAudience: (audiences: AudienceType[]) => void;
}

// Perfiles incompatibles entre sí (bidireccional)
const EXCLUSIONS: Record<string, string[]> = {
  'Obrero':             ['Empleado Superficie', 'Empleado Mina'],
  'Empleado Superficie': ['Obrero', 'Empleado Mina'],
  'Empleado Mina':      ['Obrero', 'Empleado Superficie'],
};

export default function Onboarding({ onSelectAudience }: OnboardingProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const isDark = localStorage.getItem('learn-theme') !== 'light';

  const isDisabled = (id: string) =>
    [...selected].some(sel => (EXCLUSIONS[sel] ?? []).includes(id));

  const toggle = (id: string) => {
    if (isDisabled(id)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Eliminar incompatibles automáticamente
        for (const exc of EXCLUSIONS[id] ?? []) next.delete(exc);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onSelectAudience([...selected] as AudienceType[]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 safe-area-top safe-area-bottom">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-lg lg:max-w-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4"
          >
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-blue-300 font-medium">v{APP_CONFIG.version}</span>
          </motion.div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 tracking-tight">
            {APP_CONFIG.name}
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            {APP_CONFIG.tagline}
          </p>
        </div>

        {/* Profile label + subtitle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-5"
        >
          <p className="text-slate-300 text-sm font-bold uppercase tracking-wider mb-1">
            Selecciona tu perfil
          </p>
          <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
            Puede seleccionar <span className="text-blue-400 font-semibold">uno o más perfiles</span> según su área de trabajo.
            <br />
            <span className={`font-medium ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>Este paso no podrá ser modificado nuevamente.</span>
          </p>
          {selected.size > 1 && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-blue-400 text-xs font-semibold mt-2"
            >
              {selected.size} perfiles seleccionados
            </motion.p>
          )}
        </motion.div>

        {/* Profile cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {AUDIENCE_CONFIG.profiles.map((profile, index) => {
            const Icon = iconMap[profile.icon] || Briefcase;
            const gradient = colorMap[profile.color] || colorMap.blue;
            const glow = glowMap[profile.color] || glowMap.blue;
            const ring = ringMap[profile.color] || ringMap.blue;
            const isSelected = selected.has(profile.id);
            const disabled = isDisabled(profile.id);

            return (
              <motion.button
                key={profile.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: disabled ? 0.35 : 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.08 }}
                whileHover={disabled ? {} : { scale: 1.03 }}
                whileTap={disabled ? {} : { scale: 0.97 }}
                onClick={() => toggle(profile.id)}
                disabled={disabled}
                className={`
                  relative flex flex-col items-center gap-3 p-5 sm:p-6
                  rounded-2xl glass-card transition-all duration-300
                  ${disabled ? 'cursor-not-allowed grayscale' : 'cursor-pointer'}
                  ${isSelected ? `ring-2 ${ring} shadow-lg ${glow}` : (!disabled ? 'hover:border-white/20' : '')}
                `}
              >
                {/* Icon */}
                <div className={`
                  w-14 h-14 sm:w-16 sm:h-16 rounded-xl
                  bg-gradient-to-br ${gradient}
                  flex items-center justify-center shadow-lg
                  transition-transform duration-300
                  ${isSelected ? 'scale-110' : ''}
                `}>
                  <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>

                {/* Text */}
                <div className="text-center">
                  <p className="font-semibold text-white text-sm sm:text-base">
                    {profile.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-tight">
                    {profile.description}
                  </p>
                </div>

                {/* Badge: check si seleccionado, ban si incompatible */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      className="absolute top-2 right-2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-white drop-shadow" />
                    </motion.div>
                  )}
                  {disabled && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      className="absolute top-2 right-2"
                    >
                      <Ban className="w-5 h-5 text-rose-400 drop-shadow" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Confirm button */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6"
            >
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm tracking-widest uppercase flex items-center justify-center gap-3 shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Confirmar perfil{selected.size > 1 ? 'es' : ''}
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-7 shadow-2xl"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/15 flex items-center justify-center border border-blue-500/20">
                  <AlertCircle className="w-6 h-6 text-blue-400" />
                </div>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="p-1.5 text-slate-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-lg font-black text-white mb-1">¿Confirmar selección?</h3>
              <p className="text-slate-400 text-sm mb-5 leading-relaxed">
                Ingresarás con {selected.size > 1 ? 'los siguientes perfiles' : 'el siguiente perfil'}:
              </p>

              <div className="flex flex-wrap gap-2 mb-7">
                {[...selected].map(id => (
                  <span
                    key={id}
                    className="px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-300 text-xs font-bold"
                  >
                    {id}
                  </span>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-sm font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-[2] py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black tracking-wide transition-all shadow-lg shadow-blue-600/25"
                >
                  Sí, continuar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
