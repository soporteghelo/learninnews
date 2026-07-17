import { useState, useRef, useEffect } from 'react';
import type Webcam from 'react-webcam';

/**
 * Hook de captura facial reutilizable (MediaPipe FaceDetection + react-webcam).
 * Encapsula la lógica antes duplicada en CertificateClaim y ActaSigning:
 *  - carga dinámica de los scripts de MediaPipe (globals de window)
 *  - detección de proximidad/centrado del rostro con temporizador de estabilidad (3s)
 *  - captura y recorte 3:4 de la selfie
 *  - ciclo de vida de la cámara (start/stop/cleanup) y reinicio
 *
 * Uso: `const face = useFaceCapture(step === 'selfie');` y enlazar `face.webcamRef`
 * al componente <Webcam>. El consumidor decide cuándo generar el resultado usando
 * `face.selfieData`.
 */

export type FaceStatus = 'loading' | 'no_face' | 'too_close' | 'too_far' | 'off_center' | 'good';

const STABILITY_MS = 3000;
const PROXIMITY_MIN = 0.15;
const PROXIMITY_MAX = 0.75;
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src;
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(el);
  });
}

export function useFaceCapture(enabled: boolean) {
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('loading');
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [selfieData, setSelfieData] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [timestamp, setTimestamp] = useState('');

  const webcamRef = useRef<Webcam>(null);
  // MediaPipe globals cargados por CDN — sin tipos disponibles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceDetectionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mediaCameraRef = useRef<any>(null);
  const stabilityStartRef = useRef<number | null>(null);

  const cropAndSave = (imageSrc: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { setSelfieData(imageSrc); return; }
      const targetAspect = 3 / 4;
      const curAspect = img.width / img.height;
      let sw: number, sh: number, sx: number, sy: number;
      if (curAspect > targetAspect) { sh = img.height; sw = sh * targetAspect; sx = (img.width - sw) / 2; sy = 0; }
      else { sw = img.width; sh = sw / targetAspect; sx = 0; sy = (img.height - sh) / 2; }
      canvas.width = 600; canvas.height = 800;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 600, 800);
      setSelfieData(canvas.toDataURL('image/jpeg', 0.95));
      setTimestamp(new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }));
    };
    img.src = imageSrc;
  };

  // Detección facial mientras `enabled` y sin selfie capturada
  useEffect(() => {
    if (!enabled || selfieData || !isCameraReady) return;

    // Reset intencional del estado al (re)entrar al paso de captura
    /* eslint-disable react-hooks/set-state-in-effect */
    setFaceStatus('loading');
    setStabilityProgress(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    stabilityStartRef.current = null;
    let isClosed = false;

    Promise.all([
      loadScript(`${CDN}/camera_utils/camera_utils.js`),
      loadScript(`${CDN}/face_detection/face_detection.js`),
    ]).then(() => {
      if (isClosed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      if (!W.FaceDetection || !W.Camera) { console.error('MediaPipe globals not found'); return; }

      const onResults = (results: { detections: Array<{ boundingBox: { width: number; xCenter: number; yCenter: number } }> }) => {
        if (isClosed) return;
        if (results.detections.length === 0) {
          setFaceStatus('no_face'); setStabilityProgress(0); stabilityStartRef.current = null; return;
        }
        const { width, xCenter, yCenter } = results.detections[0].boundingBox;
        if (width < PROXIMITY_MIN) { setFaceStatus('too_far'); setStabilityProgress(0); stabilityStartRef.current = null; return; }
        if (width > PROXIMITY_MAX) { setFaceStatus('too_close'); setStabilityProgress(0); stabilityStartRef.current = null; return; }
        const centered = xCenter > 0.25 && xCenter < 0.75 && yCenter > 0.2 && yCenter < 0.8;
        if (!centered) { setFaceStatus('off_center'); setStabilityProgress(0); stabilityStartRef.current = null; return; }

        setFaceStatus('good');
        if (!stabilityStartRef.current) stabilityStartRef.current = Date.now();
        const elapsed = Date.now() - stabilityStartRef.current;
        const pct = Math.min((elapsed / STABILITY_MS) * 100, 100);
        setStabilityProgress(pct);
        if (pct >= 100) {
          isClosed = true;
          const imageSrc = webcamRef.current?.getScreenshot();
          if (imageSrc) cropAndSave(imageSrc);
          mediaCameraRef.current?.stop();
          stabilityStartRef.current = null;
          setStabilityProgress(0);
        }
      };

      const fd = new W.FaceDetection({ locateFile: (file: string) => `${CDN}/face_detection/${file}` });
      fd.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
      fd.onResults(onResults);
      faceDetectionRef.current = fd;

      const video = webcamRef.current?.video;
      if (!video) { setFaceStatus('loading'); return; }

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
    }).catch((err) => { console.error('MediaPipe load error:', err); setFaceStatus('no_face'); });

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
  }, [enabled, selfieData, isCameraReady]);

  /** Vuelve a tomar la selfie (botón "Repetir"). */
  const resetSelfie = () => {
    setSelfieData(null);
    setIsCameraReady(false);
    setCameraSessionKey((k) => k + 1);
    setFaceStatus('loading');
    setStabilityProgress(0);
  };

  /** Reinicia por completo la cámara (botón "Reiniciar cámara"). */
  const restartCamera = () => {
    mediaCameraRef.current?.stop();
    faceDetectionRef.current?.close();
    faceDetectionRef.current = null;
    mediaCameraRef.current = null;
    stabilityStartRef.current = null;
    setIsCameraReady(false);
    setCameraSessionKey((k) => k + 1);
    setStabilityProgress(0);
    setFaceStatus('loading');
    setSelfieData(null);
  };

  /** Handler para onUserMedia del <Webcam>. */
  const onCameraReady = () => {
    setIsCameraReady(true);
    setFaceStatus('no_face');
  };

  return {
    faceStatus,
    stabilityProgress,
    selfieData,
    setSelfieData,
    isCameraReady,
    setIsCameraReady,
    cameraSessionKey,
    timestamp,
    webcamRef,
    resetSelfie,
    restartCamera,
    onCameraReady,
  };
}
