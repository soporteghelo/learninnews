/**
 * Gráficos ligeros en SVG puro (sin dependencias) para el panel admin.
 * Diseñados para el tema claro del admin, con etiquetas accesibles y tooltips nativos.
 */

interface BarDatum {
  label: string;
  value: number;
  color?: string;
  sublabel?: string;
}

/** Gráfico de barras verticales responsivo. */
export function BarChart({ data, height = 130, unit = '' }: { data: BarDatum[]; height?: number; unit?: string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.round((d.value / max) * (height - 22));
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0" title={`${d.label}: ${d.value}${unit}`}>
              <span className="text-[10px] font-bold text-[#424750] mb-0.5">{d.value}</span>
              <div className="w-full rounded-t-md transition-all" style={{ height: Math.max(h, 2), background: d.color || '#1b4d89', minHeight: 2 }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 text-center">
            <p className="text-[9px] font-semibold text-[#737781] leading-tight truncate" title={d.label}>{d.label}</p>
            {d.sublabel && <p className="text-[8px] text-[#a0a4ab] leading-tight truncate">{d.sublabel}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Segment { label: string; value: number; color: string; }

/** Donut con leyenda y valor central. */
export function Donut({ segments, size = 120, centerLabel, centerSub }: { segments: Segment[]; size?: number; centerLabel?: string; centerSub?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  // Offset acumulado de cada segmento, calculado sin mutación (compatible con React 19)
  const offsets = segments.map((_, i) => segments.slice(0, i).reduce((a, s) => a + (s.value / total) * circ, 0));
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0" role="img" aria-label="Gráfico de dona">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef0f2" strokeWidth={12} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circ;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={12}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offsets[i]}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt">
              <title>{`${s.label}: ${s.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
        })}
        {centerLabel && (
          <text x={cx} y={cy - 2} textAnchor="middle" className="fill-[#00366b]" style={{ fontSize: 20, fontWeight: 800 }}>{centerLabel}</text>
        )}
        {centerSub && (
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[#737781]" style={{ fontSize: 9, fontWeight: 700 }}>{centerSub}</text>
        )}
      </svg>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[11px] text-[#424750]"><strong>{s.value}</strong> {s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barra de progreso horizontal delgada (firmados / asignados, etc.). */
export function ProgressBar({ value, max, color = '#10b981' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-[#eef0f2] rounded-full overflow-hidden" title={`${value}/${max} (${pct}%)`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
