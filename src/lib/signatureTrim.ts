/**
 * Recorta una firma (data URL) a la caja que ocupa el trazo. Las firmas se guardan
 * con el lienzo completo del celular (mucho espacio vacío alrededor), así que al
 * meterlas en una casilla de formulario de ~8 mm el trazo queda diminuto; recortada,
 * la firma llena la casilla y se lee al imprimir.
 *
 * Considera "tinta" a los píxeles visibles y oscuros, así funciona tanto con PNG
 * transparente como con fondo blanco. Si algo falla devuelve la imagen original.
 */
export async function trimSignature(dataUrl: string, padding = 6): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 20 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 200) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return dataUrl; // sin trazo: se deja como vino
    minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
    maxX = Math.min(w - 1, maxX + padding); maxY = Math.min(h - 1, maxY + padding);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1; out.height = maxY - minY + 1;
    out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}
