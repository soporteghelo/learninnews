import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ShieldCheck, CheckCircle2, AlertTriangle, XCircle,
  Loader2, RefreshCw, Stethoscope, ChevronDown,
} from 'lucide-react';
import { runSystemDiagnostics, type DiagnosticReport, type DiagnosticLevel } from '../services/sheetsService';

interface DiagnosticoPanelProps {
  open: boolean;
  onClose: () => void;
}

const LEVEL_STYLES: Record<DiagnosticLevel, { icon: typeof CheckCircle2; color: string; bg: string; ring: string }> = {
  ok:    { icon: CheckCircle2,  color: 'text-[#006d36]', bg: 'bg-[#9af7af]/15', ring: 'border-[#006d36]/30' },
  warn:  { icon: AlertTriangle, color: 'text-[#8a5a00]', bg: 'bg-[#ffe08a]/25', ring: 'border-[#8a5a00]/30' },
  error: { icon: XCircle,       color: 'text-[#93000a]', bg: 'bg-[#ffdad6]',    ring: 'border-[#ba1a1a]/40' },
};

/**
 * Módulo de verificación del sistema. Ejecuta un diagnóstico completo
 * (configuración, hojas, carpetas de Drive y permisos) y muestra qué está
 * correcto y qué necesita atención.
 */
export default function DiagnosticoPanel({ open, onClose }: DiagnosticoPanelProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    setExpandedIds(new Set());
    try {
      const result = await runSystemDiagnostics();
      setReport(result);
    } catch (e) {
      setFatalError(e instanceof Error ? e.message : 'Error inesperado al ejecutar el diagnóstico');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ejecuta automáticamente al abrir (una vez).
  useEffect(() => {
    if (open && !report && !loading) runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const overall: DiagnosticLevel = !report
    ? 'ok'
    : report.errores > 0
    ? 'error'
    : report.advertencias > 0
    ? 'warn'
    : 'ok';
  const overallStyle = LEVEL_STYLES[overall];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6" />
              <div>
                <h2 className="text-base font-bold leading-tight">Verificación del sistema</h2>
                <p className="text-[11px] text-white/70 leading-tight">Configuración, hojas, carpetas y permisos</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/15 transition-colors" title="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#1b4d89]">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm font-semibold">Ejecutando verificación…</p>
                <p className="text-[11px] text-[#737781]">Revisando hoja, carpetas y permisos</p>
              </div>
            )}

            {!loading && fatalError && (
              <div className="m-4 p-4 rounded-2xl bg-[#ffdad6] border border-[#ba1a1a]/40 text-[#93000a]">
                <div className="flex items-center gap-2 font-bold text-sm mb-1">
                  <XCircle className="w-5 h-5" /> No se pudo completar el diagnóstico
                </div>
                <p className="text-xs leading-relaxed">{fatalError}</p>
              </div>
            )}

            {!loading && report && (
              <div className="p-4 space-y-4">
                {/* Resumen general */}
                <div className={`p-4 rounded-2xl border ${overallStyle.bg} ${overallStyle.ring}`}>
                  <div className={`flex items-center gap-2 font-bold text-sm ${overallStyle.color}`}>
                    <overallStyle.icon className="w-5 h-5 flex-shrink-0" />
                    {report.resumen}
                  </div>
                  <div className="flex gap-4 mt-2 text-[11px] font-semibold">
                    <span className="text-[#006d36]">
                      {report.checks.filter((c) => c.level === 'ok').length} correctos
                    </span>
                    <span className="text-[#8a5a00]">{report.advertencias} advertencias</span>
                    <span className="text-[#93000a]">{report.errores} errores</span>
                  </div>
                </div>

                {/* Lista de chequeos */}
                <div className="space-y-2">
                  {report.checks.map((c) => {
                    const s = LEVEL_STYLES[c.level];
                    const Icon = s.icon;
                    const hasDetail = !!c.detail;
                    const isExpanded = expandedIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`rounded-xl border ${s.ring} ${c.level === 'ok' ? 'bg-white' : s.bg} overflow-hidden`}
                      >
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpanded(c.id)}
                          disabled={!hasDetail}
                          aria-expanded={hasDetail ? isExpanded : undefined}
                          className={`w-full flex items-start gap-3 p-3 text-left ${hasDetail ? 'cursor-pointer active:bg-black/5' : 'cursor-default'}`}
                        >
                          <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${s.color}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#191c1d]">{c.label}</p>
                            {hasDetail && !isExpanded && (
                              <p className="text-[11px] text-[#737781] mt-0.5 truncate leading-relaxed">{c.detail}</p>
                            )}
                          </div>
                          {hasDetail && (
                            <ChevronDown
                              className={`w-4 h-4 flex-shrink-0 mt-0.5 text-[#9aa0a6] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          )}
                        </button>
                        <AnimatePresence>
                          {hasDetail && isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <p className="text-[11px] text-[#737781] px-3 pb-3 -mt-1 break-words leading-relaxed">{c.detail}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-[#e1e3e4] bg-white flex-shrink-0 flex gap-2">
            <button
              onClick={runDiagnostics}
              disabled={loading}
              className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20 disabled:opacity-60 transition-all active:scale-[0.99]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
              {loading ? 'Verificando…' : report ? 'Volver a verificar' : 'Ejecutar verificación'}
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-2xl font-bold text-sm text-[#424750] bg-[#f3f4f5] hover:bg-[#e7e8e9] transition-colors"
            >
              Cerrar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Botón compacto reutilizable para abrir el panel de diagnóstico. */
export function DiagnosticoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2.5 rounded-xl hover:bg-[#f3f4f5] transition-colors"
      title="Verificación del sistema"
    >
      <Stethoscope className="w-5 h-5 text-[#424750]" />
    </button>
  );
}
