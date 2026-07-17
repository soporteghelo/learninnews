import React, { useMemo } from 'react';
import type { ActaItem, AppDynamicConfig } from '../types';
import type { FirmaRosterRow } from '../lib/firmaRoster';

export interface DistribucionRow extends FirmaRosterRow {
  fotoBase64?: string;
  firmaBase64?: string;
}

interface ActaDistribucionTemplateProps {
  item: ActaItem;
  documentoTitulo: string;
  rows: DistribucionRow[];
  appConfig: AppDynamicConfig | null;
}

/** Escapa texto plano para incrustarlo con seguridad en celdas HTML. */
function esc(s: string | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * "Lista Maestra de Distribución de Documentos" — replica el formato físico
 * usado por el cliente (logo + cajas Código/Versión/Fecha + tabla de firmantes),
 * agregando una columna Foto con la selfie de verificación de cada firma.
 */
const ActaDistribucionTemplate = React.forwardRef<HTMLDivElement, ActaDistribucionTemplateProps>((props, ref) => {
  const { item, documentoTitulo, rows, appConfig } = props;

  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };

  const logo = useMemo(() => proxyUrl(appConfig?.logoCertificado), [appConfig?.logoCertificado]);

  const cellStyle: React.CSSProperties = { border: '1px solid #1f2937', padding: '4px 8px', fontSize: '10px' };
  const labelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: '#f3f4f6', whiteSpace: 'nowrap' };

  return (
    <div ref={ref} style={{ width: '297mm', background: '#ffffff', padding: '10mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827' }}>
      {/* Encabezado: logo + título del sistema + cajas Código/Versión/Fecha */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '18%', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={2}>
              {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '50px' }} /> : null}
            </td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, fontSize: '12px' }} rowSpan={2}>
              SISTEMA INTEGRADO DE GESTIÓN
              <div style={{ fontSize: '13px', marginTop: '4px' }}>LISTA MAESTRA DE DISTRIBUCIÓN DE DOCUMENTOS</div>
            </td>
            <td style={{ ...labelStyle, width: '10%' }}>Código:</td>
            <td style={{ ...cellStyle, width: '14%' }}>{esc(item.codigo)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Versión:</td>
            <td style={cellStyle}>{esc(item.version)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Fecha de Actualización:</td>
            <td style={cellStyle} colSpan={3}>{esc(item.fechaVersion)}</td>
          </tr>
        </tbody>
      </table>

      {/* Identificación del documento */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={labelStyle}>NOMBRE DEL DOCUMENTO:</td>
            <td style={cellStyle} colSpan={3}>{esc(documentoTitulo !== item.nombre ? `${item.nombre} (${documentoTitulo})` : item.nombre)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>CÓDIGO:</td>
            <td style={cellStyle}>{esc(item.codigo)}</td>
            <td style={labelStyle}>VERSIÓN:</td>
            <td style={cellStyle}>{esc(item.version)}</td>
          </tr>
        </tbody>
      </table>

      {/* Tabla de distribución */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['N°', 'APELLIDOS Y NOMBRES', 'DNI', 'ÁREA', 'CANTIDAD', 'FECHA', 'FIRMA', 'FOTO'].map((h) => (
              <th key={h} style={{ ...cellStyle, background: '#dbe3ef', fontWeight: 800, textAlign: 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.dni}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
              <td style={cellStyle}>{esc(r.nombre)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{esc(r.dni)}</td>
              <td style={cellStyle}>{esc(r.area)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>1</td>
              <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{esc(r.firma?.fechaFirma)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                {r.firmaBase64
                  ? <img src={r.firmaBase64} alt="firma" style={{ maxWidth: '70px', maxHeight: '28px' }} />
                  : (r.firma ? '✓' : '')}
              </td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                {r.fotoBase64
                  ? <img src={r.fotoBase64} alt="foto" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '3px' }} />
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

ActaDistribucionTemplate.displayName = 'ActaDistribucionTemplate';

export default ActaDistribucionTemplate;
