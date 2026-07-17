/**
 * Descarga una imagen (típicamente de Google Drive) y la devuelve como data URL base64,
 * usando el proxy images.weserv.nl para evitar problemas de CORS con html2canvas.
 * Antes estaba duplicada en CertificateClaim y ActaSigning.
 */
export async function fetchDriveImageAsBase64(rawUrl?: string | null): Promise<string> {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                  url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const proxyUrl = idMatch?.[1]
    ? `https://images.weserv.nl/?url=lh3.googleusercontent.com/d/${idMatch[1]}`
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
