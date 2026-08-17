import { motion } from 'framer-motion';
import { UserCircle2, IdCard, LogOut } from 'lucide-react';
import { APP_CONFIG } from './config';
import type { UserSession } from './types';

interface HomeScreenProps {
  session: UserSession;
  onLogout: () => void;
}

/** Pantalla de inicio mostrada justo después de un login exitoso. */
export default function HomeScreen({ session, onLogout }: HomeScreenProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-950">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-card rounded-[2.5rem] p-8 sm:p-10 border border-white/10 shadow-2xl shadow-blue-900/20 bg-white/[0.03] backdrop-blur-xl text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <UserCircle2 className="w-10 h-10 text-white" />
          </div>

          <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em] mb-2">Bienvenido a {APP_CONFIG.name}</p>
          <h1 className="text-2xl font-black text-white mb-1 tracking-tight">
            {session.nombres} {session.apellidos}
          </h1>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mt-3 mb-8">
            <IdCard className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-slate-300 font-bold tracking-wide">DNI {session.dni}</span>
          </div>

          {/* Punto de partida: reemplaza este bloque por el contenido real de tu app. */}
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Tu sesión se inició correctamente. A partir de aquí puedes continuar
            hacia el resto de tu aplicación.
          </p>

          <button
            onClick={onLogout}
            className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </motion.div>
    </div>
  );
}
