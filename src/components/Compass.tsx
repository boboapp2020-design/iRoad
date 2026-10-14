/**
 * On-screen compass: needle = current camera heading, green wedge = allowed
 * window around the target (original) heading. Missing heading draws no needle.
 */
export function Compass({ heading, target, tolerance = 10, size = 120 }: { heading: number | null; target?: number | null; tolerance?: number; size?: number }) {
  const r = size / 2;
  const polar = (deg: number, radius: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r + radius * Math.cos(a), r + radius * Math.sin(a)];
  };
  const wedge = (center: number) => {
    const [x1, y1] = polar(center - tolerance, r - 6);
    const [x2, y2] = polar(center + tolerance, r - 6);
    return `M ${r} ${r} L ${x1} ${y1} A ${r - 6} ${r - 6} 0 0 1 ${x2} ${y2} Z`;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={heading === null ? 'heading unavailable' : `heading ${Math.round(heading)} degrees`}>
      <circle cx={r} cy={r} r={r - 2} fill="rgba(15,23,42,0.75)" stroke="white" strokeWidth={2} />
      {target != null && <path d={wedge(target)} fill="rgba(16,185,129,0.55)" />}
      {['N', 'E', 'S', 'W'].map((l, i) => {
        const [x, y] = polar(i * 90, r - 14);
        return (
          <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={l === 'N' ? '#f87171' : 'white'}>
            {l}
          </text>
        );
      })}
      {heading !== null && (
        <g transform={`rotate(${heading} ${r} ${r})`}>
          <polygon points={`${r},${10} ${r - 6},${r} ${r + 6},${r}`} fill="#f2b01e" />
          <polygon points={`${r},${size - 10} ${r - 6},${r} ${r + 6},${r}`} fill="#94a3b8" />
        </g>
      )}
      <circle cx={r} cy={r} r={4} fill="white" />
    </svg>
  );
}
