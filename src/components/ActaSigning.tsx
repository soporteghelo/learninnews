import { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Camera, PenTool, CheckCircle, Download, Check,
  ArrowRight, Loader2, AlertCircle, RefreshCw, FileSignature, Mail, FileText, ExternalLink
} from 'lucide-react';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import html2pdf from 'html2pdf.js';
import { saveActaFirma } from '../services/sheetsService';
import type { UserSession, AppDynamicConfig, ActaDocumento } from '../types';
import ActaTemplate, { type ActaSignerData } from './ActaTemplate';
import { getGeneralActaDocuments, GENERAL_ACTA_ID, GENERAL_ACTA_TITULO, ACTA_DECLARACION } from '../lib/actaAssignment';
import { useFaceCapture } from '../hooks/useFaceCapture';
import { fetchDriveImageAsBase64 } from '../lib/driveImage';

interface ActaSigningProps {
  /** Documentos asignados al trabajador (se reúnen en una sola acta general). */
  documentos: ActaDocumento[];
  userSession: UserSession;
  appConfig: AppDynamicConfig | null;
  onBack: () => void;
  onSuccess: (pdfUrl: string) => void;
}

type Step = 'confirm' | 'signature' | 'signatureAsistencia' | 'selfie' | 'generating' | 'success';

