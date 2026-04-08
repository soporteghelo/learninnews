import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Camera, PenTool, CheckCircle, Download, 
  Share2, ArrowRight, Loader2, AlertCircle, RefreshCw, Award
} from 'lucide-react';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import html2pdf from 'html2pdf.js';
import { saveCertificate } from '../services/sheetsService';
import type { UserSession, AppDynamicConfig, UserProgress, QuizQuestion } from '../types';
import CertificateTemplate from './CertificateTemplate';

interface CertificateClaimProps {
  userSession: UserSession;
  onBack: () => void;
  appConfig: AppDynamicConfig | null;
  onSuccess: (url: string) => void;
  progress?: UserProgress[];
  quizQuestions?: QuizQuestion[];
}

type Step = 'confirm' | 'signature' | 'selfie' | 'generating' | 'success';

export default function CertificateClaim({
  userSession,
  onBack,
  appConfig,
  onSuccess,
  progress = [],
  quizQuestions = [],
}: CertificateClaimProps) {
  const [step, setStep] = useState<Step>('confirm');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certUrl, setCertUrl] = useState<string | null>(null);

  // Data states
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [selfieData, setSelfieData] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string>('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [certificateLogoSrc, setCertificateLogoSrc] = useState('');
  const [certificateSignatureSrc, setCertificateSignatureSrc] = useState('');
  const [cargo, setCargo] = useState(userSession.cargo || '');
  const [celular, setCelular] = useState(userSession.celular || '');

  // Face detection states
  type FaceStatus = 'loading' | 'no_face' | 'too_close' | 'too_far' | 'off_center' | 'good';
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('loading');
  const [stabilityProgress, setStabilityProgress] = useState(0);

  // MediaPipe refs (CDN globals — typed as any)
  const faceDetectionRef = useRef<any>(null);
  const mediaCameraRef = useRef<any>(null);
  const stabilityStartRef = useRef<number | null>(null);

  // Refs
  const sigCanvas = useRef<SignatureCanvas>(null);
  const sigContainerRef = useRef<HTMLDivElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const certificateRef = useRef<HTMLDivElement>(null);

  // Resize canvas to match container pixel dimensions to fix coordinate offset
  useLayoutEffect(() => {
    if (step === 'signature' && sigContainerRef.current && sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      canvas.width = sigContainerRef.current.offsetWidth;
      canvas.height = sigContainerRef.current.offsetHeight;
    }
  }, [step]);

  // --- Handlers ---

  const handleNext = () => {
    if (step === 'confirm') {
      if (!cargo.trim() || !celular.trim()) {
        setError('Ingresa tu cargo y número de celular para el certificado');
        return;
      }
      setStep('signature');
      setError(null);
    } else if (step === 'signature') {
      if (!hasDrawn) {
        setError('Por favor, firma antes de continuar');
        return;
      }
      // Grab the data URL directly to avoid any state-timing issues
      const finalSig = sigCanvas.current?.getCanvas().toDataURL('image/png') ?? signatureData;
      setSignatureData(finalSig);
      setStep('selfie');
      setError(null);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setSignatureData(null);
    setHasDrawn(false);
  };

  const saveSig = () => {
    const data = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
    if (data) {
      setSignatureData(data);
      setHasDrawn(true);
    }
  };

  const cropAndSave = (imageSrc: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { setSelfieData(imageSrc); return; }
      const targetAspect = 3 / 4;
      const curAspect = img.width / img.height;
      let sw: number, sh: number, sx: number, sy: number;
      if (curAspect > targetAspect) {
        sh = img.height; sw = sh * targetAspect;
        sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = sw / targetAspect;
        sx = 0; sy = (img.height - sh) / 2;
      }
      canvas.width = 600; canvas.height = 800;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 600, 800);
      setSelfieData(canvas.toDataURL('image/jpeg', 0.95));
      setTimestamp(new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }));
    };
    img.src = imageSrc;
  };

  const normalizeCertificateAssetUrl = (rawUrl?: string | null) => {
    const url = String(rawUrl || '').trim();
    if (!url) return '';

    const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                    url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    
    if (idMatch?.[1]) {
      // Using lh3.googleusercontent.com/d/ID is generally more compatible with CORS and canvas
      return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }

    return url;
  };

  // Sync assets from config once
  useLayoutEffect(() => {
    if (appConfig) {
      setCertificateLogoSrc(normalizeCertificateAssetUrl(appConfig.logoCertificado));
      setCertificateSignatureSrc(normalizeCertificateAssetUrl(appConfig.firmaRepresentante));
    }
  }, [appConfig]);

  const waitForCertificateImages = async () => {
    const container = certificateRef.current;
    if (!container) return;

    const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    if (images.length === 0) return;

    // Add a safety timeout of 10 seconds total for all images
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout cargando imágenes del certificado')), 10000);
    });

    const loadPromise = Promise.all(images.map((img) => new Promise<void>((resolve, reject) => {
      // If it's a spacer or empty img, skip
      if (!img.src || img.src.includes('undefined') || img.src.includes('placeholder')) {
        resolve();
        return;
      }

      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }

      const cleanup = () => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error(`No se pudo cargar la imagen: ${img.alt || 'Branding/Logo'}`));
      };

      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
    })));

    try {
      await Promise.race([loadPromise, timeoutPromise]);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Error cargando recursos del certificado. Verifica tu conexión e inténtalo de nuevo.');
    }
  };

  useEffect(() => {
    setCertificateLogoSrc(normalizeCertificateAssetUrl(appConfig?.logoCertificado));
    setCertificateSignatureSrc(normalizeCertificateAssetUrl(appConfig?.firmaRepresentante));
  }, [appConfig]);

  // MediaPipe face detection — runs when on selfie step, stops when captured
  useEffect(() => {
    if (step !== 'selfie' || selfieData || !isCameraReady) return;

    setFaceStatus('loading');
    setStabilityProgress(0);
    stabilityStartRef.current = null;
    let isClosed = false;

    const STABILITY_MS = 3000;
    const PROXIMITY_MIN = 0.15;
    const PROXIMITY_MAX = 0.75;

    // Dynamically load MediaPipe scripts from CDN (packages are IIFE/window globals — not ESM)
    const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe';
    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const el = document.createElement('script');
        el.src = src;
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`Failed to load: ${src}`));
        document.head.appendChild(el);
      });

    Promise.all([
      loadScript(`${CDN}/camera_utils/camera_utils.js`),
      loadScript(`${CDN}/face_detection/face_detection.js`),
    ]).then(() => {
      if (isClosed) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      if (!W.FaceDetection || !W.Camera) {
        console.error('MediaPipe globals not found after script load');
        return;
      }

      const onResults = (results: { detections: Array<{ boundingBox: { width: number; xCenter: number; yCenter: number } }> }) => {
        if (isClosed) return;

        if (results.detections.length === 0) {
          setFaceStatus('no_face');
          setStabilityProgress(0);
          stabilityStartRef.current = null;
          return;
        }

        const { width, xCenter, yCenter } = results.detections[0].boundingBox;

        if (width < PROXIMITY_MIN) {
          setFaceStatus('too_far');
          setStabilityProgress(0); stabilityStartRef.current = null; return;
        }
        if (width > PROXIMITY_MAX) {
          setFaceStatus('too_close');
          setStabilityProgress(0); stabilityStartRef.current = null; return;
        }
        const centered = xCenter > 0.25 && xCenter < 0.75 && yCenter > 0.2 && yCenter < 0.8;
        if (!centered) {
          setFaceStatus('off_center');
          setStabilityProgress(0); stabilityStartRef.current = null; return;
        }

        // Face is good — run stability timer
        setFaceStatus('good');
        if (!stabilityStartRef.current) stabilityStartRef.current = Date.now();
        const elapsed = Date.now() - stabilityStartRef.current;
        const pct = Math.min((elapsed / STABILITY_MS) * 100, 100);
        setStabilityProgress(pct);

        if (pct >= 100) {
          isClosed = true;
          const imageSrc = webcamRef.current?.getScreenshot();
          if (imageSrc) {
            cropAndSave(imageSrc);
          }
          mediaCameraRef.current?.stop();
          stabilityStartRef.current = null;
          setStabilityProgress(0);
        }
      };

      const fd = new W.FaceDetection({
        locateFile: (file: string) => `${CDN}/face_detection/${file}`,
      });
      fd.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
      fd.onResults(onResults);
      faceDetectionRef.current = fd;

      const video = webcamRef.current?.video;
      if (!video) {
        setFaceStatus('loading');
        return;
      }

      const cam = new W.Camera(video, {
        onFrame: async () => {
          if (!isClosed && webcamRef.current?.video) {
            try { await fd.send({ image: webcamRef.current.video }); } catch { /* ignore */ }
          }
        },
        width: 640, height: 480,
      });
      cam.start().then(() => { if (!isClosed) setFaceStatus('no_face'); });
      mediaCameraRef.current = cam;
    }).catch((err) => {
      console.error('MediaPipe load error:', err);
      setFaceStatus('no_face');
    });

    return () => {
      isClosed = true;
      mediaCameraRef.current?.stop();
      faceDetectionRef.current?.close();
      faceDetectionRef.current = null;
      mediaCameraRef.current = null;
      stabilityStartRef.current = null;
      setStabilityProgress(0);
      setFaceStatus('loading');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selfieData, isCameraReady]);

  const generateAndUpload = async () => {
    setStep('generating');
    setError(null);

    try {
      const element = certificateRef.current;
      if (!element) throw new Error('No se encontró la plantilla del certificado');

      await waitForCertificateImages();

      // 1. Generate PDF as base64 for upload
      const opt = {
        margin: 0,
        filename: `CERTIFICADO_${userSession.dni}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false, 
          imageTimeout: 10000,
          allowTaint: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // @ts-ignore
      const worker = html2pdf().from(element).set(opt);
      const pdfBase64 = await worker.outputPdf('dataurlstring').then((dataUrl: string) => dataUrl.split(',')[1]);

      // 2. Upload to Drive
      setIsUploading(true);
      const result = await saveCertificate({
        dni: userSession.dni,
        apellidos: userSession.apellidos,
        nombres: userSession.nombres,
        pdfBase64: pdfBase64,
        signatureBase64: signatureData || undefined,
        selfieBase64: selfieData || undefined,
        cargo,
        celular,
        nota: (() => {
          const quizScores = progress.filter(p => p.quizScore !== undefined).map(p => p.quizScore!);
          const avg = quizScores.length > 0 ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : 0;
          return avg.toFixed(1);
        })()
      });

      if (result.success && result.url) {
        setCertUrl(result.url);
        setStep('success');
        onSuccess(result.url);
      } else {
        throw new Error(result.message || 'Error al subir a Google Drive');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al generar certificado');
      setStep('selfie'); // Go back to allow retry
    } finally {
      setIsUploading(false);
    }
  };

  const downloadLocal = () => {
    const element = certificateRef.current;
    if (!element) return;
    const opt = {
      margin: 0,
      filename: `CERTIFICADO_${userSession.dni}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    // @ts-ignore
    html2pdf().from(element).set(opt).save();
  };

  const shareViaWhatsApp = () => {
    if (!certUrl) return;
    const message = `Hola, aquí tienes mi certificado oficial de capacitación "ANEXO 04": ${certUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  // --- Sub-components (Views) ---

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {['confirm', 'signature', 'selfie', 'success'].map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            step === s ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 
            (['confirm', 'signature', 'selfie', 'success'].indexOf(step) > i ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500')
          }`}>
            {['confirm', 'signature', 'selfie', 'success'].indexOf(step) > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          {i < 3 && <div className={`w-8 h-px ${['confirm', 'signature', 'selfie', 'success'].indexOf(step) > i ? 'bg-emerald-500/30' : 'bg-slate-800'}`} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 safe-area-top safe-area-bottom overflow-y-auto">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Emisión de Certificado</h2>
            <p className="text-slate-500 text-xs font-bold tracking-widest">ANEXO 04 - VALIDACIÓN OFICIAL</p>
          </div>
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {step !== 'success' && <StepIndicator />}

        <AnimatePresence mode="wait">
          {step === 'confirm' && (
            <motion.div 
              key="confirm"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-8 border-white/5"
            >
              <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20 mx-auto">
                <CheckCircle className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-4">Verifica tus Datos</h3>
              <div className="space-y-4 mb-8">
                <div className="flex justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Nombre Completo</span>
                  <span className="text-white text-sm font-bold uppercase">{userSession.nombres} {userSession.apellidos}</span>
                </div>
                <div className="flex justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">DNI / ID</span>
                  <span className="text-white text-sm font-bold">{userSession.dni}</span>
                </div>
                
                <div className="space-y-4 pt-2">
                  <div className="relative group">
                    <label className="text-[10px] text-blue-400 font-bold uppercase tracking-widest pl-1 mb-1 block">Cargo / Puesto</label>
                    <input 
                      type="text"
                      placeholder="Ej. Operador de Equipo, Supervisor, etc."
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 text-sm font-bold focus:border-blue-500/50 transition-all outline-none"
                    />
                  </div>
                  <div className="relative group">
                    <label className="text-[10px] text-blue-400 font-bold uppercase tracking-widest pl-1 mb-1 block">Número de Celular</label>
                    <input 
                      type="text"
                      inputMode="tel"
                      placeholder="Ej. 987654321"
                      value={celular}
                      onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 text-sm font-bold focus:border-blue-500/50 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>
              <p className="text-slate-400 text-xs text-center leading-relaxed">
                Al continuar, certificas que tus datos son correctos para la emisión del documento oficial ante las autoridades correspondientes.
              </p>
              <button 
                onClick={handleNext}
                className="w-full mt-8 py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                CONFIRMAR Y CONTINUAR <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 'signature' && (
            <motion.div 
              key="signature"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5"
            >
              <div className="flex items-center gap-3 mb-6">
                <PenTool className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Firma del Participante</h3>
              </div>
              
              <div ref={sigContainerRef} className="bg-white rounded-2xl overflow-hidden mb-4 border-2 border-slate-800" style={{ height: '200px' }}>
                <SignatureCanvas 
                  ref={sigCanvas}
                  penColor="#000"
                  canvasProps={{ style: { width: '100%', height: '100%', cursor: 'crosshair', display: 'block' } }}
                  onBegin={() => { setHasDrawn(true); setError(null); }}
                  onEnd={saveSig}
                />
              </div>

              {error && <p className="text-red-400 text-[10px] font-bold mb-4 uppercase tracking-wider flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}

              <div className="flex gap-3">
                <button 
                  onClick={clearSignature}
                  className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-xl font-black text-[10px] tracking-widest border border-white/5 hover:text-white transition-all"
                >
                  LIMPIAR
                </button>
                <button 
                  onClick={handleNext}
                  className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-2 overflow-hidden"
                >
                  {signatureData ? 'CONFIRMAR FIRMA' : 'DIBUJA TU FIRMA'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'selfie' && (
            <motion.div 
              key="selfie"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-3xl p-6 border-white/5"
            >
              <div className="flex items-center gap-3 mb-4">
                <Camera className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Validación Biométrica</h3>
              </div>

              {!selfieData ? (
                <>
                  {/* Status bar */}
                  {(() => {
                    const cfg: Record<string, { color: string; bg: string; text: string }> = {
                      loading:    { color: 'text-slate-400',  bg: 'bg-slate-800/60',    text: '⏳ Iniciando cámara...' },
                      no_face:    { color: 'text-slate-300',  bg: 'bg-slate-800/60',    text: '👤 Coloca tu rostro en el óvalo' },
                      too_far:    { color: 'text-amber-400',  bg: 'bg-amber-500/10',    text: '🔍 Acércate más a la cámara' },
                      too_close:  { color: 'text-orange-400', bg: 'bg-orange-500/10',   text: '↔ Aléjate un poco de la cámara' },
                      off_center: { color: 'text-yellow-400', bg: 'bg-yellow-500/10',   text: '↕ Centra tu rostro en el óvalo' },
                      good:       { color: 'text-emerald-400', bg: 'bg-emerald-500/10', text: '✅ ¡Perfecto! Mantente quieto...' },
                    };
                    const c = cfg[faceStatus] ?? cfg.no_face;
                    return (
                      <p className={`text-center text-[11px] font-bold tracking-widest uppercase mb-3 px-3 py-2 rounded-lg ${c.color} ${c.bg}`}>
                        {c.text}
                      </p>
                    );
                  })()}

                  {/* Camera view */}
                  <div
                    className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-slate-900 mb-4"
                    style={{
                      border: `2px solid ${
                        faceStatus === 'good' ? '#10b981' :
                        faceStatus === 'too_close' || faceStatus === 'too_far' || faceStatus === 'off_center' ? '#f59e0b' :
                        '#1e293b'
                      }`,
                      transition: 'border-color 0.3s',
                    }}
                  >
                    <Webcam
                      key={cameraSessionKey}
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      onUserMedia={() => {
                        setIsCameraReady(true);
                        setFaceStatus('no_face');
                        setError(null);
                      }}
                      onUserMediaError={(mediaError) => {
                        console.error('Webcam error:', mediaError);
                        setIsCameraReady(false);
                        setError('No se pudo acceder a la cámara');
                      }}
                      className="w-full h-full object-cover"
                      videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                    />

                    {/* Oval mask + guide */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div style={{
                        width: '62%', height: '72%',
                        borderRadius: '50%',
                        border: `2.5px ${faceStatus === 'good' ? 'solid' : 'dashed'} ${
                          faceStatus === 'good' ? '#10b981' :
                          faceStatus === 'too_close' || faceStatus === 'too_far' || faceStatus === 'off_center' ? '#f59e0b' :
                          'rgba(255,255,255,0.4)'
                        }`,
                        transition: 'border-color 0.3s, border-style 0.3s',
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                      }} />
                    </div>

                    {/* Distance/position hint animation */}
                    {(faceStatus === 'too_far' || faceStatus === 'too_close' || faceStatus === 'off_center') && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <motion.div
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                          className="w-14 h-14 rounded-full bg-amber-500/80 flex items-center justify-center"
                        >
                          <span className="text-white text-2xl font-black">
                            {faceStatus === 'too_far' ? '🔍' : faceStatus === 'too_close' ? '↩' : '⊕'}
                          </span>
                        </motion.div>
                      </div>
                    )}

                    {/* Stability progress bar */}
                    {faceStatus === 'good' && stabilityProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900/60">
                        <motion.div
                          className="h-full bg-emerald-500"
                          animate={{ width: `${stabilityProgress}%` }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Retry / instructions */}
                  <button
                    onClick={() => {
                      mediaCameraRef.current?.stop();
                      faceDetectionRef.current?.close();
                      faceDetectionRef.current = null;
                      mediaCameraRef.current = null;
                      stabilityStartRef.current = null;
                      setIsCameraReady(false);
                      setCameraSessionKey((currentKey) => currentKey + 1);
                      setStabilityProgress(0);
                      setFaceStatus('loading');
                      // Setting selfieData to null triggers useEffect re-run
                      setSelfieData(null);
                    }}
                    className="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-black text-[10px] tracking-widest border border-white/5 flex items-center justify-center gap-2 hover:bg-slate-700 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> REINICIAR CÁMARA
                  </button>
                </>
              ) : (
                <>
                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 aspect-[3/4] bg-slate-900 mb-4">
                    <img src={selfieData} alt="Selfie" className="w-full h-full object-cover" />
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                      <span className="bg-emerald-500 text-black text-[9px] font-black px-3 py-1 rounded-full tracking-widest uppercase">CAPTURA EXITOSA</span>
                    </div>
                  </div>
                </>
              )}

              {error && <p className="text-red-400 text-[10px] font-bold mb-4 uppercase tracking-wider flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}

              {selfieData && (
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setSelfieData(null); setIsCameraReady(false); setCameraSessionKey((currentKey) => currentKey + 1); setFaceStatus('loading'); setStabilityProgress(0); setError(null); }}
                    className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-xl font-black text-[10px] tracking-widest border border-white/5 flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> REPETIR
                  </button>
                  <button 
                    onClick={generateAndUpload}
                    disabled={isUploading}
                    className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                    {isUploading ? 'PROCESANDO...' : 'GENERAR CERTIFICADO'}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {step === 'generating' && (
            <motion.div 
              key="generating"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass-card rounded-3xl p-12 border-white/5 text-center flex flex-col items-center"
            >
              <div className="relative w-24 h-24 mb-8">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-0 border-4 border-blue-500/20 rounded-full"
                />
                <motion.div 
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  className="absolute inset-2 border-4 border-t-blue-500 rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Award className="w-8 h-8 text-blue-400 animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Creando Documento</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                Estamos ensamblando tu certificado oficial "ANEXO 04" y sincronizándolo con los servidores de Google...
              </p>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-3xl p-8 border-emerald-500/20 text-center"
            >
              <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 mx-auto relative">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <motion.div 
                  initial={{ scale: 0 }} animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-emerald-500/20 rounded-full"
                />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">¡Emisión Exitosa!</h3>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                Tu certificado oficial ha sido generado correctamente y guardado en tu cuenta corporativa.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={downloadLocal}
                  className="w-full py-4 bg-white text-slate-950 rounded-xl font-black text-xs tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl"
                >
                  <Download className="w-5 h-5" /> DESCARGAR PDF
                </button>
                <button 
                  onClick={shareViaWhatsApp}
                  className="w-full py-4 bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 rounded-xl font-black text-xs tracking-widest hover:bg-[#25D366]/20 transition-all flex items-center justify-center gap-3"
                >
                  <Share2 className="w-5 h-5" /> COMPARTIR POR WHATSAPP
                </button>
                <button 
                  onClick={onBack}
                  className="w-full py-4 text-slate-500 font-bold text-[10px] tracking-widest uppercase hover:text-white transition-colors"
                >
                  VOLVER AL DASHBOARD
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HIDDEN CERTIFICATE TEMPLATE FOR PDF GENERATION */}
      <div className="fixed left-[-9999px] top-0 overflow-hidden" aria-hidden="true">
        <CertificateTemplate
          ref={certificateRef}
          userSession={userSession}
          appConfig={appConfig}
          cargo={cargo}
          celular={celular}
          signatureData={signatureData}
          selfieData={selfieData}
          timestamp={timestamp}
          progress={progress}
          quizQuestions={quizQuestions}
          certificateLogoSrc={certificateLogoSrc}
          certificateSignatureSrc={certificateSignatureSrc}
        />
      </div>
    </div>
  );
}
