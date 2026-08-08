import { Globe2 } from "lucide-react";

import { RISK_COLORS, RISK_LABELS, type ProvinceId, type ProvinceSummary } from "@/lib/risk-map";

export type RailSelection = ProvinceId | "noa";

/**
 * Barra lateral de navegación rápida del mapa: salta a cada provincia del NOA
 * (o a la región completa). No es el panel de estadísticas, solo navegación.
 */
export function ProvinceRail({
  summaries,
  active,
  onSelect,
}: {
  summaries: ProvinceSummary[];
  active: RailSelection;
  onSelect: (selection: RailSelection) => void;
}) {
  return (
    <nav
      aria-label="Provincias del NOA"
      className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-card/70 p-2 backdrop-blur md:w-60 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:p-3"
    >
      <p className="hidden px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:block">
        Región NOA
      </p>

      <RailButton
        label="Todo el NOA"
        detail="6 provincias"
        active={active === "noa"}
        onClick={() => onSelect("noa")}
        icon={<Globe2 className="h-4 w-4" />}
      />

      <span
        className="hidden h-px w-full bg-border md:block"
        role="separator"
        aria-orientation="horizontal"
      />

      {summaries.map((summary) => (
        <RailButton
          key={summary.province.id}
          label={summary.province.name}
          detail={`${RISK_LABELS[summary.level]} · ${summary.highCells} en alto`}
          active={active === summary.province.id}
          onClick={() => onSelect(summary.province.id)}
          icon={
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: RISK_COLORS[summary.level] }}
            />
          }
          score={summary.score}
        />
      ))}
    </nav>
  );
}

function RailButton({
  label,
  detail,
  active,
  onClick,
  icon,
  score,
}: {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  score?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:w-full ${
        active
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 md:flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">{label}</span>
        <span className="hidden truncate text-[11px] text-muted-foreground md:block">{detail}</span>
      </span>
      {score !== undefined && (
        <span className="hidden font-mono text-[11px] text-muted-foreground md:block">{score}</span>
      )}
    </button>
  );
}
