import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
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

// Filas totales de la tabla: si hay menos firmantes que esto, se completa con
// filas vacías (numeradas, con los bordes ya dibujados) para que la hoja se vea
// como un formulario A4 completo en vez de una tabla recortada al contenido.
// 28 es el máximo que cabe en una sola página A4 vertical incluso si TODAS las
// filas tuvieran firma+foto (las más altas); con menos filas llenas sobra margen.
const TOTAL_ROWS = 28;

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

  const cellStyle: React.CSSProperties = { border: '1px solid #1f2937', padding: '3px 5px', fontSize: '9px', verticalAlign: 'middle' };
  const labelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: '#f3f4f6', whiteSpace: 'nowrap' };
  const rowCellStyle: React.CSSProperties = { ...cellStyle, fontSize: '7.5px', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle' };

  const emptyRowsCount = Math.max(0, TOTAL_ROWS - rows.length);

  return (
    <div ref={ref} style={{ width: '210mm', minHeight: '280mm', background: '#ffffff', padding: '10mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827' }}>
      {/* Encabezado: logo + título del sistema + cajas Código/Versión/Fecha */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '18%', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={2}>
              {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '50px' }} /> : null}
            </td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, fontSize: '10px' }} rowSpan={2}>
              SISTEMA INTEGRADO DE GESTIÓN
              <div style={{ fontSize: '10.5px', marginTop: '4px' }}>LISTA MAESTRA DE DISTRIBUCIÓN DE DOCUMENTOS</div>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '4%' }} />
        </colgroup>
        <thead>
          <tr>
            {['N°', 'APELLIDOS Y NOMBRES', 'DNI', 'ÁREA', 'CANTIDAD', 'FECHA', 'FIRMA', 'FOTO', 'CERT.'].map((h) => (
              <th key={h} style={{ ...cellStyle, background: '#dbe3ef', fontWeight: 800, textAlign: 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.dni}>
              <td style={rowCellStyle}>{i + 1}</td>
              <td style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.nombre)}</td>
              <td style={rowCellStyle}>{esc(r.dni)}</td>
              <td style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.area)}</td>
              <td style={rowCellStyle}>1</td>
              <td style={{ ...rowCellStyle, whiteSpace: 'nowrap' }}>{esc(r.firma?.fechaFirma)}</td>
              <td style={rowCellStyle}>
                {r.firmaBase64
                  ? <img src={r.firmaBase64} alt="firma" style={{ display: 'block', margin: '0 auto', maxWidth: '38px', maxHeight: '18px' }} />
                  : (r.firma ? '✓' : '')}
              </td>
              <td style={rowCellStyle}>
                {r.fotoBase64
                  ? <img src={r.fotoBase64} alt="foto" style={{ display: 'block', margin: '0 auto', width: '18px', height: '18px', objectFit: 'cover', borderRadius: '2px' }} />
                  : '—'}
              </td>
              <td style={rowCellStyle}>
                {r.firma?.actaPdfUrl
                  ? (
                    <a href={r.firma.actaPdfUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#1b4d89', display: 'flex', justifyContent: 'center' }} title="Ver certificado firmado">
                      <ExternalLink size={11} />
                    </a>
                  )
                  : '—'}
              </td>
            </tr>
          ))}
          {Array.from({ length: emptyRowsCount }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td style={rowCellStyle}>{rows.length + i + 1}</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
              <td style={rowCellStyle}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

ActaDistribucionTemplate.displayName = 'ActaDistribucionTemplate';

export default ActaDistribucionTemplate;
