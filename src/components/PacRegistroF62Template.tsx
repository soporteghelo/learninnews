import React, { useMemo } from 'react';
import type { AppDynamicConfig } from '../types';
import { F62_ROWS_PER_PAGE, type F62Editable, type F62Tipo, type PacF62Row } from '../lib/f62';

interface PacRegistroF62TemplateProps {
  rows: PacF62Row[];
  datos: F62Editable;
  appConfig: AppDynamicConfig | null;
}

// Datos fijos del formato controlado y valores por defecto del empleador (se usan
// solo si la configuración de la app no los trae).
const FORMATO = { codigo: 'RG-CL-SSMA-1-F62', version: '0', fecha: '30/06/2025' };
const EMPLEADOR_DEFAULT = {
  razonSocial: 'Administración de Empresas S.A.C.',
  ruc: '20100114934',
  domicilio: 'Las begonias 441 Int. 1402 - Lima',
  actividad: 'Minería',
  unidad: 'U.M. CERRO LINDO',
};

const B = '1px solid #000';
const GRIS = '#bfbfbf';

/**
 * "Registro de Inducción, Capacitación, Entrenamiento y Simulacros de Emergencia"
 * (RG-CL-SSMA-1-F62) de una capacitación PAC. Réplica del formato físico: cada
 * hoja A4 trae el encabezado completo y 20 filas; la firma de cada participante es
 * la que dibujó al terminar su evaluación.
 */
