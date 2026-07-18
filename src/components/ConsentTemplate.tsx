import React, { useMemo } from 'react';
import type { AppDynamicConfig } from '../types';
import { CONSENT_PARRAFOS, CONSENT_CHECKBOX_LABEL } from '../lib/consentText';

// Vite raw import de la plantilla HTML (mismo patrón que certificado/acta)
// @ts-ignore
import consentBaseHtml from '../templates/consentimiento.html?raw';

export interface ConsentSignerData {
  nombres: string;
  apellidos: string;
  dni: string;
  cargo?: string;
  area?: string;
  empresa?: string;
}

interface ConsentTemplateProps {
  signer: ConsentSignerData;
  signatureData: string | null;
  selfieData: string | null;
  timestamp: string;      // fecha/hora Lima legible
  dispositivo: string;
  appConfig: AppDynamicConfig | null;
  logoSrc?: string;
  /** Folio de verificación único de la constancia. */
  folio?: string;
}

const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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

/** Reduce el user-agent completo a "Navegador / Sistema operativo". */
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

const ConsentTemplate = React.forwardRef<HTMLDivElement, ConsentTemplateProps>((props, ref) => {
  const { signer, signatureData, selfieData, timestamp, dispositivo, appConfig, logoSrc, folio } = props;

  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };

  const finalHtml = useMemo(() => {
    const now = new Date();
    const currentDate = now.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nombreCompleto = `${signer.apellidos || ''} ${signer.nombres || ''}`.trim().toUpperCase();
    const logo = proxyUrl(logoSrc || appConfig?.logoCertificado) || 'https://via.placeholder.com/150x40?text=LOGO';
    const areaEmpresa = [signer.area, signer.empresa].filter(Boolean).join(' · ');

    const parrafosHtml = CONSENT_PARRAFOS
      .map(p => `<p style="font-size:9.5pt;line-height:1.6;text-align:justify;margin:0 0 2.5mm;color:#1f2937;">${escapeHtml(p)}</p>`)
      .join('');

    return fillTemplate(consentBaseHtml, {
      logo_src: logo,
      w_nombre: blank(nombreCompleto, '120px'),
      w_dni: blank(signer.dni, '60px'),
      w_cargo: blank(signer.cargo, '90px'),
      w_area: blank(areaEmpresa, '90px'),
      parrafos_html: parrafosHtml,
      checkbox_label: escapeHtml(CONSENT_CHECKBOX_LABEL),
      firma_src: signatureData || EMPTY_IMG,
      selfie_src: selfieData || EMPTY_IMG,
      timestamp: escapeHtml(timestamp),
      current_date: currentDate,
      folio: escapeHtml(folio || `CONS-${signer.dni}`),
      device_info: dispositivo ? `Dispositivo: ${escapeHtml(simplifyDevice(dispositivo))}` : 'Registro almacenado en el sistema de gestión SST',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer, signatureData, selfieData, timestamp, dispositivo, appConfig, logoSrc, folio]);

  return (
    <div
      ref={ref}
      style={{ width: '210mm', background: '#ffffff' }}
      dangerouslySetInnerHTML={{ __html: finalHtml }}
    />
  );
});

ConsentTemplate.displayName = 'ConsentTemplate';

export default ConsentTemplate;
