import React from 'react';

const BROWN = '#5a3825';
const TAN = '#c48a5a';
const MUTED = '#806f63';

export function BarChart({ items, format = (v) => v, height = 170 }) {
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  const w = Math.max(items.length * 46, 300);
  return (
    <div className="a-scroll">
      <svg width={w} height={height + 40} role="img">
        {items.map((it, i) => {
          const h = (it.value / max) * height;
          const x = i * 46 + 8;
          return (
            <g key={it.label}>
              <rect x={x} y={height - h + 14} width={30} height={h} rx={4} fill={it.highlight ? BROWN : TAN} />
              <text x={x + 15} y={height - h + 9} fontSize="10" textAnchor="middle" fill={MUTED}>{format(it.value)}</text>
              <text x={x + 15} y={height + 30} fontSize="10" textAnchor="middle" fill={BROWN}>{it.label.length > 8 ? `${it.label.slice(0, 7)}…` : it.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// series: [{name, color, points:[{x,y}]}]; x and y are 0..1 or any numeric range.
export function LineChart({ series, width = 340, height = 190, xLabel, yLabel, xFormat = (v) => v, yFormat = (v) => v.toFixed(2), yMin, yMax, hLines = [] }) {
  const pad = { l: 44, r: 12, t: 10, b: 34 };
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y).concat(hLines.map((h) => h.y));
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const y0 = yMin !== undefined ? yMin : Math.min(...ys); const y1 = yMax !== undefined ? yMax : Math.max(...ys);
  const sx = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((t) => y0 + t * (y1 - y0));
  return (
    <div className="a-scroll">
      <svg width={width} height={height} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="#e4d7c9" />
            <text x={pad.l - 6} y={sy(t) + 3} fontSize="10" textAnchor="end" fill={MUTED}>{yFormat(t)}</text>
          </g>
        ))}
        {hLines.map((h) => (
          <g key={h.label}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(h.y)} y2={sy(h.y)} stroke={MUTED} strokeDasharray="4 3" />
            <text x={width - pad.r} y={sy(h.y) - 3} fontSize="10" textAnchor="end" fill={MUTED}>{h.label}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
            {s.points.length < 15 && s.points.map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="2.5" fill={s.color} />)}
          </g>
        ))}
        <text x={(width + pad.l) / 2} y={height - 4} fontSize="10" textAnchor="middle" fill={MUTED}>{xLabel}</text>
        <text x={pad.l} y={height - 18} fontSize="10" textAnchor="start" fill={MUTED}>{xFormat(x0)}</text>
        <text x={width - pad.r} y={height - 18} fontSize="10" textAnchor="end" fill={MUTED}>{xFormat(x1)}</text>
        {yLabel && <text x={4} y={10} fontSize="10" fill={MUTED}>{yLabel}</text>}
      </svg>
      <div className="a-legend">
        {series.map((s) => (<span key={s.name}><i style={{ background: s.color }} />{s.name}</span>))}
      </div>
    </div>
  );
}
