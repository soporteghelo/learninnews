import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, MessageCircle, Search, UserX } from 'lucide-react';
import type { PacPrograma } from '../types';
import type { PacRosterStatus } from '../lib/pacRoster';
import type { PacPadronRow } from '../lib/pacPadron';
import { buildWhatsAppLink } from '../lib/whatsapp';

type Filtro = PacRosterStatus | 'todos';

const STATUS_LABEL: Record<PacRosterStatus, string> = {
  sin_intentos: 'Sin rendir', en_progreso: 'En progreso', agotado: 'Agotó intentos', aprobado: 'Aprobado',
};
const STATUS_COLOR: Record<PacRosterStatus, string> = {
  sin_intentos: 'bg-slate-100 text-slate-600', en_progreso: 'bg-amber-100 text-amber-700',
  agotado: 'bg-red-100 text-red-600', aprobado: 'bg-emerald-100 text-emerald-700',
};
// Orden de la tabla en "Todos": primero los que más urge contactar
const STATUS_ORDER: Record<PacRosterStatus, number> = { sin_intentos: 0, agotado: 1, en_progreso: 2, aprobado: 3 };

/**
 * Detalle, por capacitación, de quién del padrón de personal ACTIVO ya rindió y
 * quién falta. Abre filtrado en "Sin rendir", que es la pregunta habitual.
 */
