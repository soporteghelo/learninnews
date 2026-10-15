import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import html2pdf from 'html2pdf.js';
import { FileText, Loader2, Printer, RotateCcw, X } from 'lucide-react';
import type { AppDynamicConfig, PacPrograma, PacResultado } from '../types';
import { fetchPersonalActivo } from '../services/sheetsService';
import { fetchDriveImageAsBase64 } from '../lib/driveImage';
import { normalizeDni, pickIntentosParaRegistro } from '../lib/pacPadron';
import { trimSignature } from '../lib/signatureTrim';
import PacRegistroF62Template from './PacRegistroF62Template';
import { defaultF62Editable, type F62Editable, type F62Tipo, type PacF62Row } from '../lib/f62';

const storageKey = (programaId: string) => `pac_f62_${programaId}`;

function loadDatos(programa: PacPrograma, appConfig: AppDynamicConfig | null): F62Editable {
  const base = defaultF62Editable(programa, appConfig);
  try {
    const raw = localStorage.getItem(storageKey(programa.id));
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* sin almacenamiento: se usan los valores por defecto */ }
  return base;
}

const inputCls = 'w-full px-2.5 py-1.5 text-xs text-[#111827] font-medium border border-[#e1e3e4] rounded-lg focus:outline-none focus:border-[#1b4d89] bg-white';
const labelCls = 'block text-[10px] font-bold text-[#737781] uppercase mb-1';

/**
 * Registro RG-CL-SSMA-1-F62 de una capacitación PAC. El admin solo edita el
 * encabezado (tipo, tema, fecha, capacitador, horas) y el responsable del
 * registro; la asistencia —nombre, DNI, ocupación, área y firma— sale de las
 * evaluaciones rendidas. Lo editado se recuerda por capacitación en este navegador.
 */