export default function ActaSigning({ documentos, userSession, appConfig, onBack, onSuccess }: ActaSigningProps) {
  const [step, setStep] = useState<Step>('confirm');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<string>('NO');

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureAsistenciaData, setSignatureAsistenciaData] = useState<string | null>(null);
  const [hasDrawnAsistencia, setHasDrawnAsistencia] = useState(false);
  const [logoSrc, setLogoSrc] = useState('');
  const [firmaRepSrc, setFirmaRepSrc] = useState('');
  const [correo, setCorreo] = useState(userSession.correo || '');
  const [geo, setGeo] = useState('');

  // Lista aplanada de documentos que van en el acta general
  const docs = useMemo(() => getGeneralActaDocuments(documentos, userSession), [documentos, userSession]);

  // Folio de verificación único, estable durante esta firma
  const folio = useMemo(() => 'AC-' + userSession.dni + '-' + Date.now().toString(36).toUpperCase(), [userSession.dni]);

  // Timestamp estable para esta firma: se genera una sola vez en el cliente y se
  // envía al backend, que lo usa tal cual como Id de la fila y en los nombres de
  // archivo — así el N° impreso en el PDF coincide exactamente con el Id guardado
  // en ACTAS_FIRMAS (en vez de que el backend genere su propio timestamp después
  // de que el PDF ya fue renderizado).
  const docTimestamp = useMemo(() => Date.now(), []);
  const actaNumero = `${userSession.dni}-${GENERAL_ACTA_ID}-${docTimestamp}`;

  // Documentos que el trabajador confirma recibir (por defecto todos marcados).
  // Solo los marcados salen en el acta.
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(() => new Set(docs.map((_, i) => i)));
  const selectedDocs = useMemo(() => docs.filter((_, i) => selectedIdx.has(i)), [docs, selectedIdx]);
  const toggleDoc = (i: number) => setSelectedIdx(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  // Si alguno de los documentos marcados es una capacitación, se pide una firma
  // adicional (distinta de la del acta) para la Lista de Asistencia.
  const requiereFirmaAsistencia = selectedDocs.some(d => d.categoria === 'capacitacion');

  // Captura facial (MediaPipe) encapsulada en un hook compartido
  const {
    faceStatus, stabilityProgress, selfieData, setIsCameraReady,
    cameraSessionKey, timestamp, webcamRef, resetSelfie, restartCamera, onCameraReady,
  } = useFaceCapture(step === 'selfie');

  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);
  const sigCanvasAsistencia = useRef<SignatureCanvas>(null);
  const sigContainerRefAsistencia = useRef<HTMLDivElement>(null);
  const actaRef = useRef<HTMLDivElement>(null);

  const signer: ActaSignerData & { fechaIngreso?: string } = {
    nombres: userSession.nombres,
    apellidos: userSession.apellidos,
    dni: userSession.dni,
    cargo: userSession.cargo,
    area: userSession.area,
    empresa: userSession.empresa,
    fechaIngreso: userSession.fechaIngreso,
  };
  const dispositivo = typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 120) : '';

  // El acta general siempre lleva la firma dibujada del trabajador
  const steps: Step[] = requiereFirmaAsistencia
    ? ['confirm', 'signature', 'signatureAsistencia', 'selfie', 'success']
    : ['confirm', 'signature', 'selfie', 'success'];

  // Resize signature canvas(es) to container
  useLayoutEffect(() => {
    if (step === 'signature' && sigContainerRef.current && sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      canvas.width = sigContainerRef.current.offsetWidth;
      canvas.height = sigContainerRef.current.offsetHeight;
    }
    if (step === 'signatureAsistencia' && sigContainerRefAsistencia.current && sigCanvasAsistencia.current) {
      const canvas = sigCanvasAsistencia.current.getCanvas();
      canvas.width = sigContainerRefAsistencia.current.offsetWidth;
      canvas.height = sigContainerRefAsistencia.current.offsetHeight;
    }
  }, [step]);

  // Load branding logo + firma del representante como base64 para html2canvas
  useEffect(() => {
    if (!appConfig) return;
    fetchDriveImageAsBase64(appConfig.logoCertificado).then(setLogoSrc);
    if (appConfig.firmaRepresentante) fetchDriveImageAsBase64(appConfig.firmaRepresentante).then(setFirmaRepSrc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appConfig]);

  // Geolocalización (best-effort) para reforzar la verificación de identidad del acta
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
      () => { /* permiso denegado o no disponible: se omite en el acta */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const handleNext = () => {
    if (step === 'confirm') {
      if (selectedIdx.size === 0) {
        setError('Marca al menos un documento que estás recibiendo');
        return;
      }
      if (!correo.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
        setError('Ingresa un correo válido para recibir el acta firmada');
        return;
      }
      setStep('signature');
      setError(null);
    } else if (step === 'signature') {
      if (!hasDrawn) { setError('Por favor, firma antes de continuar'); return; }
      const finalSig = sigCanvas.current?.getCanvas().toDataURL('image/png') ?? signatureData;
      setSignatureData(finalSig);
      setError(null);
      setStep(requiereFirmaAsistencia ? 'signatureAsistencia' : 'selfie');
    } else if (step === 'signatureAsistencia') {
      if (!hasDrawnAsistencia) { setError('Por favor, firma la lista de asistencia antes de continuar'); return; }
      const finalSigAsis = sigCanvasAsistencia.current?.getCanvas().toDataURL('image/png') ?? signatureAsistenciaData;
      setSignatureAsistenciaData(finalSigAsis);
      setStep('selfie');
      setError(null);
    }
  };

  const clearSignature = () => { sigCanvas.current?.clear(); setSignatureData(null); setHasDrawn(false); };
  const saveSig = () => {
    const data = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
    if (data) { setSignatureData(data); setHasDrawn(true); }
  };

  const clearSignatureAsistencia = () => { sigCanvasAsistencia.current?.clear(); setSignatureAsistenciaData(null); setHasDrawnAsistencia(false); };
  const saveSigAsistencia = () => {
    const data = sigCanvasAsistencia.current?.getTrimmedCanvas().toDataURL('image/png');
    if (data) { setSignatureAsistenciaData(data); setHasDrawnAsistencia(true); }
  };

  const generateAndUpload = async () => {
    setStep('generating');
    setError(null);
    try {
      const element = actaRef.current;
      if (!element) throw new Error('No se encontró la plantilla del acta');
      const opt = {
        margin: 0,
        filename: `ACTA_${userSession.dni}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, imageTimeout: 10000, allowTaint: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      // @ts-ignore
      const worker = html2pdf().from(element).set(opt);
      const pdfBase64 = await worker.outputPdf('dataurlstring').then((dataUrl: string) => dataUrl.split(',')[1]);

      setIsUploading(true);
      const result = await saveActaFirma({
        documentoId: GENERAL_ACTA_ID,
        documentoTitulo: GENERAL_ACTA_TITULO,
        dni: userSession.dni,
        apellidos: userSession.apellidos,
        nombres: userSession.nombres,
        cargo: userSession.cargo,
        area: userSession.area,
        empresa: userSession.empresa,
        correo: correo.trim(),
        driveDocUrl: '',
        timestampId: docTimestamp,
        documentos: selectedDocs.map(d => d.id),
        pdfBase64,
        signatureBase64: signatureData || undefined,
        selfieBase64: selfieData || undefined,
        firmaAsistenciaBase64: signatureAsistenciaData || undefined,
        dispositivo,
      });

      if (result.success && result.url) {
        setPdfUrl(result.url);
        setEmailSent(result.correoEnviado || (result.duplicate ? '' : 'NO'));
        setStep('success');
        onSuccess(result.url);
      } else {
        throw new Error(result.message || 'Error al guardar el acta');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al generar el acta');
      setStep('selfie');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadLocal = () => {
    const element = actaRef.current;
    if (!element) return;
    const opt = {
      margin: 0,
      filename: `ACTA_${userSession.dni}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };
    // @ts-ignore
    html2pdf().from(element).set(opt).save();
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            step === s ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' :
            (steps.indexOf(step) > i ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500')
          }`}>
            {steps.indexOf(step) > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          {i < steps.length - 1 && <div className={`w-8 h-px ${steps.indexOf(step) > i ? 'bg-emerald-500/30' : 'bg-slate-800'}`} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-4 safe-area-top safe-area-bottom">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-xl mx-auto relative">
        {/* Encabezado + progreso: fijo arriba mientras el contenido del paso hace scroll debajo. */}
        <div className="sticky top-0 z-20 glass-strong rounded-2xl px-4 pt-3 pb-1 mb-4 -mx-4 sm:mx-0">
          <div className="flex items-center justify-between mb-6">
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter truncate">Firma de Acta</h2>
              <p className="text-slate-500 text-xs font-bold tracking-widest">VERIFICACIÓN FACIAL</p>
            </div>
            <button onClick={onBack} className="w-10 h-10 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center hover:bg-slate-800 transition-colors flex-shrink-0">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {step !== 'success' && step !== 'generating' && <StepIndicator />}
        </div>

        <AnimatePresence mode="wait">
          {step === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5">
              <div className="flex gap-3 mb-6">
                <button onClick={onBack} className="py-4 px-5 rounded-xl border-2 border-white/25 text-slate-400 font-black text-xs tracking-widest hover:text-white hover:border-white/50 active:scale-[0.98] transition-all">
                  ← Volver
                </button>
                <button onClick={handleNext} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-2 border-white/25">
                  LEER Y CONTINUAR <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <FileSignature className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white truncate">{GENERAL_ACTA_TITULO}</h3>
              </div>

              {docs.length > 0 ? (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <p className="text-[11px] font-black text-blue-300 uppercase tracking-widest">Marca lo que recibes ({selectedIdx.size}/{docs.length})</p>
                  </div>
                  <p className="text-slate-500 text-[10px] mb-2.5">Toca cada documento para marcarlo o desmarcarlo. Solo los marcados aparecerán en el acta.</p>
                  <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                    {docs.map((it, i) => {
                      const isSel = selectedIdx.has(i);
                      return (
                        <div key={i} className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-all ${isSel ? 'bg-white/5 border-white/10' : 'bg-transparent border-white/5'}`}>
                          <button type="button" onClick={() => toggleDoc(i)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors ${isSel ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                              {isSel && <Check className="w-4 h-4 text-white" />}
                            </div>
                            <p className={`font-semibold text-[13px] leading-snug truncate ${isSel ? 'text-white' : 'text-slate-500 line-through'}`}>{it.nombre}</p>
                          </button>
                          {it.driveUrl && (
                            <a href={it.driveUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] font-black text-blue-300 uppercase tracking-widest bg-blue-500/10 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/20 transition-all flex-shrink-0">
                              <ExternalLink className="w-3 h-3" /> Ver
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-xs mb-5">No hay documentos asignados a tu perfil.</p>
              )}

              {/* Declaración — debe leerse antes de firmar */}
              <div className="mb-5 p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1.5">Declaración</p>
                <p className="text-slate-300 text-[10.5px] leading-snug">{ACTA_DECLARACION}</p>
                <p className="text-slate-400 text-[10px] italic mt-1.5">La presente acta se firma en señal de conformidad.</p>
              </div>

              {/* Email */}
              <div className="relative group">
                <label className="text-[10px] text-blue-400 font-bold uppercase tracking-widest pl-1 mb-1 block">Correo para recibir el acta</label>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 focus-within:border-blue-500/50 transition-all">
                  <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <input type="email" inputMode="email" placeholder="tucorreo@ejemplo.com" value={correo}
                    onChange={(e) => setCorreo(e.target.value.trim())}
                    className="w-full py-3 bg-transparent text-white placeholder-slate-600 text-sm font-semibold outline-none" />
                </div>
              </div>

              {error && <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mt-3"><AlertCircle className="w-3 h-3" /> {error}</p>}
              <p className="text-slate-500 text-[11px] text-center leading-relaxed mt-5">
                Al firmar declaras haber recibido y comprendido los documentos detallados. El acta incluye tu firma, verificación facial, folio único, ubicación aproximada y datos del dispositivo, y se remite a tu correo.
              </p>
            </motion.div>
          )}

          {step === 'signature' && (
            <motion.div key="signature" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5">
              <div className="flex gap-3 mb-6">
                <button onClick={clearSignature} className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-xl font-black text-[10px] tracking-widest border-2 border-white/25 hover:text-white hover:border-white/50 transition-all">
                  LIMPIAR
                </button>
                <button onClick={handleNext} className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-2 overflow-hidden border-2 border-white/25">
                  {signatureData ? 'CONFIRMAR FIRMA' : 'DIBUJA TU FIRMA'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <PenTool className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Firma del Trabajador</h3>
              </div>
              <div ref={sigContainerRef} className="bg-white rounded-2xl overflow-hidden mb-4 border-2 border-slate-800" style={{ height: '200px' }}>
                <SignatureCanvas ref={sigCanvas} penColor="#000"
                  canvasProps={{ style: { width: '100%', height: '100%', cursor: 'crosshair', display: 'block' } }}
                  onBegin={() => { setHasDrawn(true); setError(null); }} onEnd={saveSig} />
              </div>
              {error && <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
            </motion.div>
          )}

          {step === 'signatureAsistencia' && (
            <motion.div key="signatureAsistencia" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5">
              <div className="flex gap-3 mb-6">
                <button onClick={clearSignatureAsistencia} className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-xl font-black text-[10px] tracking-widest border-2 border-white/25 hover:text-white hover:border-white/50 transition-all">
                  LIMPIAR
                </button>
                <button onClick={handleNext} className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-2 overflow-hidden border-2 border-white/25">
                  {signatureAsistenciaData ? 'CONFIRMAR FIRMA' : 'DIBUJA TU FIRMA'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <PenTool className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Firma para Lista de Asistencia</h3>
              </div>
              <p className="text-slate-500 text-[11px] mb-4">
                Al menos una capacitación forma parte de tu acta. Firma una vez más para el registro de asistencia (independiente de tu firma anterior).
              </p>
              <div ref={sigContainerRefAsistencia} className="bg-white rounded-2xl overflow-hidden mb-4 border-2 border-slate-800" style={{ height: '200px' }}>
                <SignatureCanvas ref={sigCanvasAsistencia} penColor="#000"
                  canvasProps={{ style: { width: '100%', height: '100%', cursor: 'crosshair', display: 'block' } }}
                  onBegin={() => { setHasDrawnAsistencia(true); setError(null); }} onEnd={saveSigAsistencia} />
              </div>
              {error && <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
            </motion.div>
          )}

          {step === 'selfie' && (
            <motion.div key="selfie" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5">
              {selfieData && (
                <div className="flex gap-2 mb-5">
                  <button onClick={() => { resetSelfie(); setError(null); }}
                    className="flex-1 py-3 bg-slate-800/90 text-white rounded-xl font-black text-[10px] tracking-widest border-2 border-white/25 flex items-center justify-center gap-1.5 hover:bg-slate-700/90 hover:border-white/50 transition-all">
                    <RefreshCw className="w-3.5 h-3.5" /> REPETIR
                  </button>
                  <button onClick={generateAndUpload} disabled={isUploading}
                    className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 border-2 border-white/25">
                    {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5" />}
                    {isUploading ? 'PROCESANDO...' : 'FIRMAR ACTA'}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <Camera className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Validación Biométrica</h3>
              </div>

              {!selfieData ? (
                <>
                  {(() => {
                    const cfg: Record<string, { color: string; bg: string; text: string }> = {
                      loading:    { color: 'text-slate-400',  bg: 'bg-slate-800/60',   text: '⏳ Iniciando cámara...' },
                      no_face:    { color: 'text-slate-300',  bg: 'bg-slate-800/60',   text: '👤 Coloca tu rostro en el óvalo' },
                      too_far:    { color: 'text-amber-400',  bg: 'bg-amber-500/10',   text: '🔍 Acércate más a la cámara' },
                      too_close:  { color: 'text-orange-400', bg: 'bg-orange-500/10',  text: '↔ Aléjate un poco de la cámara' },
                      off_center: { color: 'text-yellow-400', bg: 'bg-yellow-500/10',  text: '↕ Centra tu rostro en el óvalo' },
                      good:       { color: 'text-emerald-400', bg: 'bg-emerald-500/10', text: '✅ ¡Perfecto! Mantente quieto...' },
                    };
                    const c = cfg[faceStatus] ?? cfg.no_face;
                    return <p className={`text-center text-[11px] font-bold tracking-widest uppercase mb-3 px-3 py-2 rounded-lg ${c.color} ${c.bg}`}>{c.text}</p>;
                  })()}

                  <div className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-slate-900 mb-4"
                    style={{ border: `2px solid ${faceStatus === 'good' ? '#10b981' : (faceStatus === 'too_close' || faceStatus === 'too_far' || faceStatus === 'off_center') ? '#f59e0b' : '#1e293b'}`, transition: 'border-color 0.3s' }}>
                    <Webcam key={cameraSessionKey} audio={false} ref={webcamRef} screenshotFormat="image/jpeg"
                      onUserMedia={() => { onCameraReady(); setError(null); }}
                      onUserMediaError={(mediaError) => { console.error('Webcam error:', mediaError); setIsCameraReady(false); setError('No se pudo acceder a la cámara'); }}
                      className="w-full h-full object-cover" videoConstraints={{ facingMode: 'user', width: 640, height: 480 }} />

                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div style={{
                        width: '62%', height: '72%', borderRadius: '50%',
                        border: `2.5px ${faceStatus === 'good' ? 'solid' : 'dashed'} ${faceStatus === 'good' ? '#10b981' : (faceStatus === 'too_close' || faceStatus === 'too_far' || faceStatus === 'off_center') ? '#f59e0b' : 'rgba(255,255,255,0.4)'}`,
                        transition: 'border-color 0.3s, border-style 0.3s', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                      }} />
                    </div>

                    {(faceStatus === 'too_far' || faceStatus === 'too_close' || faceStatus === 'off_center') && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                          className="w-14 h-14 rounded-full bg-amber-500/80 flex items-center justify-center">
                          <span className="text-white text-2xl font-black">{faceStatus === 'too_far' ? '🔍' : faceStatus === 'too_close' ? '↩' : '⊕'}</span>
                        </motion.div>
                      </div>
                    )}

                    {faceStatus === 'good' && stabilityProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900/60">
                        <motion.div className="h-full bg-emerald-500" animate={{ width: `${stabilityProgress}%` }} transition={{ duration: 0.1 }} />
                      </div>
                    )}
                  </div>

                  <button onClick={restartCamera}
                    className="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-black text-[10px] tracking-widest border border-white/5 flex items-center justify-center gap-2 hover:bg-slate-700 transition-all">
                    <RefreshCw className="w-3.5 h-3.5" /> REINICIAR CÁMARA
                  </button>
                </>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-slate-900 mb-2">
                  <img src={selfieData} alt="Selfie" className="w-full object-cover" style={{ maxHeight: '55vh' }} />
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-3 pt-6 bg-gradient-to-t from-black/70 to-transparent">
                    <span className="bg-emerald-500 text-black text-[9px] font-black px-3 py-1 rounded-full tracking-widest uppercase">CAPTURA EXITOSA</span>
                  </div>
                </div>
              )}

              {error && <p className="text-red-400 text-[10px] font-bold mb-1 uppercase tracking-wider flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
            </motion.div>
          )}

          {step === 'generating' && (
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass-card rounded-3xl p-12 border-white/5 text-center flex flex-col items-center">
              <div className="relative w-24 h-24 mb-8">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }} className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
                <motion.div animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="absolute inset-2 border-4 border-t-blue-500 rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center"><FileSignature className="w-8 h-8 text-blue-400 animate-pulse" /></div>
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Firmando Acta</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                Generando el PDF, guardándolo en Drive y enviándolo a tu correo...
              </p>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-3xl p-8 border-emerald-500/20 text-center">
              <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 mx-auto relative">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 bg-emerald-500/20 rounded-full" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">¡Acta Firmada!</h3>
              <p className="text-slate-400 text-sm mb-3 leading-relaxed">
                Tu acta de recepción de documentos fue firmada y guardada correctamente.
              </p>
              <p className={`text-xs font-bold mb-8 ${emailSent === 'SI' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {emailSent === 'SI' ? `✓ Enviada a ${correo}` : 'El correo no pudo enviarse automáticamente; puedes descargar el PDF abajo.'}
              </p>

              <div className="space-y-3">
                <button onClick={downloadLocal} className="w-full py-4 bg-white text-slate-950 rounded-xl font-black text-xs tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl">
                  <Download className="w-5 h-5" /> DESCARGAR PDF
                </button>
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-blue-600/10 text-blue-300 border border-blue-500/20 rounded-xl font-black text-xs tracking-widest hover:bg-blue-600/20 transition-all flex items-center justify-center gap-3">
                    VER EN DRIVE
                  </a>
                )}
                <button onClick={onBack} className="w-full py-4 text-slate-500 font-bold text-[10px] tracking-widest uppercase hover:text-white transition-colors">
                  VOLVER
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HIDDEN ACTA TEMPLATE FOR PDF GENERATION */}
      <div className="fixed left-[-9999px] top-0 overflow-hidden" aria-hidden="true">
        <ActaTemplate
          ref={actaRef}
          signer={signer}
          documentos={selectedDocs}
          signatureData={signatureData}
          selfieData={selfieData}
          timestamp={timestamp || new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}
          dispositivo={dispositivo}
          appConfig={appConfig}
          logoSrc={logoSrc}
          representanteFirmaSrc={firmaRepSrc}
          numero={actaNumero}
          folio={folio}
          geo={geo}
          correo={correo.trim()}
        />
      </div>
    </div>
  );
}
