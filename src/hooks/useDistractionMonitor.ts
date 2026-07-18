import { useCallback, useEffect, useRef, useState } from 'react';
import type Webcam from 'react-webcam';
import { releaseVideoStream, loadScript } from '../lib/utils';
import type { DistractionReason } from '../types';

/**
 * Monitorea distracciones durante una evaluación calificada combinando dos señales:
 *  - Page Visibility API: cambio de pestaña/app (instantáneo, sin falsos positivos).
 *  - MediaPipe FaceDetection: ausencia de rostro o rostro descentrado sostenido. Mientras
 *    dura ese estado pero aún no se cumple `CAMERA_DEBOUNCE_MS`, se expone `isLookingAway`
 *    para mostrar un aviso temprano y no bloqueante (el usuario puede corregir a tiempo).
 * Cada distracción detectada dispara un aviso de `WARNING_DURATION_MS`; al llegar a
 * `maxDistractions` se notifica a través de `onLimitReached` y el contador se reinicia.
 *
 * A diferencia de `useFaceCapture` (captura una selfie y detiene la cámara), este hook
 * corre de forma continua durante toda la evaluación, por lo que throttlea el envío de
 * frames a MediaPipe para no consumir CPU de forma constante.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe';
const CAMERA_DEBOUNCE_MS = 5000;
const WARNING_DURATION_MS = 5000;
const DETECTION_THROTTLE_MS = 700;
const DEFAULT_MAX_DISTRACTIONS = 5;
// Tras corregir la mirada, el aviso temprano se mantiene visible este tiempo extra
// en vez de desaparecer de inmediato, para que el usuario alcance a notarlo.
const LOOK_AWAY_LINGER_MS = 3000;

interface UseDistractionMonitorOptions {
  enabled: boolean;
  onLimitReached: () => void;
  maxDistractions?: number;
  // Permite restaurar el conteo de una sesión previa (p.ej. al retomar un cuestionario
  // guardado) para que salir y volver a entrar no reinicie las distracciones acumuladas.
  initialCount?: number;
}

export function useDistractionMonitor({
  enabled,
  onLimitReached,
  maxDistractions = DEFAULT_MAX_DISTRACTIONS,
  initialCount = 0,
}: UseDistractionMonitorOptions) {
  const [distractionCount, setDistractionCount] = useState(initialCount);
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [warningReason, setWarningReason] = useState<DistractionReason | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [hasCameraError, setHasCameraError] = useState(false);
  // Aviso temprano y no bloqueante: la cámara ya detectó que no mira la pantalla,
  // pero todavía no se cumple el debounce de `CAMERA_DEBOUNCE_MS` para contarlo.
  const [isLookingAway, setIsLookingAway] = useState(false);
  // Segundos restantes (redondeados) antes de que `isLookingAway` se convierta en distracción contada.
  const [lookAwaySecondsLeft, setLookAwaySecondsLeft] = useState(0);

  const webcamRef = useRef<Webcam>(null);
  // MediaPipe globals cargados por CDN — sin tipos disponibles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceDetectionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mediaCameraRef = useRef<any>(null);
  const badStartRef = useRef<number | null>(null);
  const cameraArmedRef = useRef(false);
  const visibilityArmedRef = useRef(false);
  const lastSentRef = useRef(0);
  const warningTimeoutRef = useRef<number | null>(null);
  const lookAwayHideTimeoutRef = useRef<number | null>(null);

  // Evita que el aviso reinicie un cuestionario que ya terminó (carrera entre el
  // temporizador de 5s del aviso y el usuario navegando fuera de la pantalla activa).
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Se lee siempre el callback más reciente sin forzar que los efectos de cámara/
  // visibilidad (costosos de reiniciar) dependan de una función que cambia cada render.
  const onLimitReachedRef = useRef(onLimitReached);
  useEffect(() => { onLimitReachedRef.current = onLimitReached; }, [onLimitReached]);

  const registerDistraction = useCallback((reason: DistractionReason) => {
    if (warningTimeoutRef.current !== null) return; // ya hay un aviso visible
    setWarningReason(reason);
    setIsWarningVisible(true);
    setDistractionCount((prev) => {
      const next = prev + 1;
      warningTimeoutRef.current = window.setTimeout(() => {
        warningTimeoutRef.current = null;
        setIsWarningVisible(false);
        setWarningReason(null);
        if (next >= maxDistractions && enabledRef.current) {
          setDistractionCount(0);
          cameraArmedRef.current = false;
          visibilityArmedRef.current = false;
          badStartRef.current = null;
          onLimitReachedRef.current();
        }
      }, WARNING_DURATION_MS);
      return next;
    });
  }, [maxDistractions]);

  // Limpia el aviso pendiente si el hook se desmonta antes de que se cumplan los 5s.
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current !== null) {
        window.clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
    };
  }, []);

  // Cuenta regresiva en vivo del aviso temprano, derivada de `badStartRef` (no de un
  // temporizador independiente) para que nunca se desincronice del debounce real.
  useEffect(() => {
    if (!isLookingAway) return; // sin cuenta regresiva que mostrar; no se renderiza el chip
    const tick = () => {
      if (badStartRef.current === null) { setLookAwaySecondsLeft(0); return; }
      const remainingMs = CAMERA_DEBOUNCE_MS - (Date.now() - badStartRef.current);
      setLookAwaySecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    };
    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [isLookingAway]);

  // Señal 1: cambio de pestaña/app.
  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      if (document.hidden) {
        if (!visibilityArmedRef.current) {
          visibilityArmedRef.current = true;
          registerDistraction('visibility');
        }
      } else {
        visibilityArmedRef.current = false;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, registerDistraction]);

  // Señal 2: ausencia/descentrado de rostro sostenido (MediaPipe FaceDetection).
  useEffect(() => {
    if (!enabled || !isCameraReady) return;

    let isClosed = false;
    const videoEl = webcamRef.current?.video ?? null;
    badStartRef.current = null;
    cameraArmedRef.current = false;
    lastSentRef.current = 0;

    Promise.all([
      loadScript(`${CDN}/camera_utils/camera_utils.js`),
      loadScript(`${CDN}/face_detection/face_detection.js`),
    ]).then(() => {
      if (isClosed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      if (!W.FaceDetection || !W.Camera) { console.error('MediaPipe globals not found'); return; }

      const onResults = (results: { detections: Array<{ boundingBox: { xCenter: number; yCenter: number } }> }) => {
        if (isClosed || document.hidden) return; // un cambio de pestaña ya cuenta aparte

        const hasFace = results.detections.length > 0;
        const centered = hasFace && (() => {
          const { xCenter, yCenter } = results.detections[0].boundingBox;
          return xCenter > 0.25 && xCenter < 0.75 && yCenter > 0.2 && yCenter < 0.8;
        })();

        if (hasFace && centered) {
          badStartRef.current = null;
          cameraArmedRef.current = false;
          // No oculta el aviso de inmediato: da unos segundos más para que se note,
          // salvo que ya haya un cierre programado (evita reprogramarlo en cada tick).
          if (lookAwayHideTimeoutRef.current === null) {
            lookAwayHideTimeoutRef.current = window.setTimeout(() => {
              lookAwayHideTimeoutRef.current = null;
              setIsLookingAway(false);
            }, LOOK_AWAY_LINGER_MS);
          }
          return;
        }

        // Sigue (o volvió a) distraerse antes de que se ocultara el aviso: cancela el cierre.
        if (lookAwayHideTimeoutRef.current !== null) {
          window.clearTimeout(lookAwayHideTimeoutRef.current);
          lookAwayHideTimeoutRef.current = null;
        }

        if (badStartRef.current === null) {
          badStartRef.current = Date.now();
          setIsLookingAway(true);
          return;
        }
        if (cameraArmedRef.current) return; // ya se contó esta excursión

        if (Date.now() - badStartRef.current >= CAMERA_DEBOUNCE_MS) {
          cameraArmedRef.current = true;
          setIsLookingAway(false);
          registerDistraction('camera');
        }
      };

      const fd = new W.FaceDetection({ locateFile: (file: string) => `${CDN}/face_detection/${file}` });
      fd.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
      fd.onResults(onResults);
      faceDetectionRef.current = fd;

      if (!videoEl) return;

      const cam = new W.Camera(videoEl, {
        onFrame: async () => {
          if (isClosed || !webcamRef.current?.video) return;
          const now = Date.now();
          if (now - lastSentRef.current < DETECTION_THROTTLE_MS) return;
          lastSentRef.current = now;
          try { await fd.send({ image: webcamRef.current.video }); } catch { /* ignore */ }
        },
        width: 320, height: 240,
      });
      cam.start();
      mediaCameraRef.current = cam;
    }).catch((err) => console.error('MediaPipe load error:', err));

    return () => {
      isClosed = true;
      mediaCameraRef.current?.stop();
      releaseVideoStream(videoEl);
      faceDetectionRef.current?.close();
      faceDetectionRef.current = null;
      mediaCameraRef.current = null;
      badStartRef.current = null;
      cameraArmedRef.current = false;
      if (lookAwayHideTimeoutRef.current !== null) {
        window.clearTimeout(lookAwayHideTimeoutRef.current);
        lookAwayHideTimeoutRef.current = null;
      }
      setIsLookingAway(false);
    };
  }, [enabled, isCameraReady, registerDistraction]);

  const handleUserMedia = () => {
    setIsCameraReady(true);
    setHasCameraError(false);
  };

  const handleUserMediaError = () => {
    setIsCameraReady(false);
    setHasCameraError(true);
  };

  return {
    webcamRef,
    distractionCount,
    setDistractionCount,
    isWarningVisible,
    warningReason,
    isLookingAway,
    lookAwaySecondsLeft,
    hasCameraError,
    handleUserMedia,
    handleUserMediaError,
  };
}
