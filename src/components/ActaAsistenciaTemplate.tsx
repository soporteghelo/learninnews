import React, { useMemo } from 'react';
import type { ActaDocumento, ActaItem, AppDynamicConfig } from '../types';
import type { FirmaRosterRow } from '../lib/firmaRoster';

export interface AsistenciaRow extends FirmaRosterRow {
  firmaBase64?: string;
}

interface ActaAsistenciaTemplateProps {
  doc: ActaDocumento;
  item: ActaItem;
  rows: AsistenciaRow[];
  appConfig: AppDynamicConfig | null;
}

/** Escapa texto plano para incrustarlo con seguridad en celdas HTML. */
function esc(s: string | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * "Registro de Inducción, Capacitación, Entrenamiento y Simulacros de Emergencia" —
 * lista de asistencia que se genera para documentos de categoría "capacitación",
 * con la firma adicional (distinta de la del acta) que cada asistente dibuja al firmar.
 */
const ActaAsistenciaTemplate = React.forwardRef<HTMLDivElement, ActaAsistenciaTemplateProps>((props, ref) => {
  const { doc, item, rows, appConfig } = props;

  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };

  const logo = useMemo(() => proxyUrl(appConfig?.logoCertificado), [appConfig?.logoCertificado]);
  const firmaResponsable = useMemo(() => proxyUrl(appConfig?.firmaRepresentante), [appConfig?.firmaRepresentante]);

  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const cellStyle: React.CSSProperties = { border: '1px solid #1f2937', padding: '4px 8px', fontSize: '9.5px', verticalAlign: 'middle' };
  const labelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: '#f3f4f6' };
  const headStyle: React.CSSProperties = { ...cellStyle, background: '#dbe3ef', fontWeight: 800, textAlign: 'center' };

  const tipos: { id: 'induccion' | 'capacitacion' | 'entrenamiento' | 'simulacro'; label: string }[] = [
    { id: 'induccion', label: 'Inducción' },
    { id: 'capacitacion', label: 'Capacitación' },
    { id: 'entrenamiento', label: 'Entrenamiento' },
    { id: 'simulacro', label: 'Simulacro de Emergencia' },
  ];

  return (
    <div ref={ref} style={{ width: '210mm', background: '#ffffff', padding: '10mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827' }}>
      {/* Encabezado */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '16%', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={3}>
              {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '46px' }} /> : null}
            </td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, fontSize: '11px' }} rowSpan={3}>
              REGISTRO DE INDUCCIÓN, CAPACITACIÓN, ENTRENAMIENTO Y SIMULACROS DE EMERGENCIA
            </td>
            <td style={{ ...labelStyle, width: '13%' }}>Código:</td>
            <td style={{ ...cellStyle, width: '15%' }} colSpan={2}>{esc(item.codigo)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Versión:</td>
            <td style={cellStyle} colSpan={2}>{esc(item.version)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Fecha:</td>
            <td style={cellStyle} colSpan={2}>{esc(item.fechaVersion)}</td>
          </tr>
          <tr>
            <td colSpan={2} />
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800 }} colSpan={2}>{esc(appConfig?.lugar) || ' '}</td>
          </tr>
        </tbody>
      </table>

      {/* Datos del empleador */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '18%' }} colSpan={1}>Razón Social:</td>
            <td style={cellStyle} colSpan={3}>{esc(appConfig?.contratista)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>RUC:</td>
            <td style={{ ...cellStyle, width: '30%' }}>&nbsp;</td>
            <td style={labelStyle}>Actividad económica:</td>
            <td style={cellStyle}>&nbsp;</td>
          </tr>
          <tr>
            <td style={labelStyle}>Domicilio:</td>
            <td style={cellStyle} colSpan={2}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      {/* Marcar (X) */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            {tipos.map(t => (
              <td key={t.id} style={{ ...cellStyle, fontWeight: 700 }}>
                {t.label} &nbsp; ( {t.id === item.categoria || (t.id === 'capacitacion' && item.categoria === 'capacitacion') ? 'X' : ' '} )
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Tema / Fecha / Capacitador / Horas */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '14%' }}>Tema:</td>
            <td style={cellStyle} colSpan={3}>{esc(item.tema) || esc(doc.titulo)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Fecha:</td>
            <td style={{ ...cellStyle, width: '20%' }}>{fecha}</td>
            <td style={labelStyle}>N° Horas:</td>
            <td style={cellStyle}>{esc(item.horas)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Nombre capacitador:</td>
            <td style={cellStyle} colSpan={3}>{esc(item.capacitador)}</td>
          </tr>
        </tbody>
      </table>

      {/* Tabla de asistentes */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['N°', 'APELLIDOS Y NOMBRES', 'N° DNI', 'OCUPACIÓN', 'ÁREA', 'FIRMA', 'OBSERVACIONES'].map(h => (
              <th key={h} style={headStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td style={{ ...cellStyle, textAlign: 'center', fontStyle: 'italic', color: '#6b7280' }} colSpan={7}>Sin asistentes registrados todavía</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.dni}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
              <td style={cellStyle}>{esc(r.nombre)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{esc(r.dni)}</td>
              <td style={cellStyle}>{esc(r.cargo)}</td>
              <td style={cellStyle}>{esc(r.area)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                {r.firmaBase64
                  ? <img src={r.firmaBase64} alt="firma" style={{ maxWidth: '70px', maxHeight: '26px' }} />
                  : ''}
              </td>
              <td style={cellStyle}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Responsable del registro */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...labelStyle, width: '14%' }}>Responsable:</td>
            <td style={cellStyle}>{esc(appConfig?.nombreRepresentante)}</td>
            <td style={{ ...labelStyle, width: '10%' }}>Cargo:</td>
            <td style={cellStyle}>{esc(appConfig?.cargoRepresentante)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Fecha:</td>
            <td style={cellStyle}>{fecha}</td>
            <td style={labelStyle}>Firma:</td>
            <td style={{ ...cellStyle, textAlign: 'center' }}>
              {firmaResponsable ? <img src={firmaResponsable} alt="firma" style={{ maxWidth: '80px', maxHeight: '28px' }} /> : ''}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ textAlign: 'center', fontSize: '8px', color: '#4b5563', marginTop: '8px', marginBottom: 0 }}>
        Los documentos impresos no son controlados. Usted es responsable de verificar que tiene la última versión.
      </p>
      <p style={{ textAlign: 'center', fontSize: '8px', fontWeight: 700, color: '#4b5563', margin: '2px 0 0' }}>
        Sólo para uso interno de {esc(appConfig?.contratista) || 'la empresa'}.
      </p>
      <p style={{ textAlign: 'center', fontSize: '7px', color: '#9ca3af', margin: '6px 0 0' }}>
        Generado el {fecha} de {MESES[now.getMonth()]} de {now.getFullYear()}
      </p>
    </div>
  );
});

ActaAsistenciaTemplate.displayName = 'ActaAsistenciaTemplate';

export default ActaAsistenciaTemplate;
