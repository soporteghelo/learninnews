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

// html2canvas (usado por html2pdf.js para generar el PDF) no respeta
// `vertical-align` en celdas de tabla: en el navegador se ve centrado, pero en
// el PDF exportado el texto queda pegado arriba. El workaround estándar es
// centrar con flexbox dentro de la celda en vez de vertical-align — así el PDF
// coincide con la vista previa. Se envuelve el contenido de cada <td>/<th> en
// este div en vez de confiar en el `verticalAlign` de cellStyle/labelStyle.
const vCenterStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' };

function Cell({ style, children, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td style={style} {...rest}>
      <div style={vCenterStyle}>{children}</div>
    </td>
  );
}

function HeadCell({ style, children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th style={style} {...rest}>
      <div style={vCenterStyle}>{children}</div>
    </th>
  );
}

// Filas totales de la tabla: si hay menos firmantes que esto, se completa con
// filas vacías (numeradas, con los bordes ya dibujados) para que la hoja se vea
// como un formulario A4 completo en vez de una tabla recortada al contenido.
// 28 es el máximo que cabe en una sola página A4 vertical incluso si TODAS las
// filas tuvieran firma+foto (las más altas); con menos filas llenas sobra margen.
const TOTAL_ROWS = 28;

// Código/Versión/Fecha del FORMATO en sí (Sistema Integrado de Gestión), fijos
// para todo documento — no confundir con el Código/Versión del documento que se
// distribuye (esos sí son dinámicos y se muestran más abajo, en "Identificación
// del documento").
const FORMATO_CODIGO = 'FPG-CL-SIG-06-05';
const FORMATO_VERSION = '00';
const FORMATO_FECHA = '10/3/2025';

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
            <Cell style={{ ...cellStyle, width: '18%', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={3}>
              {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '50px' }} /> : null}
            </Cell>
            <Cell style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, fontSize: '10px' }} rowSpan={3}>
              SISTEMA INTEGRADO DE GESTIÓN
              <div style={{ fontSize: '10.5px', marginTop: '4px' }}>LISTA MAESTRA DE DISTRIBUCIÓN DE DOCUMENTOS</div>
            </Cell>
            <Cell style={{ ...labelStyle, width: '10%' }}>Código:</Cell>
            <Cell style={{ ...cellStyle, width: '14%' }}>{FORMATO_CODIGO}</Cell>
          </tr>
          <tr>
            <Cell style={labelStyle}>Versión:</Cell>
            <Cell style={cellStyle}>{FORMATO_VERSION}</Cell>
          </tr>
          <tr>
            <Cell style={labelStyle}>Fecha de<br />Actualización:</Cell>
            <Cell style={cellStyle}>{FORMATO_FECHA}</Cell>
          </tr>
        </tbody>
      </table>

      {/* Identificación del documento */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <Cell style={labelStyle}>NOMBRE DEL DOCUMENTO:</Cell>
            <Cell style={cellStyle} colSpan={3}>{esc(documentoTitulo !== item.nombre ? `${item.nombre} (${documentoTitulo})` : item.nombre)}</Cell>
          </tr>
          <tr>
            <Cell style={labelStyle}>CÓDIGO:</Cell>
            <Cell style={cellStyle}>{esc(item.codigo)}</Cell>
            <Cell style={labelStyle}>VERSIÓN:</Cell>
            <Cell style={cellStyle}>{esc(item.version)}</Cell>
          </tr>
        </tbody>
      </table>

      {/* Tabla de distribución */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '4%' }} />
        </colgroup>
        <thead>
          <tr>
            {['N°', 'APELLIDOS Y NOMBRES', 'DNI', 'ÁREA', 'FECHA', 'FIRMA', 'FOTO', 'CERT.'].map((h) => (
              <HeadCell key={h} style={{ ...cellStyle, background: '#dbe3ef', fontWeight: 800, textAlign: 'center' }}>{h}</HeadCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.dni}>
              <Cell style={rowCellStyle}>{i + 1}</Cell>
              <Cell style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.nombre)}</Cell>
              <Cell style={rowCellStyle}>{esc(r.dni)}</Cell>
              <Cell style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.area)}</Cell>
              <Cell style={{ ...rowCellStyle, whiteSpace: 'nowrap' }}>{esc(r.firma?.fechaFirma)}</Cell>
              <Cell style={rowCellStyle}>
                {r.firmaBase64
                  ? <img src={r.firmaBase64} alt="firma" style={{ display: 'block', margin: '0 auto', maxWidth: '38px', maxHeight: '18px' }} />
                  : (r.firma ? '✓' : '')}
              </Cell>
              <Cell style={rowCellStyle}>
                {r.fotoBase64
                  ? <img src={r.fotoBase64} alt="foto" style={{ display: 'block', margin: '0 auto', width: '18px', height: '18px', objectFit: 'cover', borderRadius: '2px' }} />
                  : '—'}
              </Cell>
              <Cell style={rowCellStyle}>
                {r.firma?.actaPdfUrl
                  ? (
                    <a href={r.firma.actaPdfUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#1b4d89', display: 'flex', justifyContent: 'center' }} title="Ver certificado firmado">
                      <ExternalLink size={11} />
                    </a>
                  )
                  : '—'}
              </Cell>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

ActaDistribucionTemplate.displayName = 'ActaDistribucionTemplate';

export default ActaDistribucionTemplate;
