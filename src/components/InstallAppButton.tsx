import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

interface InstallAppButtonProps {
  darkMode: boolean;
}

export default function InstallAppButton({ darkMode }: InstallAppButtonProps) {
  const { isInstalled, isIOS, canPromptInstall, promptInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  // Nada que ofrecer: ya está instalada, o el navegador no soporta ninguna de las dos vías
  if (isInstalled || (!canPromptInstall && !isIOS)) return null;

  const handleClick = () => {
    if (canPromptInstall) promptInstall();
    else setShowIosGuide(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${darkMode ? 'border-white' : 'border-black'}`}
        style={{ background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
        aria-label="Instalar app en tu celular"
        title="Instalar app en tu celular"
      >
        <Download className="w-4 h-4" style={{ color: darkMode ? '#ffffff' : '#000000' }} />
      </button>

      <AnimatePresence>
        {showIosGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowIosGuide(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/10 p-6 text-white safe-area-bottom"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-black tracking-tight">Instalar en tu celular</h3>
                <button onClick={() => setShowIosGuide(false)} aria-label="Cerrar" className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="space-y-4 text-sm text-slate-300 leading-relaxed">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-xs">1</span>
                  <span>Toca el botón <Share className="w-4 h-4 inline -mt-0.5 text-blue-300" /> <strong className="text-white">Compartir</strong> en la barra de Safari.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-xs">2</span>
                  <span>Busca y selecciona <strong className="text-white">"Agregar a inicio"</strong> <PlusSquare className="w-4 h-4 inline -mt-0.5 text-blue-300" />.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-xs">3</span>
                  <span>Confirma tocando <strong className="text-white">"Agregar"</strong>. Listo: ya tendrás la app en tu pantalla de inicio.</span>
                </li>
              </ol>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
