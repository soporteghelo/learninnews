import React, { useMemo } from 'react';
import type { AppDynamicConfig } from '../types';

export interface PacConstanciaData {
  programaNombre: string;
  tema: string;
  capacitador: string;
  fechaProgramada: string;
  intento: number;
  dni: string;
  apellidos: string;
  nombres: string;
  guardia: string;
  empresa: string;
  area: string;
  nota: number;
  aprobado: boolean;
  firmaData: string | null;
  selfieData: string | null;
}

interface PacConstanciaTemplateProps {
  data: PacConstanciaData;
  appConfig: AppDynamicConfig | null;
}

function esc(s: string | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Constancia de un intento de evaluación PAC (una por envío, apruebe o no):
 * identidad del trabajador, datos de la capacitación, nota/resultado, y
 * firma + selfie de verificación centradas en su celda.
 */
const PacConstanciaTemplate = React.forwardRef<HTMLDivElement, PacConstanciaTemplateProps>((props, ref) => {
  const { data, appConfig } = props;

  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };
  const logo = useMemo(() => proxyUrl(appConfig?.logoCertificado), [appConfig?.logoCertificado]);

  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} - (${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')})`;

  const cellStyle: React.CSSProperties = { border: '1px solid #1f2937', padding: '6px 10px', fontSize: '10px', verticalAlign: 'middle' };
  const labelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: '#f3f4f6' };

  return (
    <div ref={ref} style={{ width: '210mm', minHeight: '200mm', background: '#ffffff', padding: '12mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '20%', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={2}>
              {logo ? <img src={logo} alt="logo" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '50px' }} /> : null}
            </td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, fontSize: '13px' }} rowSpan={2}>
              CONSTANCIA DE EVALUACIÓN — PROGRAMA ANUAL DE CAPACITACIONES (PAC)
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '20%' }}>Apellidos y Nombres:</td>
            <td style={cellStyle} colSpan={3}>{esc(`${data.apellidos} ${data.nombres}`.trim())}</td>
          </tr>
          <tr>
            <td style={labelStyle}>DNI:</td>
            <td style={{ ...cellStyle, width: '30%' }}>{esc(data.dni)}</td>
            <td style={{ ...labelStyle, width: '20%' }}>Guardia:</td>
            <td style={cellStyle}>{esc(data.guardia)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Empresa:</td>
            <td style={cellStyle}>{esc(data.empresa)}</td>
            <td style={labelStyle}>Área:</td>
            <td style={cellStyle}>{esc(data.area)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '20%' }}>Capacitación:</td>
            <td style={cellStyle} colSpan={3}>{esc(data.programaNombre)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Tema:</td>
            <td style={{ ...cellStyle, width: '30%' }}>{esc(data.tema)}</td>
            <td style={{ ...labelStyle, width: '20%' }}>Capacitador:</td>
            <td style={cellStyle}>{esc(data.capacitador)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Fecha programada:</td>
            <td style={cellStyle}>{esc(data.fechaProgramada)}</td>
            <td style={labelStyle}>N° de intento:</td>
            <td style={cellStyle}>{data.intento}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '20%' }}>Nota obtenida:</td>
            <td style={{ ...cellStyle, fontWeight: 800, fontSize: '13px' }}>{data.nota.toFixed(1)} / 20</td>
            <td style={{ ...labelStyle, width: '20%' }}>Resultado:</td>
            <td style={{ ...cellStyle, fontWeight: 800, color: data.aprobado ? '#047857' : '#b91c1c' }}>
              {data.aprobado ? 'APROBADO' : 'NO APROBADO'}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '50%', textAlign: 'center' }}>Firma</td>
            <td style={{ ...labelStyle, width: '50%', textAlign: 'center' }}>Verificación fotográfica</td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, textAlign: 'center', height: '110px' }}>
              {data.firmaData
                ? <img src={data.firmaData} alt="firma" style={{ display: 'block', margin: '0 auto', maxWidth: '150px', maxHeight: '80px' }} />
                : ''}
            </td>
            <td style={{ ...cellStyle, textAlign: 'center' }}>
              {data.selfieData
                ? <img src={data.selfieData} alt="selfie" style={{ display: 'block', margin: '0 auto', width: '90px', height: '110px', objectFit: 'cover', borderRadius: '4px' }} />
                : ''}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ textAlign: 'center', fontSize: '8px', color: '#4b5563', marginTop: '10px' }}>
        Generado el {fecha}. Documento generado automáticamente por el sistema de gestión SST.
      </p>
    </div>
  );
});

PacConstanciaTemplate.displayName = 'PacConstanciaTemplate';

export default PacConstanciaTemplate;
