import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, FileSignature, CheckCircle, Clock, ExternalLink, ClipboardList } from 'lucide-react';
import type { UserSession, AppDynamicConfig, ActaDocumento, ActaFirma } from '../types';
import ActaSigning from './ActaSigning';
import { getAssignedDocs, getGeneralActaDocuments, GENERAL_ACTA_ID, GENERAL_ACTA_TITULO } from '../lib/actaAssignment';

interface ActasScreenProps {
  userSession: UserSession;
  appConfig: AppDynamicConfig | null;
  documentos: ActaDocumento[];
  firmas: ActaFirma[];      // firmas del usuario actual
  onBack: () => void;
  onSigned: () => void;     // refresca firmas tras firmar
}

export default function ActasScreen({ userSession, appConfig, documentos, firmas, onBack, onSigned }: ActasScreenProps) {
  const [signing, setSigning] = useState(false);

  // Todos los documentos asignados al trabajador (por perfil o DNI)
  const assigned = useMemo(() => getAssignedDocs(documentos, userSession), [documentos, userSession]);
  const docs = useMemo(() => getGeneralActaDocuments(assigned), [assigned]);

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
        ) : generalFirma ? (
          /* Acta ya firmada */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Acta firmada</h3>
            </div>
            <div className="glass-card rounded-2xl p-5 border-emerald-500/10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">{GENERAL_ACTA_TITULO}</p>
                  <p className="text-slate-500 text-[11px]">Firmado: {generalFirma.fechaFirma} · {docs.length} documento{docs.length !== 1 ? 's' : ''}</p>
                </div>
                {generalFirma.actaPdfUrl && (
                  <a href={generalFirma.actaPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-all flex items-center gap-1 flex-shrink-0">
                    <ExternalLink className="w-3 h-3" /> Ver
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Acta pendiente */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-[11px] font-black text-amber-400 uppercase tracking-widest">Pendiente de firma</h3>
            </div>
            <motion.button
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => setSigning(true)}
              className="w-full text-left glass-card rounded-2xl p-5 border-white/5 hover:border-blue-500/40 transition-all group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <FileSignature className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">{GENERAL_ACTA_TITULO}</p>
                  <p className="text-amber-300/90 text-[11px] font-bold flex items-center gap-1 mt-0.5">
                    <ClipboardList className="w-3 h-3" /> {docs.length} documento{docs.length !== 1 ? 's' : ''} por recibir
                  </p>
                </div>
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-3 py-1.5 rounded-lg group-hover:bg-blue-500/20 transition-all flex-shrink-0">Firmar</span>
              </div>
              <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
                {docs.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <span className="text-[10px] font-black text-blue-400 w-4 flex-shrink-0">{i + 1}</span>
                    <p className="text-slate-200 text-[12px] leading-snug flex-1 min-w-0 truncate">{it.nombre}</p>
                    {it.digital && (
                      <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded flex-shrink-0">Digital</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}