export default function PacPendientesPanel({ programa, rows, link, loading }: {
  programa: PacPrograma;
  rows: PacPadronRow[];
  link: string;
  loading: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>('sin_intentos');
  const [busqueda, setBusqueda] = useState('');
  const [guardia, setGuardia] = useState('');
  const [area, setArea] = useState('');

  const counts = useMemo(() => {
    const c: Record<PacRosterStatus, number> = { sin_intentos: 0, en_progreso: 0, agotado: 0, aprobado: 0 };
    rows.forEach(r => { c[r.status]++; });
    return c;
  }, [rows]);
  const guardias = useMemo(() => [...new Set(rows.map(r => r.guardia).filter(Boolean))].sort(), [rows]);
  const areas = useMemo(() => [...new Set(rows.map(r => r.area).filter(Boolean))].sort(), [rows]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows
      .filter(r => filtro === 'todos' || r.status === filtro)
      .filter(r => !guardia || r.guardia === guardia)
      .filter(r => !area || r.area === area)
      .filter(r => !q || r.dni.includes(q) || r.nombre.toLowerCase().includes(q))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.nombre.localeCompare(b.nombre, 'es'));
  }, [rows, filtro, busqueda, guardia, area]);

  const handleExport = () => {
    const data = visibles.map(r => ({
      'DNI': r.dni, 'APELLIDOS Y NOMBRES': r.nombre, 'EMPRESA': r.empresa, 'GUARDIA': r.guardia,
      'CARGO': r.cargo, 'AREA': r.area, 'CELULAR': r.celular, 'CORREO': r.correo,
      'INTENTOS': r.intentosUsados, 'MEJOR NOTA': r.mejorNota ?? '', 'ESTADO': STATUS_LABEL[r.status].toUpperCase(),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendientes');
    const slug = programa.nombre.replace(/[^\w]+/g, '_').slice(0, 40);
    const sufijo = filtro === 'todos' ? 'TODOS' : STATUS_LABEL[filtro].toUpperCase().replace(/\s+/g, '_');
    XLSX.writeFile(wb, `PAC_${slug}_${sufijo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#737781]">
        <Loader2 className="w-4 h-4 animate-spin text-[#1b4d89]" /> Cargando padrón de personal activo…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-[#737781] italic">
        No se pudo leer el padrón de personal activo. Verifica que la hoja "PERSONAL TEMPORAL" esté compartida con el enlace.
      </p>
    );
  }

  const chips: { key: Filtro; label: string; value: number; tone: string }[] = [
    { key: 'sin_intentos', label: 'Faltan rendir', value: counts.sin_intentos, tone: 'text-slate-700' },
    { key: 'en_progreso', label: 'En progreso', value: counts.en_progreso, tone: 'text-amber-600' },
    { key: 'agotado', label: 'Agotaron intentos', value: counts.agotado, tone: 'text-red-500' },
    { key: 'aprobado', label: 'Aprobados', value: counts.aprobado, tone: 'text-emerald-600' },
    { key: 'todos', label: 'Activos', value: rows.length, tone: 'text-[#1b4d89]' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {chips.map(c => (
          <button key={c.key} onClick={() => setFiltro(c.key)}
            className={`rounded-xl px-3 py-2 border text-left transition-all ${filtro === c.key ? 'border-[#1b4d89] bg-[#1b4d89]/5 ring-1 ring-[#1b4d89]' : 'border-[#e1e3e4] bg-white hover:border-[#1b4d89]/40'}`}>
            <p className={`text-lg font-black leading-none ${c.tone}`}>{c.value}</p>
            <p className="text-[9px] text-[#737781] uppercase font-bold tracking-wider mt-1">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px] px-2.5 py-1.5 bg-white border border-[#e1e3e4] rounded-lg focus-within:border-[#1b4d89]">
          <Search className="w-3.5 h-3.5 text-[#737781]" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar DNI o nombre…"
            className="flex-1 text-xs text-[#424750] bg-transparent focus:outline-none placeholder:text-[#b0b3b8]" />
        </div>
        <select value={guardia} onChange={e => setGuardia(e.target.value)}
          className="px-2 py-1.5 bg-white border border-[#e1e3e4] rounded-lg text-xs text-[#424750] focus:outline-none focus:border-[#1b4d89]">
          <option value="">Todas las guardias</option>
          {guardias.map(g => <option key={g} value={g}>Guardia {g}</option>)}
        </select>
        <select value={area} onChange={e => setArea(e.target.value)}
          className="px-2 py-1.5 bg-white border border-[#e1e3e4] rounded-lg text-xs text-[#424750] focus:outline-none focus:border-[#1b4d89] max-w-[180px]">
          <option value="">Todas las áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={handleExport} disabled={visibles.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[#e1e3e4] rounded-lg text-xs font-bold text-[#006d36] hover:bg-emerald-50 transition-all disabled:opacity-40">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel ({visibles.length})
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <UserX className="w-8 h-8 text-[#e1e3e4] mb-1.5" />
          <p className="text-xs text-[#737781]">{filtro === 'sin_intentos' && !busqueda && !guardia && !area ? 'Todo el personal activo ya rindió esta evaluación' : 'Nadie coincide con los filtros'}</p>
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-[#e1e3e4]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#f8f9fa]">
              <tr className="text-[9px] text-[#737781] uppercase text-left">
                <th className="py-2 px-3">DNI</th>
                <th className="py-2 pr-3">Apellidos y Nombres</th>
                <th className="py-2 pr-3 text-center">Gdia</th>
                <th className="py-2 pr-3">Cargo / Área</th>
                <th className="py-2 pr-3 text-center">Int.</th>
                <th className="py-2 pr-3 text-center">Nota</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f5] bg-white">
              {visibles.map(r => {
                // El padrón trae "APELLIDO1 APELLIDO2 NOMBRE1 ...": el primer nombre es el 3er token
                const partes = r.nombre.split(/\s+/);
                const primerNombre = partes[2] || partes[partes.length - 1] || r.nombre;
                const waHref = r.status !== 'aprobado'
                  ? buildWhatsAppLink(r.celular, `Buen día ${primerNombre}, tienes pendiente la evaluación de la capacitación "${programa.nombre}". Ingresa aquí para rendirla: ${link}`)
                  : null;
                return (
                  <tr key={r.dni}>
                    <td className="py-1.5 px-3 font-mono text-[#737781]">{r.dni}</td>
                    <td className="py-1.5 pr-3 font-semibold text-[#424750]">{r.nombre}</td>
                    <td className="py-1.5 pr-3 text-center font-bold text-[#424750]">{r.guardia || '—'}</td>
                    <td className="py-1.5 pr-3 text-[#737781]">
                      <span className="block truncate max-w-[220px]" title={r.cargo}>{r.cargo || '—'}</span>
                      {r.area && <span className="block text-[9px] uppercase tracking-wide">{r.area}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-center text-[#737781]">{r.intentosUsados}/{programa.maxIntentos}</td>
                    <td className="py-1.5 pr-3 text-center font-bold text-[#424750]">{r.mejorNota !== null ? r.mejorNota.toFixed(1) : '—'}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      {waHref && (
                        <a href={waHref} target="_blank" rel="noopener noreferrer"
                          title={`Recordar por WhatsApp a ${r.celular}`}
                          className="inline-flex p-1 rounded-md text-[#25D366] hover:bg-[#25D366]/10 transition-colors">
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
