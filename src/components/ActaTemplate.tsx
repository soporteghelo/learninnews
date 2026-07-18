import React, { useMemo } from 'react';
import type { AppDynamicConfig } from '../types';
import { interpolateActa, type ActaSignerData } from '../lib/actaInterpolate';
import { ACTA_DECLARACION, type GeneralActaDoc } from '../lib/actaAssignment';

// Vite raw import de la plantilla HTML (mismo patrón que el certificado)
// @ts-ignore
import actaBaseHtml from '../templates/acta.html?raw';

export { interpolateActa, type ActaSignerData };

interface ActaTemplateProps {
  /** Datos del trabajador que RECIBE (incluye fecha de ingreso para el acta). */
  signer: ActaSignerData & { fechaIngreso?: string };
  /** Documentos que se listan en la tabla "Documentos entregados". */
  documentos: GeneralActaDoc[];
  signatureData: string | null;
  selfieData: string | null;
  timestamp: string;      // fecha/hora Lima legible
  dispositivo: string;
  appConfig: AppDynamicConfig | null;
  logoSrc?: string;
  /** Firma del representante (quien ENTREGA), ya como data URL base64. */
  representanteFirmaSrc?: string;
  /** N° del acta (opcional; si no se pasa se imprime una línea en blanco). */
  numero?: string;
  /** Folio de verificación único del acta. */
  folio?: string;
  /** Ubicación de la firma (GPS) como "lat, long", si se pudo capturar. */
  geo?: string;
  /** Correo al que se remitió la copia del acta. */
  correo?: string;
}

const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Escapa texto plano para incrustarlo con seguridad en el HTML de la plantilla. */
function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reemplaza {{clave}} en la plantilla usando split/join (evita problemas con `$`). */
function fillTemplate(tpl: string, map: Record<string, string>): string {
  let out = tpl;
  for (const key of Object.keys(map)) {
    out = out.split(`{{${key}}}`).join(map[key]);
  }
  return out;
}

/** Reduce el user-agent completo a "Navegador / Sistema operativo" para que el pie de página quepa en una sola línea. */
function simplifyDevice(ua: string): string {
  if (!ua) return '';
  let browser = 'Navegador';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';
  return [browser, os].filter(Boolean).join(' / ');
}

/** Valor escapado, o una línea en blanco subrayada si está vacío. */
function blank(val: string | undefined, minWidth = '45px'): string {
  const v = String(val || '').trim();
  return v
    ? escapeHtml(v)
    : `<span style="display:inline-block;border-bottom:1px solid #9ca3af;min-width:${minWidth};">&nbsp;&nbsp;</span>`;
}

const ActaTemplate = React.forwardRef<HTMLDivElement, ActaTemplateProps>((props, ref) => {
  const { signer, documentos, signatureData, selfieData, timestamp, dispositivo, appConfig, logoSrc, representanteFirmaSrc, numero, folio, geo, correo } = props;

  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };

  const finalHtml = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear().toString();
    const dia = now.getDate();
    const mes = MESES[now.getMonth()];
    const currentDate = now.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nombreCompleto = `${signer.apellidos || ''} ${signer.nombres || ''}`.trim().toUpperCase();
    const logo = proxyUrl(logoSrc || appConfig?.logoCertificado) || 'https://via.placeholder.com/150x40?text=LOGO';

    // Párrafo de introducción con datos fijos (config) y fecha actual
    const introHtml =
      `En ${blank(appConfig?.lugar, '60px')}, a los ${dia} días del mes de ${mes} de ${year}, ` +
      `se deja constancia de la entrega y recepción de los documentos que se detallan a continuación, ` +
      `por parte de ${blank(appConfig?.contratista, '90px')}, ` +
      `al trabajador que suscribe la presente.`;

    // Filas de la tabla de documentos: solo los documentos reales (sin filas vacías)
    let docsRows = '';
    for (let i = 0; i < documentos.length; i++) {
      const d = documentos[i];
      const bg = i % 2 === 0 ? '#ffffff' : '#f7f9fd';
      const nombre = escapeHtml(d.nombre);
      const tipoTexto = d.tipo === 'virtual' ? 'Digital' : 'Físico';
      const tipoColor = d.tipo === 'virtual' ? '#0f7b3f' : '#8a5a00';
      docsRows +=
        `<tr style="background:${bg};">` +
        `<td style="padding:6px 6px;text-align:center;color:#1b4d89;font-weight:800;border-top:1px solid #e6edf8;">${i + 1}</td>` +
        `<td style="padding:6px 8px;color:#1f2937;font-weight:600;border-top:1px solid #e6edf8;">${nombre}</td>` +
        `<td style="padding:6px 6px;text-align:center;font-weight:800;letter-spacing:0.3px;color:${tipoColor};border-top:1px solid #e6edf8;">${tipoTexto}</td>` +
        `</tr>`;
    }

    return fillTemplate(actaBaseHtml, {
      acta_logo_src: logo,
      acta_numero: numero ? escapeHtml(numero) : `<span style="display:inline-block;border-bottom:1px solid #e8d5a3;min-width:40px;">&nbsp;</span>`,
      acta_year: year,
      intro_html: introHtml,
      declaracion: escapeHtml(ACTA_DECLARACION),
      w_nombre: blank(nombreCompleto, '120px'),
      w_dni: blank(signer.dni, '60px'),
      w_cargo: blank(signer.cargo, '90px'),
      w_area: blank(signer.area, '90px'),
      w_fecha_ingreso: blank(signer.fechaIngreso, '70px'),
      docs_rows: docsRows,
      entrega_firma_src: proxyUrl(representanteFirmaSrc || appConfig?.firmaRepresentante) || EMPTY_IMG,
      entrega_nombre: blank(appConfig?.nombreRepresentante, '110px'),
      entrega_cargo: blank(appConfig?.cargoRepresentante, '90px'),
      recibe_firma_src: signatureData || EMPTY_IMG,
      recibe_nombre: blank(nombreCompleto, '110px'),
      recibe_dni: blank(signer.dni, '55px'),
      selfie_src: selfieData || EMPTY_IMG,
      timestamp: escapeHtml(timestamp),
      current_date: currentDate,
      acta_folio: escapeHtml(folio || `AC-${signer.dni}`),
      geo_info: geo ? ` · Ubicación: ${escapeHtml(geo)}` : '',
      correo_info: escapeHtml(correo || 'no registrado'),
      device_info: dispositivo ? `Dispositivo: ${escapeHtml(simplifyDevice(dispositivo))}` : 'Registro almacenado en el sistema de gestión SST',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer, documentos, signatureData, selfieData, timestamp, dispositivo, appConfig, logoSrc, representanteFirmaSrc, numero, folio, geo, correo]);

  return (
    <div
      ref={ref}
      style={{ width: '210mm', background: '#ffffff' }}
      dangerouslySetInnerHTML={{ __html: finalHtml }}
    />
  );
});

ActaTemplate.displayName = 'ActaTemplate';

export default ActaTemplate;
