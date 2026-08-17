import React, { useMemo } from 'react';
import type { AppDynamicConfig, PacPrograma } from '../types';

export interface PacAsistenciaRow {
  dni: string;
  nombre: string;
  empresa: string;
  area: string;
  guardia: string;
  nota: number | null;
  aprobado: boolean;
  firmaBase64?: string;
  fotoBase64?: string;
}

interface PacAsistenciaTemplateProps {
  programa: PacPrograma;
  rows: PacAsistenciaRow[];
  appConfig: AppDynamicConfig | null;
}

function esc(s: string | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 24 filas caben en una sola página A4 vertical incluso con firma+foto en todas.
const TOTAL_ROWS = 24;

/** "Acta de Asistentes" del PAC: roster de un programa con nota, resultado, firma y foto de cada intento. */
const PacAsistenciaTemplate = React.forwardRef<HTMLDivElement, PacAsistenciaTemplateProps>((props, ref) => {
  const { programa, rows, appConfig } = props;

  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };
  const logo = useMemo(() => proxyUrl(appConfig?.logoCertificado), [appConfig?.logoCertificado]);

  const cellStyle: React.CSSProperties = { border: '1px solid #1f2937', padding: '3px 5px', fontSize: '8.5px', verticalAlign: 'middle' };
  const labelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: '#f3f4f6' };
  const rowCellStyle: React.CSSProperties = { ...cellStyle, fontSize: '7.5px', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle' };

  const emptyRowsCount = Math.max(0, TOTAL_ROWS - rows.length);

  return (
    <div ref={ref} style={{ width: '210mm', minHeight: '280mm', background: '#ffffff', padding: '10mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '18%', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={2}>
              {logo ? <img src={logo} alt="logo" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '50px' }} /> : null}
            </td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, fontSize: '10px' }} rowSpan={2}>
              PROGRAMA ANUAL DE CAPACITACIONES (PAC)
              <div style={{ fontSize: '10.5px', marginTop: '4px' }}>ACTA DE ASISTENTES</div>
            </td>
            <td style={{ ...labelStyle, width: '18%' }}>Capacitación:</td>
            <td style={cellStyle}>{esc(programa.nombre)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Fecha programada:</td>
            <td style={cellStyle}>{esc(programa.fechaProgramada)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Tema:</td>
            <td style={cellStyle} colSpan={3}>{esc(programa.tema)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Capacitador:</td>
            <td style={cellStyle} colSpan={3}>{esc(programa.capacitador)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '21%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead>
          <tr>
            {['N°', 'APELLIDOS Y NOMBRES', 'DNI', 'EMPRESA', 'ÁREA', 'GDIA', 'NOTA', 'RESULTADO', 'FIRMA', 'FOTO'].map(h => (
              <th key={h} style={{ ...cellStyle, background: '#dbe3ef', fontWeight: 800, textAlign: 'center', fontSize: '8px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.dni}>
              <td style={rowCellStyle}>{i + 1}</td>
              <td style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.nombre)}</td>
              <td style={rowCellStyle}>{esc(r.dni)}</td>
              <td style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.empresa)}</td>
              <td style={{ ...rowCellStyle, overflowWrap: 'break-word' }}>{esc(r.area)}</td>
              <td style={rowCellStyle}>{esc(r.guardia)}</td>
              <td style={rowCellStyle}>{r.nota !== null ? r.nota.toFixed(1) : '—'}</td>
              <td style={{ ...rowCellStyle, fontWeight: 700, color: r.aprobado ? '#047857' : '#b91c1c' }}>
                {r.nota !== null ? (r.aprobado ? 'APROBADO' : 'NO APROB.') : '—'}
              </td>
              <td style={rowCellStyle}>
                {r.firmaBase64
                  ? <img src={r.firmaBase64} alt="firma" style={{ display: 'block', margin: '0 auto', maxWidth: '40px', maxHeight: '18px' }} />
                  : '—'}
              </td>
              <td style={rowCellStyle}>
                {r.fotoBase64
                  ? <img src={r.fotoBase64} alt="foto" style={{ display: 'block', margin: '0 auto', width: '16px', height: '16px', objectFit: 'cover', borderRadius: '2px' }} />
                  : '—'}
              </td>
            </tr>
          ))}
          {Array.from({ length: emptyRowsCount }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td style={rowCellStyle}>{rows.length + i + 1}</td>
              {Array.from({ length: 9 }).map((__, j) => <td key={j} style={rowCellStyle}>&nbsp;</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

PacAsistenciaTemplate.displayName = 'PacAsistenciaTemplate';

export default PacAsistenciaTemplate;
