/** Extrae el fileId de una URL de Google Drive (varios formatos), o '' si no matchea. */
function extractDriveFileId(url: string): string {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
            url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] || '';
}

/**
 * URL de miniatura servible directo en un <img src> (sin descargar/proxear),
 * para listados con muchos avatares donde `fetchDriveImageAsBase64` sería
 * demasiado costoso. No hay problema de CORS aquí: un <img> normal puede
 * cargar cross-origin sin necesidad de proxy, a diferencia de html2canvas.
 */
export function driveThumbnailUrl(rawUrl?: string | null): string {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  const fileId = extractDriveFileId(url);
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=s96` : url;
}

/**
 * Descarga una imagen (típicamente de Google Drive) y la devuelve como data URL base64,
 * usando el proxy images.weserv.nl para evitar problemas de CORS con html2canvas.
 * Antes estaba duplicada en CertificateClaim y ActaSigning.
 */
export async function fetchDriveImageAsBase64(rawUrl?: string | null): Promise<string> {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  const fileId = extractDriveFileId(url);
  // weserv necesita el esquema (https://) en la URL de origen: sin él, su fetch
  // upstream falla con 400/404 y la imagen nunca llega (firma/foto quedan vacías
  // en los PDFs generados, sin ningún error visible ya que el catch de abajo
  // devuelve '').
  const proxyUrl = fileId
    ? `https://images.weserv.nl/?url=${encodeURIComponent(`https://lh3.googleusercontent.com/d/${fileId}`)}`
    : `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}
