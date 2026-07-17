import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface DriveVideoPlayerProps {
  /** Link o ID original de Google Drive (compartido públicamente). */
  driveUrl: string;
  /** URL /preview de Drive, usada solo si el reproductor nativo falla. */
  fallbackEmbedUrl: string;
}

/**
 * Reproduce un video de Drive con el <video> nativo del navegador en vez del
 * iframe /preview de Drive: ese iframe infla sus propios controles (botón de
 * play y barra de progreso enormes) en pantallas angostas y no permite
 * arrastrar la barra correctamente. /api/drive-video resuelve el enlace
 * directo del archivo y reenvía los bytes (respetando Range) desde nuestro
 * propio origen — Google no manda CORS de forma confiable cuando un <video>
 * pide su enlace directamente. Si algo falla, cae de vuelta al iframe /preview.
 */
export default function DriveVideoPlayer({ driveUrl, fallbackEmbedUrl }: DriveVideoPlayerProps) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <video
        src={`/api/drive-video?url=${encodeURIComponent(driveUrl)}`}
        controls
        playsInline
        className="absolute inset-0 w-full h-full object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback: iframe /preview de Drive, acotado para no inflar sus controles en portrait
  if (fallbackEmbedUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full" style={{ height: 'min(100vh, 100vw)' }}>
          <iframe
            src={fallbackEmbedUrl}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
      <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
      <h3 className="text-xl font-bold text-white mb-2">No se pudo cargar el video</h3>
      <p className="text-slate-400 max-w-sm text-sm">Verifica tu conexión o que el archivo de Drive sea público.</p>
    </div>
  );
}
