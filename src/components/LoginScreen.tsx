import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Hash, Loader2, Sparkles, ChevronRight, MessageCircle } from 'lucide-react';
import { APP_CONFIG } from '../config/app.config';
import type { AppDynamicConfig } from '../types';

interface LoginScreenProps {
  onLogin: (dni: string, apellidos: string, nombres: string) => void;
  isRegistering?: boolean;
  config?: AppDynamicConfig | null;
  globalKnownUsers?: Record<string, { apellidos: string, nombres: string }>;
}

export default function LoginScreen({ onLogin, isRegistering, config, globalKnownUsers = {} }: LoginScreenProps) {
  const [dni, setDni] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombres, setNombres] = useState('');
  const [error, setError] = useState('');
  const [sessionUsers, setSessionUsers] = useState<Record<string, { apellidos: string, nombres: string }>>({});

  const appName = config?.title || APP_CONFIG.name;
  const loginMessage = config?.message || 'Identifícate para comenzar tu capacitación';

  // Load known users from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('learndrive_known_users');
      if (saved) {
        setSessionUsers(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading known users:', e);
    }
  }, []);

  // Autocomplete names when DNI is entered
  useEffect(() => {
    // Priority: local session users > global users from sheets
    const userMap = { ...globalKnownUsers, ...sessionUsers };
    
    if (dni.length >= 8 && userMap[dni]) {
      const savedUser = userMap[dni];
      if (!apellidos) setApellidos(savedUser.apellidos);
      if (!nombres) setNombres(savedUser.nombres);
    }
  }, [dni, globalKnownUsers, sessionUsers]);

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

    // Save user to session users list for immediate results
    const updatedUsers = {
      ...sessionUsers,
      [trimDni]: { apellidos: trimApellidos.toUpperCase(), nombres: trimNombres.toUpperCase() }
    };
    setSessionUsers(updatedUsers);
    // Also update localStorage as a last-resort fallback
    localStorage.setItem('learndrive_known_users', JSON.stringify({ ...globalKnownUsers, ...updatedUsers }));

    onLogin(trimDni, trimApellidos.toUpperCase(), trimNombres.toUpperCase());
  };

  const handleSupportClick = () => {
    if (!config?.contact) return;
    const cleanNumber = config.contact.replace(/\+/g, '');
    const message = encodeURIComponent(`Hola, necesito soporte con el app ${appName}`);
    window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 overflow-x-hidden">
      {/* Premium background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo and Welcome */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-blue-200 font-black uppercase tracking-[0.2em]">Versión {APP_CONFIG.version}</span>
          </motion.div>

          <h1 className="text-5xl font-black text-white mb-3 tracking-tighter">
            {appName}
          </h1>
          <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-[280px] mx-auto">
            {loginMessage}
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card rounded-[2.5rem] p-8 sm:p-10 border border-white/10 shadow-2xl shadow-blue-900/20">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              {/* DNI */}
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
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
                  className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/5 border border-white/5 text-white placeholder-slate-500 font-bold outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all"
                  autoFocus
                />
              </div>

              {/* Apellidos */}
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  placeholder="Apellidos"
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/5 border border-white/5 text-white placeholder-slate-500 font-bold outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all"
                />
              </div>

              {/* Nombres */}
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  placeholder="Nombres"
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/5 border border-white/5 text-white placeholder-slate-500 font-bold outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20"
              >
                <p className="text-rose-400 text-xs font-bold text-center">
                  {error}
                </p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-blue-900/40 disabled:opacity-50 transition-all active:scale-[0.98] group"
            >
              {isRegistering ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                  <span>REGISTRANDO...</span>
                </>
              ) : (
                <>
                  <span>INGRESAR</span>
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Support Section */}
        {config?.contact && (
          <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: 1 }}
             className="mt-8 text-center"
          >
            <button
               onClick={handleSupportClick}
               className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest group"
            >
              <MessageCircle className="w-4 h-4 text-emerald-500 group-hover:scale-125 transition-transform" />
              Soporte Técnico
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
