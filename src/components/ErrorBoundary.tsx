import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_FLAG = 'learndrive-error-reload-attempted';

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado:', error, info.componentStack);

    // Un módulo lazy (LearningMode, QuizMode, etc.) puede fallar al cargar si hubo un
    // corte de red momentáneo, o si el navegador tiene en caché un index.html viejo que
    // apunta a un chunk que ya no existe tras un nuevo deploy. En ambos casos, un solo
    // reload automático resuelve el problema sin que el usuario note nada (antes había
    // que recargar manualmente para "arreglarlo").
    const isChunkError = /dynamically imported module|loading chunk|failed to fetch/i.test(error.message);
    if (isChunkError && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }

    // Si el reload de más arriba ya se intentó y la app sigue funcionando bien un rato,
    // se limpia la bandera para permitir un nuevo intento ante un futuro error real.
    setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 border border-amber-500/20">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Algo salió mal</h1>
          <p className="text-slate-400 max-w-xs leading-relaxed mb-8">
            Ocurrió un error al cargar esta pantalla. Recarga la página para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-4 bg-white text-slate-950 rounded-2xl font-black text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> RECARGAR
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
