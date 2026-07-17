import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import axios from 'axios'
import { IncomingMessage, ServerResponse } from 'http'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')

// Plugin local para emular el servidor de "EXTRACTOR"
const apiExtractTextPlugin = () => ({
  name: 'api-extract-text',
  configureServer(server: any) {
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.url === '/api/extract-text' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { driveUrl } = JSON.parse(body);
            if (!driveUrl) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Drive URL is required' }));
            }

            // Regex mejorado: coincide con /d/ID (con o sin slash final) o id=ID
            const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            const fileId = match ? match[1] : null;

            console.log('[Extractor] Procesando URL:', driveUrl);
            console.log('[Extractor] ID extraído:', fileId);

            if (!fileId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'No se pudo encontrar el ID en la URL de Drive.' }));
            }

            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            
            // Intento de descarga inicial
            let response = await axios.get(downloadUrl, { 
              responseType: 'arraybuffer',
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
              }
            });

            console.log('[Extractor] Status descarga:', response.status);
            console.log('[Extractor] Content-Type:', response.headers['content-type']);

            // Manejar confirmación de virus (si el archivo es grande)
            if (response.headers['content-type']?.includes('text/html')) {
              const html = response.data.toString();
              const confirmMatch = html.match(/confirm=([^&"]+)/);
              if (confirmMatch) {
                console.log('[Extractor] Bypass de confirmación detectado.');
                response = await axios.get(`${downloadUrl}&confirm=${confirmMatch[1]}`, { responseType: 'arraybuffer' });
              } else if (html.includes('Google Drive - Quota exceeded')) {
                throw new Error('Cuota de descarga de Google excedida para este archivo.');
              }
            }

            const buffer = Buffer.from(response.data);
            
            // Validar que realmente sea un PDF
            if (buffer.toString('utf8', 0, 4) !== '%PDF') {
               throw new Error('El archivo descargado no parece ser un PDF válido.');
            }

            const data = await pdf(buffer);
            console.log('[Extractor] Texto extraído con éxito:', data.text.substring(0, 50) + '...');

            // Limpieza (Lógica idéntica del servidor EXTRACTOR)
            const cleanText = (text: string) => {
              if (!text) return "";
              let cleaned = text.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ]) ([a-zA-ZáéíóúÁÉÍÓÚñÑ])(?= [a-zA-ZáéíóúÁÉÍÓÚñÑ]|$)/g, '$1$2');
              cleaned = cleaned.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ]) ([a-zA-ZáéíóúÁÉÍÓÚñÑ])(?= [a-zA-ZáéíóúÁÉÍÓÚñÑ]|$)/g, '$1$2');
              cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
              return cleaned.split('\n').map((l: string) => l.trim()).join('\n').trim();
            };

            const result = cleanText(data.text);
            if (result.length < 5) throw new Error('El PDF no contiene texto legible.');

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              text: result,
              numpages: data.numpages 
            }));

          } catch (error: any) {
            console.error('[Extractor] Error Crítico:', error.message);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message || 'Error interno en la extracción' }));
          }
        });
      } else {
        next();
      }
    });
  }
});

// Plugin local para emular /api/drive-video: resuelve un ID de Drive al enlace
// directo del archivo y reenvía los bytes (respetando Range) al navegador desde
// nuestro propio origen. Google no manda CORS de forma confiable cuando un
// <video> pide ese enlace directamente (bloqueo por Sec-Fetch-Dest/ORB), por
// eso el proxy hace el fetch server-side y solo reenvía la respuesta.
const apiDriveVideoPlugin = () => ({
  name: 'api-drive-video',
  configureServer(server: any) {
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (!req.url?.startsWith('/api/drive-video')) return next();

      const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      try {
        const reqUrl = new URL(req.url, 'http://localhost');
        const driveUrl = reqUrl.searchParams.get('url') || '';
        if (!driveUrl) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Falta el parámetro url' }));
        }

        const match = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                      driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                      driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                      (/^[a-zA-Z0-9_-]{25,}$/.test(driveUrl) ? [null, driveUrl] : null);
        const fileId = match ? match[1] : null;
        if (!fileId) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'No se pudo encontrar el ID en la URL de Drive.' }));
        }

        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        const first = await axios.get(downloadUrl, {
          headers: { 'User-Agent': USER_AGENT },
          maxRedirects: 5,
          responseType: 'stream',
        });

        const contentType = first.headers['content-type'] || '';
        const responseUrl = first.request?.res?.responseUrl || downloadUrl;

        let directUrl: string;
        if (!contentType.includes('text/html')) {
          first.data.destroy();
          directUrl = responseUrl;
        } else {
          let html = '';
          for await (const chunk of first.data) {
            html += chunk.toString();
            if (html.length > 50000) break;
          }
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
          directUrl = `https://drive.usercontent.google.com/download?${params.toString()}`;
        }

        const range = req.headers.range;
        const upstream = await axios.get(directUrl, {
          headers: { 'User-Agent': USER_AGENT, ...(range ? { Range: range } : {}) },
          responseType: 'stream',
          validateStatus: () => true,
        });

        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
        if (upstream.headers['content-range']) res.setHeader('Content-Range', upstream.headers['content-range']);
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        upstream.data.pipe(res);
      } catch (error: any) {
        console.error('[DriveVideo] Error:', error.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message || 'Error resolviendo el video' }));
      }
    });
  }
});

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    apiExtractTextPlugin(), // Inyectamos el "servidor EXTRACTOR" aquí
    apiDriveVideoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LearnDrive AI — Capacitaciones SST',
        short_name: 'LearnDrive',
        description: 'Plataforma de capacitación corporativa: cursos, evaluaciones, certificados y actas.',
        theme_color: '#00366b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Contenido de Google Sheets (LEARN/DATA/QUIZ/…): funciona offline con lo último visto
            urlPattern: /^https:\/\/docs\.google\.com\/spreadsheets\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sheets-data',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imágenes proxied (logos/firmas) vía weserv
            urlPattern: /^https:\/\/images\.weserv\.nl\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'proxied-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
})
