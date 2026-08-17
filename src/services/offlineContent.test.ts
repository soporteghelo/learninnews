/**
 * Regresión: al quedarse sin internet, el contenido ya descargado debe seguir
 * disponible. Antes, una lectura fallida devolvía los datos de demostración
 * (MOCK_DATA_CONFIG) y el polling de 30s los pintaba encima de la lección que el
 * trabajador estaba leyendo, borrándole el curso de la pantalla.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DataChunk, LearnTopic } from '../types';

// localStorage no existe en el entorno `node` de vitest.
function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  return store;
}

const CHUNK_REAL: DataChunk = {
  cod: 'REAL-1',
  idMain: 'T1',
  tema: 'Trabajos en altura',
  contenido: 'Contenido real descargado antes de perder la señal.',
  videos: [],
  comentarioVideo: '',
  pdf: '',
  contexto: 'Normativo',
  order: 1,
};

const TOPIC_REAL: LearnTopic = {
  id: 'T1',
  title: 'Trabajos en altura',
  audience: 'Obrero',
  details: '',
  summary: '',
  keyPoints: [],
  order: 1,
  active: true,
};

/** Guarda un respaldo con fecha vieja (fuera de los TTL fresh y stale). */
function seedCache(key: string, data: unknown, ageMs: number) {
  localStorage.setItem(`ldc_cache_${key}`, JSON.stringify({ data, ts: Date.now() - ageMs }));
}

const UNA_SEMANA = 7 * 24 * 60 * 60 * 1000;

describe('contenido disponible sin internet', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installLocalStorage();
    vi.resetModules();
    // Simula estar sin conexión: cualquier petición falla.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
  });

  it('devuelve las lecciones guardadas aunque el respaldo tenga días de antigüedad', async () => {
    seedCache('chunks', [CHUNK_REAL], UNA_SEMANA);
    const { fetchDataChunks } = await import('./sheetsService');

    const chunks = await fetchDataChunks(true); // force=true: igual que el polling de 30s

    expect(chunks).toHaveLength(1);
    expect(chunks[0].cod).toBe('REAL-1');
    expect(chunks[0].contenido).toContain('Contenido real');
  });

  it('devuelve los temas guardados en vez de los datos de demostración', async () => {
    seedCache('topics', [TOPIC_REAL], UNA_SEMANA);
    const { fetchLearnTopics } = await import('./sheetsService');

    const topics = await fetchLearnTopics(true);

    expect(topics.map(t => t.title)).toEqual(['Trabajos en altura']);
    // El bug original: el curso real quedaba reemplazado por el catálogo de demostración.
    expect(topics.map(t => t.title)).not.toContain('Seguridad en el Trabajo');
  });

  it('mantiene la configuración de la app (marca, soporte, módulo de actas)', async () => {
    seedCache('config', {
      title: 'Capacitaciones AESA',
      message: 'Bienvenido',
      contact: '999888777',
      adminPass: 'secreto',
      status: 'Activo',
      actasHabilitado: false,
    }, UNA_SEMANA);
    const { fetchAppDynamicConfig } = await import('./sheetsService');

    const config = await fetchAppDynamicConfig();

    expect(config.title).toBe('Capacitaciones AESA');
    expect(config.contact).toBe('999888777');
    expect(config.actasHabilitado).toBe(false);
  });

  it('recién ahí cae a los datos de demostración: dispositivo que nunca descargó nada', async () => {
    const { fetchDataChunks } = await import('./sheetsService');

    const chunks = await fetchDataChunks(true);

    // Sin respaldo no hay nada mejor que ofrecer, pero tampoco debe romperse.
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].cod).toBe('C1');
  });

  it('no borra el respaldo cuando la respuesta llega vacía con la señal cayéndose', async () => {
    seedCache('chunks', [CHUNK_REAL], 60 * 1000);
    // 200 OK pero cuerpo vacío: típico de un portal cautivo o una descarga truncada.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    }));
    const { fetchDataChunks } = await import('./sheetsService');

    const chunks = await fetchDataChunks(true);

    expect(chunks[0].cod).toBe('REAL-1');
    // Y el respaldo sigue intacto para la próxima lectura.
    const backup = JSON.parse(store.get('ldc_cache_chunks')!);
    expect(backup.data[0].cod).toBe('REAL-1');
  });
});
