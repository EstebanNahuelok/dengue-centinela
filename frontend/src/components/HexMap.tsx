import { useState } from "react";
import type { Hex } from "@/lib/mock-data";
import { riskLevel } from "@/lib/mock-data";
import { riskColor } from "./RiskBadge";

const W = 64; // ancho hex
const H = 56;

function hexPoints(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

export function HexPopover({ hex }: { hex: Hex }) {
  return (
    <div className="w-56 rounded-xl border border-border bg-popover p-3 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{hex.zone}</span>
        <span
          className="shrink-0 text-xs font-semibold capitalize"
          style={{ color: riskColor(hex.score) }}
        >
          {riskLevel(hex.score)}
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Score de riesgo</dt>
          <dd className="font-mono text-foreground">{hex.score}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Reportes</dt>
          <dd className="text-foreground">{hex.reports}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Último reporte</dt>
          <dd className="text-foreground">{hex.lastReport}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Lluvia reciente</dt>
          <dd className="text-foreground">{hex.recentRain ? "Sí (48 h)" : "No"}</dd>
        </div>
      </dl>
      <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">H3 {hex.h3}</p>
    </div>
  );
}

export function HexMap({
  hexes,
  selectedId,
  onSelect,
}: {
  hexes: Hex[];
  selectedId?: string | null;
  onSelect?: (hex: Hex) => void;
}) {
  const [active, setActive] = useState<Hex | null>(null);
  const cols = Math.max(...hexes.map((h) => h.col)) + 1;
  const rows = Math.max(...hexes.map((h) => h.row)) + 1;
  const width = cols * W + W / 2 + 24;
  const height = rows * (H * 0.78) + H + 24;

  const pos = (h: Hex) => ({
    cx: 24 + h.col * W + (h.row % 2 ? W / 2 : 0),
    cy: 24 + h.row * H * 0.78,
  });

  const shown = active ?? hexes.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect width={width} height={height} fill="var(--map-base)" />
        <g stroke="var(--border)" strokeWidth="0.5" opacity="0.5">
          {Array.from({ length: 14 }, (_, i) => (
            <line key={i} x1={0} y1={(height / 14) * i} x2={width} y2={(height / 14) * i} />
          ))}
        </g>
        {hexes.map((h) => {
          const { cx, cy } = pos(h);
          const color = riskColor(h.score);
          const isSel = h.id === selectedId;
          return (
            <polygon
              key={h.id}
              points={hexPoints(cx, cy, W / 1.85)}
              fill={color}
              fillOpacity={0.16 + (h.score / 100) * 0.62}
              stroke={isSel ? "var(--foreground)" : color}
              strokeWidth={isSel ? 2.4 : 1}
              className="cursor-pointer transition-all duration-300"
              onMouseEnter={() => setActive(h)}
              onMouseLeave={() => setActive(null)}
              onClick={() => onSelect?.(h)}
            />
          );
        })}
      </svg>
      {shown && (
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <HexPopover hex={shown} />
        </div>
      )}
    </div>
  );
}
