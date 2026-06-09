import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export default async function handler(req, res) {
  // CORS settings for any request
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let driveUrl = null;
    
    // Parse json manually just in case req.body is string on Vercel
    if (typeof req.body === 'string') {
      try { driveUrl = JSON.parse(req.body).driveUrl; } catch(e){}
    } else if (req.body && req.body.driveUrl) {
      driveUrl = req.body.driveUrl;
    }
    
    if (!driveUrl) {
      return res.status(400).json({ error: 'Drive URL is required' });
    }

    const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;

    console.log('[Vercel Extractor] Procesando URL:', driveUrl);
    console.log('[Vercel Extractor] ID extraído:', fileId);

    if (!fileId) {
      return res.status(400).json({ error: 'No se pudo encontrar el ID en la URL de Drive.' });
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    let response = await axios.get(downloadUrl, { 
      responseType: 'arraybuffer',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      }
    });

    if (response.headers['content-type']?.includes('text/html')) {
      const html = Buffer.from(response.data).toString();
      const confirmMatch = html.match(/confirm=([^&"]+)/);
      if (confirmMatch) {
         response = await axios.get(`${downloadUrl}&confirm=${confirmMatch[1]}`, { responseType: 'arraybuffer' });
      } else if (html.includes('Google Drive - Quota exceeded')) {
         throw new Error('Cuota de descarga de Google excedida para este archivo.');
      }
    }

    const buffer = Buffer.from(response.data);
    if (buffer.toString('utf8', 0, 4) !== '%PDF') {
       throw new Error('El archivo descargado no parece ser un PDF válido.');
    }

    const data = await pdf(buffer);

    const cleanText = (text) => {
      if (!text) return "";
      let cleaned = text.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ]) ([a-zA-ZáéíóúÁÉÍÓÚñÑ])(?= [a-zA-ZáéíóúÁÉÍÓÚñÑ]|$)/g, '$1$2');
      cleaned = cleaned.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ]) ([a-zA-ZáéíóúÁÉÍÓÚñÑ])(?= [a-zA-ZáéíóúÁÉÍÓÚñÑ]|$)/g, '$1$2');
      cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
      return cleaned.split('\n').map(l => l.trim()).join('\n').trim();
    };

    const result = cleanText(data.text);
    if (result.length < 5) throw new Error('El PDF no contiene texto legible.');

    return res.status(200).json({ 
      text: result,
      numpages: data.numpages 
    });

  } catch (error) {
    console.error('[Vercel Extractor] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Error interno en la extracción' });
  }
}