export default function PacRegistroF62Modal({ programa, resultados, appConfig, onClose, onError }: {
  programa: PacPrograma;
  resultados: PacResultado[];
  appConfig: AppDynamicConfig | null;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [datos, setDatos] = useState<F62Editable>(() => loadDatos(programa, appConfig));
  const [rows, setRows] = useState<PacF62Row[] | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey(programa.id), JSON.stringify(datos)); } catch { /* no crítico */ }
  }, [datos, programa.id]);

  // Asistencia: un intento por persona, con su ocupación del padrón y su firma recortada
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const intentos = pickIntentosParaRegistro(programa.id, resultados);
      const padron = await fetchPersonalActivo().catch(() => []);
      const cargoPorDni = new Map(padron.map(p => [normalizeDni(p.dni), p.cargo]));
      const filas = await Promise.all(intentos.map(async (r): Promise<PacF62Row> => {
        const firma = await fetchDriveImageAsBase64(r.firmaUrl);
        return {
          dni: normalizeDni(r.dni),
          nombre: `${r.apellidos} ${r.nombres}`.trim(),
          ocupacion: cargoPorDni.get(normalizeDni(r.dni)) || '',
          area: r.area,
          observacion: `Nota ${r.nota.toFixed(1)} - ${r.aprobado ? 'Aprobado' : 'Desaprobado'}`,
          firmaBase64: firma ? await trimSignature(firma) : undefined,
        };
      }));
      if (!cancelado) setRows(filas);
    })().catch(() => { if (!cancelado) { setRows([]); onError('No se pudo cargar la asistencia'); } });
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programa.id, resultados]);

  const set = <K extends keyof F62Editable>(key: K, value: F62Editable[K]) => setDatos(d => ({ ...d, [key]: value }));
  const sinFirma = rows?.filter(r => !r.firmaBase64).length || 0;
  const slug = (programa.nombre || 'PAC').toUpperCase().replace(/[^A-Z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 40);

  const handlePdf = async () => {
    const el = templateRef.current;
    if (!el) return;
    setBusy('pdf');
    try {
      const filename = `F62_${slug}_${new Date().toISOString().split('T')[0]}.pdf`;
      const worker = html2pdf().from(el).set({
        margin: 0, filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css'] },
      } as object);
      // Descarga vía Blob + <a download> (ver downloadElementAsPdf en AdminPanel)
      const blob = (await worker.outputPdf('blob')) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      onError('Error al generar el PDF');
    } finally {
      setBusy(null);
    }
  };

  // Impresión directa: el formato en una ventana aparte con @page A4 sin márgenes
  const handlePrint = () => {
    const el = templateRef.current;
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) { onError('El navegador bloqueó la ventana de impresión'); return; }
    setBusy('print');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>F62 ${programa.nombre}</title>
      <style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}.f62-page{page-break-after:always}.f62-page:last-child{page-break-after:auto}</style>
      </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    const imgs = Array.from(win.document.images);
    Promise.all(imgs.map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = res; })))
      .then(() => { win.focus(); win.print(); })
      .finally(() => setBusy(null));
  };

  const tipos: [F62Tipo, string][] = [['induccion', 'Inducción'], ['capacitacion', 'Capacitación'], ['entrenamiento', 'Entrenamiento'], ['simulacro', 'Simulacro de emergencia']];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-2 sm:p-4">
      <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-[1400px] h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#e1e3e4] flex-shrink-0 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-black text-[#00366b]">Registro de capacitación — RG-CL-SSMA-1-F62</p>
            <p className="text-[11px] text-[#737781] truncate">
              {programa.nombre} · {rows === null ? 'cargando asistencia…' : `${rows.length} participante${rows.length === 1 ? '' : 's'}`}
              {sinFirma > 0 && <span className="text-amber-600 font-semibold"> · {sinFirma} sin firma</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} disabled={rows === null || busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#e1e3e4] text-xs font-bold text-[#424750] hover:bg-[#f3f4f5] disabled:opacity-50">
              {busy === 'print' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} Imprimir
            </button>
            <button onClick={handlePdf} disabled={rows === null || busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1b4d89] text-white text-xs font-bold disabled:opacity-50">
              {busy === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Descargar PDF
            </button>
            <button onClick={onClose} title="Cerrar" className="p-1.5 rounded-lg text-[#737781] hover:bg-[#f3f4f5]"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Campos editables */}
          <div className="lg:w-80 flex-shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-[#e1e3e4] p-4 space-y-4 max-h-[40vh] lg:max-h-none">
            <div>
              <p className={labelCls}>Marcar (X)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {tipos.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-[#424750] font-semibold cursor-pointer">
                    <input type="checkbox" checked={datos.tipos[key]} onChange={e => set('tipos', { ...datos.tipos, [key]: e.target.checked })} className="accent-[#1b4d89]" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className={labelCls}>10 Tema</p>
              <div className="space-y-1.5">
                {[0, 1, 2, 3].map(i => (
                  <input key={i} value={datos.tema[i] || ''} placeholder={`Línea ${i + 1}`}
                    onChange={e => { const tema = [...datos.tema]; tema[i] = e.target.value; set('tema', tema); }} className={inputCls} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>11 Fecha</label><input value={datos.fecha} onChange={e => set('fecha', e.target.value)} placeholder="dd/mm/aaaa" className={inputCls} /></div>
              <div><label className={labelCls}>13 N° horas</label><input value={datos.horas} onChange={e => set('horas', e.target.value)} className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>12 Nombre capacitador</label><input value={datos.capacitador} onChange={e => set('capacitador', e.target.value)} className={inputCls} /></div>

            <div className="pt-3 border-t border-[#e1e3e4] space-y-2.5">
              <p className="text-[10px] font-black text-[#00366b] uppercase">20 Responsable del registro</p>
              <div><label className={labelCls}>Nombre</label><input value={datos.responsableNombre} onChange={e => set('responsableNombre', e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Cargo</label><input value={datos.responsableCargo} onChange={e => set('responsableCargo', e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Fecha</label><input value={datos.responsableFecha} onChange={e => set('responsableFecha', e.target.value)} placeholder="dd/mm/aaaa" className={inputCls} /></div>
              <label className={`flex items-center gap-2 text-xs font-semibold ${appConfig?.firmaRepresentante ? 'text-[#424750] cursor-pointer' : 'text-[#b0b3b8]'}`}>
                <input type="checkbox" disabled={!appConfig?.firmaRepresentante} checked={datos.incluirFirmaResponsable && !!appConfig?.firmaRepresentante}
                  onChange={e => set('incluirFirmaResponsable', e.target.checked)} className="accent-[#1b4d89]" />
                Insertar firma registrada en Configuración
              </label>
              <div><label className={labelCls}>Referencia al pie</label><input value={datos.referencia} onChange={e => set('referencia', e.target.value)} placeholder="CERRO LINDO//32001337//BOND//2025" className={inputCls} /></div>
            </div>

            <button onClick={() => setDatos(defaultF62Editable(programa, appConfig))}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[#737781] hover:text-[#1b4d89]">
              <RotateCcw className="w-3 h-3" /> Restablecer valores
            </button>
          </div>

          {/* Vista previa */}
          <div className="flex-1 min-h-0 overflow-auto bg-[#e9ebee] p-4">
            {rows === null ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-[#737781]">
                <Loader2 className="w-6 h-6 animate-spin text-[#1b4d89]" /> Cargando asistencia y firmas…
              </div>
            ) : (
              <div className="w-fit mx-auto shadow-lg">
                <PacRegistroF62Template ref={templateRef} rows={rows} datos={datos} appConfig={appConfig} />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
