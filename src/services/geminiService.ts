import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG, ADMIN_CONFIG } from '../config/app.config';
import type { DataChunk, QuizQuestion } from '../types';

// Helper: call Gemini with automatic retry on 429
async function callGemini(prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: AI_CONFIG.apiKey });
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: AI_CONFIG.model,
        contents: prompt,
        config: {
          temperature: AI_CONFIG.temperature,
          maxOutputTokens: AI_CONFIG.maxTokens,
        },
      });
      return response.text || '';
    } catch (error: any) {
      const msg = error?.message || error?.toString() || '';
      // Check for rate limit (429 / RESOURCE_EXHAUSTED)
      if ((msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) && attempt < maxRetries - 1) {
        const waitSec = Math.pow(2, attempt + 1) * 10; // 20s, 40s
        console.warn(`Rate limit hit, retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      // Parse and throw clean error
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(`Cuota de Gemini agotada. Espera 1-2 minutos e intenta de nuevo. Modelo: ${AI_CONFIG.model}`);
      }
      if (msg.includes('404') || msg.includes('NOT_FOUND')) {
        throw new Error(`Modelo "${AI_CONFIG.model}" no encontrado. Verifica que el modelo exista y sea compatible.`);
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        throw new Error('API Key de Gemini sin permisos. Verifica la clave en Google AI Studio.');
      }
      if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
        throw new Error('Solicitud inválida a Gemini. El prompt puede ser demasiado largo.');
      }
      throw new Error(`Error de Gemini: ${msg.substring(0, 200)}`);
    }
  }
  throw new Error('Se agotaron los reintentos. Intenta de nuevo en unos minutos.');
}

/**
 * Genera preguntas de quiz usando Gemini AI.
 * SOLO se usa desde el AdminPanel.
 */
export async function generateQuizFromChunks(
  chunks: DataChunk[],
  courseTitle: string,
  courseId: string
): Promise<QuizQuestion[]> {
  if (!AI_CONFIG.apiKey) {
    throw new Error('API Key de Gemini no configurada. Define VITE_GEMINI_API_KEY en .env');
  }

  const contenidoConcatenado = chunks
    .map((c) => `## ${c.tema}\n${c.contenido}`)
    .join('\n\n');

  const count = ADMIN_CONFIG.quiz_generation_count;

  const prompt = `Eres un experto en evaluación educativa corporativa.
Basado en el siguiente contenido del curso "${courseTitle}",
genera ${count} preguntas de opción múltiple.

Contenido del curso:
"""
${contenidoConcatenado}
"""

Para cada pregunta genera:
- pregunta: texto claro y directo
- opcionA, opcionB, opcionC, opcionD: 4 opciones (solo 1 correcta)
- respuestaCorrecta: letra "A", "B", "C" o "D"
- explicacion: por qué esa es la respuesta correcta (1-2 oraciones)
- dificultad: "Fácil", "Media" o "Difícil"

Reglas:
- Las preguntas deben evaluar COMPRENSIÓN, no memorización textual
- Las opciones incorrectas deben ser plausibles y no obviamente falsas
- Distribuye la dificultad: ~30% Fácil, ~50% Media, ~20% Difícil
- Adapta el lenguaje al contexto laboral/industrial
- Responde SOLO en formato JSON válido con la estructura:
{
  "questions": [
    {
      "pregunta": "...",
      "opcionA": "...",
      "opcionB": "...",
      "opcionC": "...",
      "opcionD": "...",
      "respuestaCorrecta": "A",
      "explicacion": "...",
      "dificultad": "Media"
    }
  ]
}`;

  const text = await callGemini(prompt);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No se encontró JSON válido en la respuesta de IA');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const questions: QuizQuestion[] = (parsed.questions || []).map(
    (q: any, index: number) => ({
      idQuiz: `Q${Date.now()}-${index + 1}`,
      idMain: courseId,
      question: q.pregunta || '',
      optionA: q.opcionA || '',
      optionB: q.opcionB || '',
      optionC: q.opcionC || '',
      optionD: q.opcionD || '',
      correctAnswer: (q.respuestaCorrecta || 'A') as 'A' | 'B' | 'C' | 'D',
      explanation: q.explicacion || '',
      difficulty: (q.dificultad || 'Media') as 'Fácil' | 'Media' | 'Difícil',
    })
  );

  return questions;
}

/**
 * Genera un plan de estudio con secciones de contenido educativo.
 * Trabaja por lotes (batches) para respetar límites de tokens.
 */
export async function generateStudyPlan(
  existingChunks: DataChunk[],
  courseTitle: string,
  courseId: string,
  courseDetails: string,
  batchIndex: number,
  sectionsPerBatch: number
): Promise<{ chunks: DataChunk[]; hasMore: boolean; totalSections: number }> {
  if (!AI_CONFIG.apiKey) {
    throw new Error('API Key de Gemini no configurada. Define VITE_GEMINI_API_KEY en .env');
  }

  const existingTopics = existingChunks.map(c => c.tema).join(', ');
  const startSection = batchIndex * sectionsPerBatch + 1;

  const prompt = `Eres un experto en diseño instruccional corporativo.

Curso: "${courseTitle}"
Descripción: "${courseDetails}"
${existingTopics ? `Temas YA existentes (NO los repitas): ${existingTopics}` : ''}

Genera exactamente ${sectionsPerBatch} secciones de contenido educativo NUEVAS para este curso.
Las secciones deben empezar desde el número ${startSection}.

Para cada sección genera:
- tema: título descriptivo de la sección (claro, conciso)
- contenido: texto educativo completo en formato Markdown. Incluye:
  - Explicación clara del concepto
  - Listas con puntos clave (usar -)
  - Texto en **negrita** para conceptos importantes  
  - Párrafos bien estructurados
  - Mínimo 3-4 párrafos por sección
- contexto: una categoría entre "Teórico", "Práctico", "Normativo", "Caso Real" o "Procedimiento"

Reglas:
- El contenido debe ser COMPLETO y educativo, no superficial
- Adapta el lenguaje al contexto laboral/industrial
- Cada sección debe ser independiente pero coherente con el curso
- Incluye datos concretos, no genéricos
- Indica si hay más temas por cubrir con el campo "hayMas" (true/false)
- Indica el total estimado de secciones que necesitaría el curso con "totalSecciones"

Responde SOLO en JSON válido:
{
  "secciones": [
    {
      "tema": "...",
      "contenido": "...",
      "contexto": "Teórico"
    }
  ],
  "hayMas": true,
  "totalSecciones": 8
}`;

  const text = await callGemini(prompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No se encontró JSON válido en la respuesta de IA');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const chunks: DataChunk[] = (parsed.secciones || []).map(
    (s: any, index: number) => ({
      cod: `GEN-${courseId}-${startSection + index}`,
      idMain: courseId,
      tema: s.tema || '',
      contenido: s.contenido || '',
      contexto: s.contexto || 'Teórico',
      order: existingChunks.length + index + 1,
    })
  );

  return {
    chunks,
    hasMore: parsed.hayMas === true,
    totalSections: parsed.totalSecciones || 0,
  };
}

/**
 * Test de conexión a Gemini API
 */
export async function testGeminiConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!AI_CONFIG.apiKey) {
    return { ok: false, error: 'API Key no configurada (VITE_GEMINI_API_KEY)' };
  }
  try {
    const text = await callGemini('Responde solo "ok"');
    if (text) return { ok: true };
    return { ok: false, error: 'Sin respuesta del modelo' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
