/**
 * Interpolación de variables en el cuerpo (HTML) de un acta/compromiso.
 * Compartido por ActaTemplate (render/PDF) y ActaSigning (preview).
 */

export interface ActaSignerData {
  nombres: string;
  apellidos: string;
  dni: string;
  cargo?: string;
  area?: string;
  empresa?: string;
}

/** Reemplaza {variable} en la plantilla con los datos del firmante y la fecha. */
export function interpolateActa(body: string, signer: ActaSignerData, fecha: string): string {
  const nombreCompleto = `${signer.nombres || ''} ${signer.apellidos || ''}`.trim();
  const map: Record<string, string> = {
    nombres: signer.nombres || '',
    apellidos: signer.apellidos || '',
    nombreCompleto,
    nombre_completo: nombreCompleto,
    dni: signer.dni || '',
    cargo: signer.cargo || '',
    area: signer.area || '',
    empresa: signer.empresa || '',
    fecha,
  };
  return (body || '').replace(/\{(\w+)\}/g, (m, key) => (map[key] !== undefined ? map[key] : m));
}
