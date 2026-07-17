export const config = { runtime: 'edge' };

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractFileId(driveUrl) {
  const match = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                (/^[a-zA-Z0-9_-]{25,}$/.test(driveUrl) ? [null, driveUrl] : null);
  return match ? match[1] : null;
}

/**
 * Resuelve un ID de Drive al enlace directo del archivo (drive.usercontent.google.com).
 * Google no manda CORS de forma confiable cuando un <video> pide ese enlace
 * directamente (bloqueo por Sec-Fetch-Dest/ORB), así que en vez de exponer este
 * enlace al navegador, esta misma función lo usa server-side y reenvía los
 * bytes (ver `handler`), quedando todo en el mismo origen para el navegador.
 */
async function resolveDriveDirectUrl(fileId) {
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const first = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
  });

  const contentType = first.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    // Archivo pequeño: Drive ya sirvió el archivo directamente, sin página de aviso.
    await first.body?.cancel();
    return first.url;
  }

  const html = await first.text();
  if (html.includes('Google Drive - Quota exceeded')) {
    throw new Error('Cuota de descarga de Google excedida para este archivo.');
  }

  const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/) || html.match(/confirm=([^&"]+)/);
  if (!confirmMatch) {
    throw new Error('No se pudo resolver el enlace directo del video (verifica que sea público).');
  }
  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);

  const params = new URLSearchParams({ id: fileId, export: 'download', confirm: confirmMatch[1] });
  if (uuidMatch) params.set('uuid', uuidMatch[1]);
  return `https://drive.usercontent.google.com/download?${params.toString()}`;
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const driveUrl = searchParams.get('url') || '';

  if (!driveUrl) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro url' }), { status: 400 });
  }
  const fileId = extractFileId(driveUrl);
  if (!fileId) {
    return new Response(JSON.stringify({ error: 'No se pudo encontrar el ID en la URL de Drive.' }), { status: 400 });
  }

  try {
    const directUrl = await resolveDriveDirectUrl(fileId);

    const range = request.headers.get('range');
    const upstream = await fetch(directUrl, {
      headers: range ? { Range: range, 'User-Agent': USER_AGENT } : { 'User-Agent': USER_AGENT },
    });

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-store');
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Error resolviendo el video' }), { status: 500 });
  }
}
