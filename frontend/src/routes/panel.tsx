import { createFileRoute } from "@tanstack/react-router";
import { ZoneCard } from "@/components/ZoneCard";
import { markIntervened, useAppState, zoneAggregates } from "@/lib/store";
import { TREND_7D, riskLevel } from "@/lib/mock-data";

export const Route = createFileRoute("/panel")({
  head: () => ({
    meta: [
      { title: "Panel del municipio — Dengue Centinela" },
      {
        name: "description",
        content:
          "Zonas de Salta ordenadas por riesgo, KPIs de reportes y acciones de intervención para equipos municipales.",
      },
      { property: "og:title", content: "Panel del municipio — Dengue Centinela" },
      {
        property: "og:description",
        content: "Priorización operativa de zonas por riesgo de dengue con datos vecinales.",
      },
    ],
  }),
  component: PanelPage,
});

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 300},${60 - (v / max) * 52}`)
    .join(" ");
  return (
    <svg viewBox="0 0 300 64" className="h-24 w-full">
      <polyline points={pts} fill="none" stroke="var(--risk-high)" strokeWidth="2.5" />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={(i / (data.length - 1)) * 300}
          cy={60 - (v / max) * 52}
          r="3"
          fill="var(--risk-high)"
        />
      ))}
    </svg>
  );
}

function PanelPage() {
  // GET /zones?sort=risk_desc
  const { hexes, intervened, reports } = useAppState();
  const zonas = zoneAggregates(hexes);
  const alertaAlta = zonas.filter((z) => riskLevel(z.score) === "alto").length;
  const reportes24 = 58 + reports.length;

  const kpis = [
    { k: "Zonas en alerta alta", v: alertaAlta, tone: "text-risk-critical" },
    { k: "Reportes últimas 24 h", v: reportes24, tone: "text-foreground" },
    { k: "Zonas nuevas esta semana", v: 3, tone: "text-risk-high" },
    { k: "Zonas intervenidas", v: intervened.length, tone: "text-risk-low" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">Panel del municipio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Priorización operativa por riesgo · Salta capital
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.k} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k.k}</p>
            <p className={`mt-2 text-3xl font-bold ${k.tone}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate text-sm font-semibold text-foreground">
            Reportes últimos 7 días
          </h2>
          <span className="text-xs text-muted-foreground">mock</span>
        </div>
        <Sparkline data={TREND_7D} />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Zonas por riesgo</h2>
      <div className="mt-3 space-y-3">
        {zonas.map((z, i) => (
          <ZoneCard
            key={z.zone}
            zone={z.zone}
            score={z.score}
            reports={z.reports}
            trend={i < 2 ? "sube" : i > zonas.length - 3 ? "baja" : "estable"}
            intervened={intervened.includes(z.zone)}
            onIntervene={() => markIntervened(z.zone)}
          />
        ))}
      </div>
    </div>
  );
}
