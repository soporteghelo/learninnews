import { useState } from 'react';
import { motion } from 'framer-motion';
import { HardHat, Briefcase, Zap, Truck, ChevronRight, Sparkles } from 'lucide-react';
import { AUDIENCE_CONFIG, APP_CONFIG } from '../config/app.config';
import type { AudienceType } from '../types';

const iconMap: Record<string, React.ElementType> = {
  HardHat,
  Briefcase,
  Zap,
  Truck,
};

const colorMap: Record<string, string> = {
  orange: 'from-orange-500 to-amber-500',
  blue: 'from-blue-500 to-indigo-500',
  yellow: 'from-yellow-500 to-amber-400',
  green: 'from-emerald-500 to-teal-500',
};

const glowMap: Record<string, string> = {
  orange: 'shadow-orange-500/25',
  blue: 'shadow-blue-500/25',
  yellow: 'shadow-yellow-500/25',
  green: 'shadow-emerald-500/25',
};

interface OnboardingProps {
  onSelectAudience: (audience: AudienceType) => void;
}

export default function Onboarding({ onSelectAudience }: OnboardingProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelected(id);
    setTimeout(() => {
      onSelectAudience(id as AudienceType);
    }, 400);
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

        {/* Profile label */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-slate-300 text-sm font-medium mb-4 uppercase tracking-wider"
        >
          Selecciona tu perfil
        </motion.p>

        {/* Profile cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {AUDIENCE_CONFIG.profiles.map((profile, index) => {
            const Icon = iconMap[profile.icon] || Briefcase;
            const gradient = colorMap[profile.color] || colorMap.blue;
            const glow = glowMap[profile.color] || glowMap.blue;
            const isSelected = selected === profile.id;

            return (
              <motion.button
                key={profile.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelect(profile.id)}
                className={`
                  relative flex flex-col items-center gap-3 p-5 sm:p-6
                  rounded-2xl glass-card cursor-pointer transition-all duration-300
                  ${isSelected ? `ring-2 ring-white/30 shadow-lg ${glow}` : 'hover:border-white/20'}
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

                {/* Arrow on select */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2"
                  >
                    <ChevronRight className="w-5 h-5 text-white/60" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
