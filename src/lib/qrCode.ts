/**
 * Generación de códigos QR como data URL (PNG base64).
 *
 * Se usa un data URL en vez de un servicio externo para que:
 *   - El QR se renderice dentro del PDF (html2canvas/html2pdf) sin problemas de CORS/taint.
 *   - Funcione 100% offline (PWA).
 *
 * El QR codifica el enlace de Drive del documento recepcionado y se incrusta tanto en el
 * panel de administración (al asignar/listar documentos) como en el acta de entrega (PDF).
 */
import QRCode from 'qrcode';

export interface QrOptions {
  /** Ancho del QR en px (PNG). Default 240. */
  size?: number;
  /** Margen (quiet zone) en módulos. Default 1. */
  margin?: number;
  /** Color de los módulos. Default azul corporativo. */
  dark?: string;
  /** Color de fondo. Default blanco. */
  light?: string;
}

/**
 * Devuelve el QR de `value` como data URL PNG, o cadena vacía si no hay valor o falla.
 */
export async function generateQrDataUrl(value: string | null | undefined, opts: QrOptions = {}): Promise<string> {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: opts.margin ?? 1,
      width: opts.size ?? 240,
      color: {
        dark: opts.dark ?? '#0f2d6b',
        light: opts.light ?? '#ffffff',
      },
    });
  } catch {
    return '';
  }
}