const PacRegistroF62Template = React.forwardRef<HTMLDivElement, PacRegistroF62TemplateProps>(({ rows, datos, appConfig }, ref) => {
  const proxyUrl = (url?: string) => {
    if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url || '';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
  };
  const logo = useMemo(() => proxyUrl(appConfig?.logoCertificado), [appConfig?.logoCertificado]);
  const firmaResponsable = useMemo(() => proxyUrl(appConfig?.firmaRepresentante), [appConfig?.firmaRepresentante]);

  const empleador = {
    razonSocial: appConfig?.contratista || EMPLEADOR_DEFAULT.razonSocial,
    ruc: appConfig?.ruc || EMPLEADOR_DEFAULT.ruc,
    domicilio: appConfig?.domicilio || EMPLEADOR_DEFAULT.domicilio,
    actividad: appConfig?.actividadEconomica || EMPLEADOR_DEFAULT.actividad,
    unidad: appConfig?.lugar || EMPLEADOR_DEFAULT.unidad,
  };
  const temaLineas = Array.from({ length: 4 }, (_, i) => datos.tema[i] || '');

  const totalPages = Math.max(1, Math.ceil(rows.length / F62_ROWS_PER_PAGE));
  const pages = Array.from({ length: totalPages }, (_, p) => rows.slice(p * F62_ROWS_PER_PAGE, (p + 1) * F62_ROWS_PER_PAGE));

  const td = (extra?: React.CSSProperties): React.CSSProperties => ({ border: B, padding: '1mm 1.5mm', verticalAlign: 'middle', ...extra });
  const lbl = (extra?: React.CSSProperties): React.CSSProperties => td({ fontWeight: 700, ...extra });
  const tableBase: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };

  return (
    <div ref={ref} style={{ background: '#fff' }}>
      {pages.map((pageRows, pageIdx) => (
        <div key={pageIdx} className="f62-page"
          style={{
            width: '210mm', height: '296mm', padding: '7mm 7mm 6mm', boxSizing: 'border-box', overflow: 'hidden',
            fontFamily: '"Arial Narrow", Arial, Helvetica, sans-serif', color: '#000', fontSize: '8.5pt', lineHeight: 1.15,
            pageBreakAfter: pageIdx < totalPages - 1 ? 'always' : 'auto',
          }}>
          {/* ── Encabezado ── */}
          <table style={tableBase}>
            <colgroup><col style={{ width: '13%' }} /><col style={{ width: '57.5%' }} /><col style={{ width: '17.5%' }} /><col style={{ width: '12%' }} /></colgroup>
            <tbody>
              <tr style={{ height: '6.5mm' }}>
                <td style={td({ textAlign: 'center', padding: '1mm' })} rowSpan={3}>
                  {logo ? <img src={logo} alt="logo" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '17mm' }} /> : <b>AESA</b>}
                </td>
                <td style={td({ textAlign: 'center', fontWeight: 700, fontSize: '11pt', padding: '1mm 4mm' })} rowSpan={3}>
                  REGISTRO DE INDUCCIÓN, CAPACITACIÓN, ENTRENAMIENTO Y SIMULACROS DE EMERGENCIA
                </td>
                <td style={td({ fontSize: '7.5pt' })}>Código: {FORMATO.codigo}</td>
                <td style={td({ textAlign: 'center', fontWeight: 700, fontSize: '10pt' })} rowSpan={3}>{empleador.unidad}</td>
              </tr>
              <tr style={{ height: '8mm' }}>
                <td style={td({ fontSize: '7.5pt' })}>Versión: {FORMATO.version}<br />Fecha: {FORMATO.fecha}</td>
              </tr>
              <tr style={{ height: '6mm' }}>
                <td style={td({ fontSize: '7.5pt' })}>Página: {pageIdx + 1} de {totalPages}</td>
              </tr>
            </tbody>
          </table>

          {/* ── Datos del empleador ── */}
          <table style={{ ...tableBase, marginTop: '1.2mm' }}>
            <colgroup><col style={{ width: '26.5%' }} /><col style={{ width: '10.6%' }} /><col style={{ width: '39.6%' }} /><col style={{ width: '11.6%' }} /><col style={{ width: '11.7%' }} /></colgroup>
            <tbody>
              <tr><td colSpan={5} style={lbl({ background: GRIS, fontSize: '8pt' })}>DATOS DEL EMPLEADOR:</td></tr>
              <tr style={{ fontSize: '7.5pt' }}>
                <td style={lbl()}>1 RAZON SOCIAL<br />DENOMINACIÓN SOCIAL</td>
                <td style={lbl({ textAlign: 'center' })}>2 RUC</td>
                <td style={lbl({ textAlign: 'center' })}>3 DOMICILIO<br />(Dirección, distrito, departamento, provincia)</td>
                <td style={lbl({ textAlign: 'center' })}>4 ACTIVIDAD<br />ECONOMICA</td>
                <td style={lbl({ textAlign: 'center', fontSize: '6.5pt' })}>5. N° TRABAJADORES<br />CENTRO LABORAL</td>
              </tr>
              <tr style={{ height: '7mm', textAlign: 'center' }}>
                <td style={td()}>{empleador.razonSocial}</td>
                <td style={td()}>{empleador.ruc}</td>
                <td style={td()}>{empleador.domicilio}</td>
                <td style={td()}>{empleador.actividad}</td>
                <td style={td()}></td>
              </tr>
            </tbody>
          </table>

          {/* ── Marcar (X) ── */}
          <table style={{ ...tableBase, marginTop: '1.2mm' }}>
            <colgroup><col style={{ width: '26.5%' }} /><col style={{ width: '25.2%' }} /><col style={{ width: '25%' }} /><col style={{ width: '23.3%' }} /></colgroup>
            <tbody>
              <tr><td colSpan={4} style={lbl({ background: GRIS, textAlign: 'center', fontSize: '8pt' })}>MARCAR (X)</td></tr>
              <tr style={{ height: '7mm' }}>
                {([['induccion', '6 INDUCCIÓN'], ['capacitacion', '7 CAPACITACIÓN'], ['entrenamiento', '8 ENTRENAMIENTO'], ['simulacro', '9 SIMULACRO DE EMERGENCIA']] as [F62Tipo, string][]).map(([tipo, label]) => (
                  <td key={tipo} style={lbl()}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: '2mm' }}>
                      <span>{label}</span>
                      <span style={{ whiteSpace: 'pre' }}>(  {datos.tipos[tipo] ? 'X' : ' '}  )</span>
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* ── Tema / Fecha / Capacitador / Horas ── */}
          <table style={tableBase}>
            <colgroup><col style={{ width: '26.5%' }} /><col style={{ width: '50.2%' }} /><col style={{ width: '23.3%' }} /></colgroup>
            <tbody>
              {temaLineas.map((linea, i) => (
                <tr key={i} style={{ height: '4.8mm' }}>
                  {i === 0 && <td style={lbl()} rowSpan={4}>10 TEMA</td>}
                  <td style={td({ fontWeight: i === 0 ? 700 : 400 })} colSpan={2}>{linea}</td>
                </tr>
              ))}
              <tr style={{ height: '5.5mm' }}>
                <td style={lbl()}>11. FECHA</td>
                <td style={td()} colSpan={2}>{datos.fecha}</td>
              </tr>
              <tr style={{ height: '5.5mm' }}>
                <td style={lbl()}>12 NOMBRE CAPACITADOR</td>
                <td style={td()}>{datos.capacitador}</td>
                <td style={lbl()}>FIRMA</td>
              </tr>
              <tr style={{ height: '5.5mm' }}>
                <td style={lbl()}>13 N° HORAS</td>
                <td style={td()} colSpan={2}>{datos.horas}</td>
              </tr>
            </tbody>
          </table>

          {/* ── Participantes ── */}
          <table style={tableBase}>
            <colgroup>
              <col style={{ width: '2.6%' }} />
              <col style={{ width: '34%' }} />
              {Array.from({ length: 8 }).map((_, i) => <col key={i} style={{ width: '1.85%' }} />)}
              <col style={{ width: '10.6%' }} />
              <col style={{ width: '11.5%' }} />
              <col style={{ width: '11.6%' }} />
              <col style={{ width: '14.9%' }} />
            </colgroup>
            <thead>
              <tr style={{ height: '6mm', background: GRIS, fontSize: '9pt' }}>
                <th style={lbl({ textAlign: 'left' })} colSpan={2}>14 APELLIDOS Y NOMBRES</th>
                <th style={lbl({ textAlign: 'center' })} colSpan={8}>15 N° DNI</th>
                <th style={lbl({ textAlign: 'center', padding: '1mm 0.5mm' })}>16 OCUPACIÓN</th>
                <th style={lbl({ textAlign: 'center' })}>17 AREA</th>
                <th style={lbl({ textAlign: 'center' })}>18 FIRMA</th>
                <th style={lbl({ textAlign: 'center', padding: '1mm 0.5mm' })}>19 OBSERVACIONES</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: F62_ROWS_PER_PAGE }).map((_, i) => {
                const r = pageRows[i];
                const n = pageIdx * F62_ROWS_PER_PAGE + i + 1;
                const dni = String(r?.dni || '');
                // DNI de 8 dígitos va en sus 8 casillas; otros documentos ocupan el bloque entero
                const enCasillas = /^\d{8}$/.test(dni);
                return (
                  <tr key={i} style={{ height: '7.3mm' }}>
                    <td style={td({ textAlign: 'center', padding: '0' })}>{n}</td>
                    <td style={td({ fontSize: '8pt' })}>{r?.nombre || ''}</td>
                    {enCasillas
                      ? dni.split('').map((d, j) => <td key={j} style={td({ textAlign: 'center', padding: '0', fontSize: '8.5pt' })}>{d}</td>)
                      : !r
                        ? Array.from({ length: 8 }).map((__, j) => <td key={j} style={td({ padding: '0' })}></td>)
                        : <td colSpan={8} style={td({ textAlign: 'center', padding: '0' })}>{dni}</td>}
                    <td style={td({ fontSize: '6.5pt', padding: '0.5mm 1mm', overflow: 'hidden' })}>{r?.ocupacion || ''}</td>
                    <td style={td({ fontSize: '6.5pt', padding: '0.5mm 1mm', textAlign: 'center' })}>{r?.area || ''}</td>
                    <td style={td({ textAlign: 'center', padding: '0.3mm' })}>
                      {r?.firmaBase64 ? <img src={r.firmaBase64} alt="firma" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '6.6mm' }} /> : null}
                    </td>
                    <td style={td({ fontSize: '6.5pt', padding: '0.5mm 1mm', textAlign: 'center' })}>{r?.observacion || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Responsable del registro ── */}
          <table style={tableBase}>
            <colgroup><col style={{ width: '43%' }} /><col style={{ width: '57%' }} /></colgroup>
            <tbody>
              <tr><td colSpan={2} style={lbl({ background: GRIS, textAlign: 'center', fontSize: '8.5pt' })}>20 RESPONSABLE DEL REGISTRO</td></tr>
              <tr style={{ height: '7.5mm' }}>
                <td style={td()}><b>NOMBRE:</b> {datos.responsableNombre}</td>
                <td style={td()}><b>CARGO:</b> {datos.responsableCargo}</td>
              </tr>
              <tr style={{ height: '9mm' }}>
                <td style={td()}><b>FECHA:</b> {datos.responsableFecha}</td>
                <td style={td()}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
                    <b>FIRMA</b>
                    {datos.incluirFirmaResponsable && firmaResponsable ? <img src={firmaResponsable} alt="firma responsable" style={{ maxHeight: '8mm', maxWidth: '45mm' }} /> : null}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6mm', marginTop: '0.8mm', fontSize: '6.5pt' }}>
            <b style={{ fontSize: '7.5pt', whiteSpace: 'nowrap' }}>{datos.referencia}</b>
            <span>Los documentos impresos no son controlados. Usted es responsable de verificar que tiene la última versión.</span>
          </div>
        </div>
      ))}
    </div>
  );
});

PacRegistroF62Template.displayName = 'PacRegistroF62Template';

export default PacRegistroF62Template;
