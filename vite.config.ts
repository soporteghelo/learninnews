import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    apiExtractTextPlugin(), // Inyectamos el "servidor EXTRACTOR" aquí
  ],
  server: {
    port: 3000,
    open: true,
  },
})
