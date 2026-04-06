import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Hash, Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { APP_CONFIG } from '../config/app.config';

interface LoginScreenProps {
  onLogin: (dni: string, apellidos: string, nombres: string) => void;
  isRegistering?: boolean;
}

export default function LoginScreen({ onLogin, isRegistering }: LoginScreenProps) {
  const [dni, setDni] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombres, setNombres] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimDni = dni.trim();
    const trimApellidos = apellidos.trim();
    const trimNombres = nombres.trim();

    if (!trimDni || trimDni.length < 8) {
      setError('Ingresa un DNI válido (mínimo 8 dígitos)');
      return;
    }
    if (!trimApellidos) {
      setError('Ingresa tus apellidos');
      return;
    }
    if (!trimNombres) {
      setError('Ingresa tus nombres');
      return;
    }

    onLogin(trimDni, trimApellidos.toUpperCase(), trimNombres.toUpperCase());
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 safe-area-top safe-area-bottom">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
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
            Identifícate para comenzar tu capacitación
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* DNI */}
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              <Hash className="w-5 h-5" />
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={12}
              placeholder="DNI / N° Documento"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
              className="w-full pl-12 pr-4 py-4 rounded-2xl glass-card text-white placeholder-slate-500 font-medium text-base outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              autoFocus
            />
          </div>

          {/* Apellidos */}
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              <User className="w-5 h-5" />
            </div>
            <input
              type="text"
              placeholder="Apellidos"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl glass-card text-white placeholder-slate-500 font-medium text-base outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>

          {/* Nombres */}
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              <User className="w-5 h-5" />
            </div>
            <input
              type="text"
              placeholder="Nombres"
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl glass-card text-white placeholder-slate-500 font-medium text-base outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-rose-400 text-sm font-medium text-center"
            >
              {error}
            </motion.p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isRegistering}
            className="w-full py-4 rounded-2xl btn-primary text-lg font-bold flex items-center justify-center gap-3 shadow-2xl disabled:opacity-50"
          >
            {isRegistering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                Ingresar
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
