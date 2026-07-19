import { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, PenTool, CheckCircle, Download, Check,
  ArrowRight, Loader2, AlertCircle, RefreshCw, FileSignature, ShieldCheck, LogOut
} from 'lucide-react';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import html2pdf from 'html2pdf.js';
import { saveOnboardingConsent } from '../services/sheetsService';
import type { UserSession, AppDynamicConfig } from '../types';
import ConsentTemplate from './ConsentTemplate';
import { CONSENT_TITULO, CONSENT_PARRAFOS, CONSENT_CHECKBOX_LABEL } from '../lib/consentText';
import { useFaceCapture } from '../hooks/useFaceCapture';
import { fetchDriveImageAsBase64 } from '../lib/driveImage';

interface ConsentSigningProps {
  userSession: UserSession;
  appConfig: AppDynamicConfig | null;
  onSuccess: (data: { firmaUrl?: string; selfieUrl?: string }) => void;
  onLogout: () => void;
}

type Step = 'intro' | 'signature' | 'selfie' | 'generating' | 'success';

const steps: Step[] = ['intro', 'signature', 'selfie', 'success'];

export default function ConsentSigning({ userSession, appConfig, onSuccess, onLogout }: ConsentSigningProps) {
  const [step, setStep] = useState<Step>('intro');
  const [accepted, setAccepted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [logoSrc, setLogoSrc] = useState('');
  const [savedUrls, setSavedUrls] = useState<{ firmaUrl?: string; selfieUrl?: string }>({});

  const {
    faceStatus, stabilityProgress, selfieData, setIsCameraReady,
    cameraSessionKey, timestamp, webcamRef, resetSelfie, restartCamera, onCameraReady,
  } = useFaceCapture(step === 'selfie');

  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);
  const consentRef = useRef<HTMLDivElement>(null);

  const signer = {
    nombres: userSession.nombres,
    apellidos: userSession.apellidos,
    dni: userSession.dni,
    cargo: userSession.cargo,
    area: userSession.area,
    empresa: userSession.empresa,
  };
  const dispositivo = typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 120) : '';

  // Folio de verificación único, estable durante esta firma
  const folio = useMemo(() => 'CONS-' + userSession.dni + '-' + Date.now().toString(36).toUpperCase(), [userSession.dni]);

  useLayoutEffect(() => {
    if (step === 'signature' && sigContainerRef.current && sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      canvas.width = sigContainerRef.current.offsetWidth;
      canvas.height = sigContainerRef.current.offsetHeight;
    }
  }, [step]);

  useEffect(() => {
    if (!appConfig) return;
    fetchDriveImageAsBase64(appConfig.logoCertificado).then(setLogoSrc);
  }, [appConfig]);

  const clearSignature = () => { sigCanvas.current?.clear(); setSignatureData(null); setHasDrawn(false); };
  // getTrimmedCanvas() is broken under Vite dev (react-signature-canvas@1.1.0-alpha.2's
  // bundled trim-canvas interop throws); getCanvas() (untrimmed) works fine and is what
  // handleNext() already falls back to.
  const saveSig = () => {
    const data = sigCanvas.current?.getCanvas().toDataURL('image/png');
    if (data) { setSignatureData(data); setHasDrawn(true); }
  };

  const handleNext = () => {
    if (step === 'intro') {
      if (!accepted) { setError('Debes aceptar la autorización para continuar'); return; }
      setError(null);
      setStep('signature');
    } else if (step === 'signature') {
      if (!hasDrawn) { setError('Por favor, firma antes de continuar'); return; }
      const finalSig = sigCanvas.current?.getCanvas().toDataURL('image/png') ?? signatureData;
      setSignatureData(finalSig);
      setError(null);
      setStep('selfie');
    }
  };

  const generateAndUpload = async () => {
    setStep('generating');
    setError(null);
    try {
      const element = consentRef.current;
      if (!element) throw new Error('No se encontró la plantilla de la constancia');
      const opt = {
        margin: 0,
        filename: `CONSENTIMIENTO_${userSession.dni}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, imageTimeout: 10000, allowTaint: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      // @ts-ignore
      const worker = html2pdf().from(element).set(opt);
      const pdfBase64 = await worker.outputPdf('dataurlstring').then((dataUrl: string) => dataUrl.split(',')[1]);

      setIsUploading(true);
      const result = await saveOnboardingConsent({
        dni: userSession.dni,
        apellidos: userSession.apellidos,
        nombres: userSession.nombres,
        empresa: userSession.empresa,
        area: userSession.area,
        cargo: userSession.cargo,
        fechaIngreso: userSession.fechaIngreso,
        fechaNacimiento: userSession.fechaNacimiento,
        correo: userSession.correo,
        celular: userSession.celular,
        contacto1Numero: userSession.contacto1Numero,
        contacto1Parentesco: userSession.contacto1Parentesco,
        contacto2Numero: userSession.contacto2Numero,
        contacto2Parentesco: userSession.contacto2Parentesco,
        pdfBase64,
        signatureBase64: signatureData || undefined,
        selfieBase64: selfieData || undefined,
      });

      if (result.success) {
        setSavedUrls({ firmaUrl: result.firmaUrl, selfieUrl: result.selfieUrl });
        setStep('success');
      } else {
        throw new Error(result.message || 'Error al guardar la autorización');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al generar la constancia');
      setStep('selfie');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadLocal = () => {
    const element = consentRef.current;
    if (!element) return;
    const opt = {
      margin: 0,
      filename: `CONSENTIMIENTO_${userSession.dni}.pdf`,
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
        <div className="sticky top-0 z-20 glass-strong rounded-2xl px-4 pt-3 pb-1 mb-4 -mx-4 sm:mx-0">
          <div className="flex items-center justify-between mb-6">
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter truncate">Autorización de Firma</h2>
              <p className="text-slate-500 text-xs font-bold tracking-widest">REQUERIDO PARA CONTINUAR</p>
            </div>
            <button
              onClick={onLogout}
              className="w-10 h-10 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center hover:bg-slate-800 transition-colors flex-shrink-0"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {step !== 'success' && step !== 'generating' && <StepIndicator />}
        </div>

        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">{CONSENT_TITULO}</h3>
              </div>

              <div className="space-y-2.5 mb-5 max-h-[42vh] overflow-y-auto pr-1">
                {CONSENT_PARRAFOS.map((p, i) => (
                  <p key={i} className="text-slate-300 text-[11.5px] leading-relaxed text-justify">{p}</p>
                ))}
              </div>

              <button
                type="button"
                onClick={() => { setAccepted(a => !a); setError(null); }}
                className={`w-full flex items-start gap-3 border rounded-xl px-3.5 py-3 mb-5 text-left transition-all ${accepted ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}
              >
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 mt-0.5 transition-colors ${accepted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                  {accepted && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <p className="text-slate-200 text-[12px] font-semibold leading-snug">{CONSENT_CHECKBOX_LABEL}</p>
              </button>

              {error && <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mb-3"><AlertCircle className="w-3 h-3" /> {error}</p>}

              <button onClick={handleNext} disabled={!accepted}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-2 border-white/25 disabled:opacity-40 disabled:cursor-not-allowed">
                ACEPTAR Y CONTINUAR <ArrowRight className="w-4 h-4" />
              </button>
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
                <h3 className="text-lg font-bold text-white">Tu Firma Digital</h3>
              </div>
              <div ref={sigContainerRef} className="bg-white rounded-2xl overflow-hidden mb-4 border-2 border-slate-800" style={{ height: '200px' }}>
                <SignatureCanvas ref={sigCanvas} penColor="#000"
                  canvasProps={{ style: { width: '100%', height: '100%', cursor: 'crosshair', display: 'block' } }}
                  onBegin={() => { setHasDrawn(true); setError(null); }} onEnd={saveSig} />
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
                    {isUploading ? 'PROCESANDO...' : 'GENERAR CONSTANCIA'}
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
              <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Generando Constancia</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                Guardando tu firma y verificación en el sistema...
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
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">¡Autorización Registrada!</h3>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                Tu firma digital quedó guardada. Ya puedes continuar usando la plataforma.
              </p>

              <div className="space-y-3">
                <button onClick={() => onSuccess(savedUrls)} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-2 border-white/25">
                  CONTINUAR <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={downloadLocal} className="w-full py-4 bg-white text-slate-950 rounded-xl font-black text-xs tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl">
                  <Download className="w-5 h-5" /> DESCARGAR CONSTANCIA
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HIDDEN CONSENT TEMPLATE FOR PDF GENERATION */}
      <div className="fixed left-[-9999px] top-0 overflow-hidden" aria-hidden="true">
        <ConsentTemplate
          ref={consentRef}
          signer={signer}
          signatureData={signatureData}
          selfieData={selfieData}
          timestamp={timestamp || new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}
          dispositivo={dispositivo}
          appConfig={appConfig}
          logoSrc={logoSrc}
          folio={folio}
        />
      </div>
    </div>
  );
}
