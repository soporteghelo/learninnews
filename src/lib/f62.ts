import type { AppDynamicConfig, PacPrograma } from '../types';

/** Una fila del registro: un participante que rindió la evaluación PAC. */
export interface PacF62Row {
  dni: string;
  nombre: string;        // apellidos y nombres
  ocupacion: string;
  area: string;
  observacion: string;   // p.ej. "Nota 16.0 - Aprobado"
  firmaBase64?: string;
}

export type F62Tipo = 'induccion' | 'capacitacion' | 'entrenamiento' | 'simulacro';

/** Campos del formato que llena el admin; el resto (la asistencia) sale de las evaluaciones. */
export interface F62Editable {
  tipos: Record<F62Tipo, boolean>;
  tema: string[];            // 4 líneas del bloque "10 TEMA"
  fecha: string;
  capacitador: string;
  horas: string;
  responsableNombre: string;
  responsableCargo: string;
  responsableFecha: string;
  incluirFirmaResponsable: boolean;
  referencia: string;        // texto al pie, p.ej. "CERRO LINDO//32001337//BOND//2025"
}

// 20 filas por hoja, como el formato impreso original
export const F62_ROWS_PER_PAGE = 20;

export const fechaDdMmYyyy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

/** Valores iniciales de los campos editables, tomados de la capacitación y de la configuración. */
export function defaultF62Editable(programa: PacPrograma, appConfig: AppDynamicConfig | null): F62Editable {
  const tema = [programa.nombre, programa.tema, programa.descripcion]
    .map(s => String(s || '').trim())
    .filter((s, i, arr) => s && arr.findIndex(x => x.toLowerCase() === s.toLowerCase()) === i);
  while (tema.length < 4) tema.push('');
  const hoy = new Date();
  return {
    tipos: { induccion: false, capacitacion: true, entrenamiento: false, simulacro: false },
    tema: tema.slice(0, 4),
    fecha: fechaDdMmYyyy(programa.fechaProgramada),
    capacitador: programa.capacitador || '',
    horas: '',
    responsableNombre: appConfig?.nombreRepresentante || '',
    responsableCargo: appConfig?.cargoRepresentante || '',
    responsableFecha: `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
    incluirFirmaResponsable: !!appConfig?.firmaRepresentante,
    referencia: '',
  };
}
