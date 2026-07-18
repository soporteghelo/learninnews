/**
 * El `Camera` de MediaPipe adquiere su propio MediaStream vía getUserMedia y lo
 * asigna a `video.srcObject` — su `stop()` solo pausa el <video>, no libera las
 * pistas. Sin esto, cada reintento de cámara deja un stream abierto en el sistema
 * (el indicador de cámara del navegador no se apaga).
 */
export function releaseVideoStream(video: HTMLVideoElement | null | undefined) {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  if (video) video.srcObject = null;
}

export function loadScript(src: string): Promise<void> {
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

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^---+$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
    .replace(/^\s*#{1,6}\s+(.*)/gm, '. $1. ')
    .replace(/^\s*[-*+]\s+/gm, '. ')
    .replace(/^\s*\d+\.\s+/gm, '. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/>\s?/g, '')
    .replace(/→/g, ', luego ')
    .replace(/\|/g, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
