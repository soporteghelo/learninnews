import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileSignature, CheckCircle, Clock, ExternalLink, ClipboardList, Eye, X, Monitor, FileText } from 'lucide-react';
import type { UserSession, AppDynamicConfig, ActaDocumento, ActaFirma } from '../types';
import ActaSigning from './ActaSigning';
import { getAssignedDocs, getGeneralActaDocuments, GENERAL_ACTA_ID, GENERAL_ACTA_TITULO, type GeneralActaDoc } from '../lib/actaAssignment';

interface ActasScreenProps {
  userSession: UserSession;
  appConfig: AppDynamicConfig | null;
  documentos: ActaDocumento[];
  firmas: ActaFirma[];      // firmas del usuario actual
  onBack: () => void;
  onSigned: () => void;     // refresca firmas tras firmar
}

/** Convierte un enlace de Drive en su URL de vista previa incrustable. */
function drivePreviewUrl(url?: string): string {
  if (!url) return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const id = m ? m[1] : '';
  return id ? `https://drive.google.com/file/d/${id}/preview` : url;
}

const tipoLabel = (t: 'virtual' | 'fisico') => (t === 'virtual' ? 'Virtual' : 'Físico');

export default function ActasScreen({ userSession, appConfig, documentos, firmas, onBack, onSigned }: ActasScreenProps) {
  const [signing, setSigning] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<GeneralActaDoc | null>(null);

  // Todos los documentos asignados al trabajador (por perfil o DNI)
  const assigned = useMemo(() => getAssignedDocs(documentos, userSession), [documentos, userSession]);
  const docs = useMemo(() => getGeneralActaDocuments(assigned, userSession), [assigned, userSession]);

  // La única firma que importa: la del acta general de este trabajador
  const generalFirma = useMemo(() => {
    const dni = String(userSession.dni).trim();
    return firmas.find(f => String(f.dni).trim() === dni && f.documentoId === GENERAL_ACTA_ID) || null;
  }, [firmas, userSession.dni]);

  if (signing) {
    return (
      <ActaSigning
        documentos={assigned}
        userSession={userSession}
        appConfig={appConfig}
        onBack={() => setSigning(false)}
        onSuccess={() => { onSigned(); }}
      />
    );
  }

  /** Fila de documento reutilizable (nombre + tipo en texto + botón Ver). */
  const DocRow = ({ it, i }: { it: GeneralActaDoc; i: number }) => (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
      <span className="text-[10px] font-black text-blue-400 w-4 flex-shrink-0">{i + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-slate-100 text-[13px] leading-snug truncate">{it.nombre}</p>
        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest mt-0.5 ${it.tipo === 'virtual' ? 'text-emerald-400' : 'text-amber-400'}`}>
          {it.tipo === 'virtual' ? <Monitor className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
          {tipoLabel(it.tipo)}
        </span>
      </div>
      {it.driveUrl ? (
        <button onClick={() => setViewingDoc(it)}
          className="flex items-center gap-1 text-[10px] font-black text-blue-300 uppercase tracking-widest bg-blue-500/10 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/20 transition-all flex-shrink-0">
          <Eye className="w-3 h-3" /> Ver
        </button>
      ) : (
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2 flex-shrink-0">Sin archivo</span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 safe-area-top safe-area-bottom pb-16">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Actas y Compromisos</h2>
            <p className="text-slate-500 text-xs font-bold tracking-widest">ACTA DE RECEPCIÓN DE DOCUMENTOS</p>
          </div>
        </div>

        {assigned.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 border-white/5 text-center">
            <ClipboardList className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-300 font-bold text-sm">No tienes documentos asignados</p>
            <p className="text-slate-500 text-xs mt-1">Cuando el administrador te asigne documentos, aparecerán aquí en tu acta.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Estado del acta */}
            {generalFirma ? (
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <h3 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Acta firmada</h3>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="text-[11px] font-black text-amber-400 uppercase tracking-widest">Pendiente de firma</h3>
              </div>
            )}

            {/* Tarjeta del acta */}
            <div className={`glass-card rounded-2xl p-5 border ${generalFirma ? 'border-emerald-500/10' : 'border-white/5'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${generalFirma ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                  {generalFirma ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <FileSignature className="w-5 h-5 text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">{GENERAL_ACTA_TITULO}</p>
                  {generalFirma ? (
                    <p className="text-slate-500 text-[11px]">Firmado: {generalFirma.fechaFirma} · {docs.length} documento{docs.length !== 1 ? 's' : ''}</p>
                  ) : (
                    <p className="text-amber-300/90 text-[11px] font-bold flex items-center gap-1 mt-0.5">
                      <ClipboardList className="w-3 h-3" /> {docs.length} documento{docs.length !== 1 ? 's' : ''} por recibir
                    </p>
                  )}
                </div>
                {generalFirma ? (
                  generalFirma.actaPdfUrl && (
                    <a href={generalFirma.actaPdfUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-all flex items-center gap-1 flex-shrink-0">
                      <ExternalLink className="w-3 h-3" /> Acta
                    </a>
                  )
                ) : (
                  <button onClick={() => setSigning(true)}
                    className="text-[10px] font-black text-white uppercase tracking-widest bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-all flex-shrink-0">
                    Firmar
                  </button>
                )}
              </div>

              {/* Lista de documentos con tipo y botón Ver */}
              <div className="space-y-1.5 max-h-[52vh] overflow-y-auto pr-1">
                {docs.map((it, i) => <DocRow key={i} it={it} i={i} />)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Visor de documento incrustado (misma página) */}
      <AnimatePresence>
        {viewingDoc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-slate-950/95 flex flex-col safe-area-top safe-area-bottom"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-white/10 flex-shrink-0">
              <button onClick={() => setViewingDoc(null)} title="Volver"
                className="w-9 h-9 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center hover:bg-slate-700 transition-colors flex-shrink-0">
                <ArrowLeft className="w-5 h-5 text-slate-300" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{viewingDoc.nombre}</p>
                <p className={`text-[11px] font-bold flex items-center gap-1 ${viewingDoc.tipo === 'virtual' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {viewingDoc.tipo === 'virtual' ? <Monitor className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  Tipo: {tipoLabel(viewingDoc.tipo)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {viewingDoc.driveUrl && (
                  <a href={viewingDoc.driveUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-black text-blue-300 uppercase tracking-widest bg-blue-500/10 px-3 py-2 rounded-lg hover:bg-blue-500/20 transition-all flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir
                  </a>
                )}
                <button onClick={() => setViewingDoc(null)} title="Cerrar"
                  className="w-9 h-9 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center hover:bg-slate-700 transition-colors">
                  <X className="w-5 h-5 text-slate-300" />
                </button>
              </div>
            </div>
            {viewingDoc.driveUrl ? (
              <iframe
                title={viewingDoc.nombre}
                src={drivePreviewUrl(viewingDoc.driveUrl)}
                className="flex-1 w-full bg-white"
                allow="autoplay"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <FileText className="w-12 h-12 text-slate-700 mb-3" />
                <p className="text-slate-300 font-bold text-sm">Documento físico</p>
                <p className="text-slate-500 text-xs mt-1">Este documento se entrega en físico; no tiene una versión digital para visualizar.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
