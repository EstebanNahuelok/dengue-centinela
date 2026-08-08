import { RiskBadge } from "./RiskBadge";
import type { ZoneName } from "@/lib/mock-data";

export function ZoneCard({
  zone,
  score,
  reports,
  trend,
  intervened,
  onIntervene,
}: {
  zone: ZoneName;
  score: number;
  reports: number;
  trend: "sube" | "baja" | "estable";
  intervened?: boolean;
  onIntervene?: () => void;
}) {
  const arrow = trend === "sube" ? "↑" : trend === "baja" ? "↓" : "→";
  const trendColor =
    trend === "sube" ? "text-risk-critical" : trend === "baja" ? "text-risk-low" : "text-muted-foreground";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-border bg-card p-4 sm:flex sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-base font-semibold text-foreground">{zone}</h3>
          {intervened && (
            <span className="shrink-0 rounded-full border border-risk-low/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-risk-low">
              Intervenida
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {reports} reportes ·{" "}
          <span className={trendColor}>
            {arrow} {trend}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <RiskBadge score={score} />
        {onIntervene && (
          <button
            onClick={onIntervene}
            disabled={intervened}
            className="shrink-0 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            Marcar como intervenido
          </button>
        )}
      </div>
    </div>
  );
}
