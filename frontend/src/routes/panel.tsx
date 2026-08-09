import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CloudRain, Globe2, Loader2, RefreshCw, Siren, TriangleAlert } from "lucide-react";

import { RiskBadge } from "@/components/RiskBadge";
import { USING_MOCK, getStatus } from "@/lib/api";
import { riskLevel, type RiskLevel } from "@/lib/mock-data";
import {
  NOA_PROVINCES,
  RISK_LABELS,
  applyStatusToRiskMap,
  getRiskMapData,
  type ProvinceId,
  type RiskCell,
} from "@/lib/risk-map";
import { toggleZoneIntervened, useAppState } from "@/lib/store";

export const Route = createFileRoute("/panel")({
  head: () => ({
    meta: [
      { title: "Panel epidemiológico NOA — Dengue Centinela" },
      {
        name: "description",
        content:
          "Panel operativo del Noroeste Argentino: las 6 provincias del NOA ordenadas por riesgo de dengue, focos activos, barrios priorizados y seguimiento de intervenciones.",
      },
      { property: "og:title", content: "Panel epidemiológico NOA — Dengue Centinela" },
      {
        property: "og:description",
        content:
          "Priorización operativa por riesgo de dengue en Jujuy, Salta, Tucumán, Santiago del Estero, Catamarca y La Rioja.",
      },
    ],
  }),
  component: PanelPage,
});

/* ------------------------------------------------------------------ *
 * Tokens de nivel de riesgo
 * Ojo con el naming heredado de riskLevel(): "medio" usa --risk-high y
 * "alto" usa --risk-critical (ver RiskBadge.tsx). Se respeta para que el
 * panel y el mapa pinten el mismo score con el mismo color.
 * ------------------------------------------------------------------ */
const LEVEL_BG: Record<RiskLevel, string> = {
  bajo: "bg-risk-low",
  moderado: "bg-risk-mid",
  medio: "bg-risk-high",
  alto: "bg-risk-critical",
};

const LEVEL_TEXT: Record<RiskLevel, string> = {
  bajo: "text-risk-low",
  moderado: "text-risk-mid",
  medio: "text-risk-high",
  alto: "text-risk-critical",
};

/** Orden de la escala, de menor a mayor, igual que el degradé del mapa. */
const LEVEL_ORDER: RiskLevel[] = ["bajo", "moderado", "medio", "alto"];

type Scope = "noa" | ProvinceId;

const PROVINCE_NAME = new Map<ProvinceId, string>(NOA_PROVINCES.map((p) => [p.id, p.name]));

/* ------------------------------------------------------------------ *
 * Agregaciones
 * ------------------------------------------------------------------ */

interface ScopeStats {
  cells: number;
  score: number;
  reports: number;
  high: number;
  rain: number;
  zones: number;
  byLevel: Record<RiskLevel, number>;
}

function computeStats(cells: RiskCell[]): ScopeStats {
  const byLevel: Record<RiskLevel, number> = { bajo: 0, moderado: 0, medio: 0, alto: 0 };
  const zones = new Set<string>();
  let score = 0;
  let reports = 0;
  let high = 0;
  let rain = 0;

  for (const cell of cells) {
    byLevel[cell.level] += 1;
    zones.add(zoneKey(cell));
    if (cell.score > score) score = cell.score;
    reports += cell.reports;
    if (cell.level === "alto") high += 1;
    if (cell.recentRain) rain += 1;
  }

  return { cells: cells.length, score, reports, high, rain, zones: zones.size, byLevel };
}

function zoneKey(cell: RiskCell) {
  return `${cell.province ?? "noa"}:${cell.zone}`;
}

interface ZoneRow {
  key: string;
  zone: string;
  provinceName: string;
  score: number;
  level: RiskLevel;
  reports: number;
  cells: number;
  high: number;
  rain: number;
  /** del foco más caliente de la zona, no el más reciente en el tiempo */
  lastReportAt: string;
}

function aggregateZones(cells: RiskCell[]): ZoneRow[] {
  const rows = new Map<string, ZoneRow>();

  for (const cell of cells) {
    const key = zoneKey(cell);
    const row = rows.get(key);

    if (!row) {
      rows.set(key, {
        key,
        zone: cell.zone,
        provinceName: cell.province ? (PROVINCE_NAME.get(cell.province) ?? "NOA") : "NOA",
        score: cell.score,
        level: cell.level,
        reports: cell.reports,
        cells: 1,
        high: cell.level === "alto" ? 1 : 0,
        rain: cell.recentRain ? 1 : 0,
        lastReportAt: cell.lastReportAt,
      });
      continue;
    }

    row.cells += 1;
    row.reports += cell.reports;
    if (cell.level === "alto") row.high += 1;
    if (cell.recentRain) row.rain += 1;
    // El score de la zona es el de su peor celda, igual que en el mapa.
    if (cell.score > row.score) {
      row.score = cell.score;
      row.level = cell.level;
      row.lastReportAt = cell.lastReportAt;
    }
  }

  return [...rows.values()].sort((a, b) => b.score - a.score);
}

/**
 * Reparto del total de reportes de 7 días en una curva creciente. Es una
 * distribución simulada: el backend hoy expone el acumulado de la ventana
 * (reportes_7d), no la serie día por día.
 */
const TREND_WEIGHTS = [0.06, 0.09, 0.11, 0.14, 0.17, 0.2, 0.23];

function trendFor(total: number) {
  return TREND_WEIGHTS.map((w) => Math.round(total * w));
}

function formatStamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

function PanelPage() {
  const [scope, setScope] = useState<Scope>("noa");
  const { intervenedZones } = useAppState();

  // El backend sólo cubre Salta capital: el resto del NOA queda simulado.
  // Si /status no responde, el panel sigue mostrando la grilla simulada.
  const {
    data: status,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["status"],
    queryFn: getStatus,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const data = useMemo(() => {
    const base = getRiskMapData();
    return status && status.zonas.length > 0 ? applyStatusToRiskMap(base, status.zonas) : base;
  }, [status]);

  const scopeCells = useMemo(
    () => (scope === "noa" ? data.detail : data.detail.filter((c) => c.province === scope)),
    [data, scope],
  );

  const stats = useMemo(() => computeStats(scopeCells), [scopeCells]);
  const noaStats = useMemo(() => computeStats(data.detail), [data]);
  const zones = useMemo(() => aggregateZones(scopeCells), [scopeCells]);
  const hotspots = useMemo(
    () => [...scopeCells].sort((a, b) => b.score - a.score).slice(0, 8),
    [scopeCells],
  );

  const cellsByProvince = useMemo(() => {
    const counts = new Map<ProvinceId, number>();
    for (const cell of data.detail) {
      if (cell.province) counts.set(cell.province, (counts.get(cell.province) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const pendientes = zones.filter(
    (z) => z.level === "alto" && !intervenedZones.includes(z.key),
  ).length;
  const intervenidasScope = zones.filter((z) => intervenedZones.includes(z.key)).length;

  const scopeLabel = scope === "noa" ? "Región NOA" : (PROVINCE_NAME.get(scope) ?? "NOA");
  const scopeLevel = riskLevel(stats.score);
  const trend = trendFor(stats.reports);

  const kpis = [
    {
      k: "Score máximo",
      v: stats.score,
      tone: LEVEL_TEXT[scopeLevel],
      hint: RISK_LABELS[scopeLevel],
    },
    {
      k: "Celdas en riesgo alto",
      v: stats.high,
      tone: "text-risk-critical",
      hint: `de ${stats.cells} celdas H3`,
    },
    {
      k: "Reportes 7 días",
      v: stats.reports,
      tone: "text-foreground",
      hint: scope === "noa" ? "todo el NOA" : `${pct(stats.reports, noaStats.reports)}% del NOA`,
    },
    {
      k: "Zonas sin intervenir",
      v: pendientes,
      tone: pendientes > 0 ? "text-risk-high" : "text-risk-low",
      hint: "en nivel alto",
    },
    {
      k: "Celdas con lluvia reciente",
      v: stats.rain,
      tone: "text-risk-mid",
      hint: "disparador de criaderos",
    },
    {
      k: "Zonas monitoreadas",
      v: stats.zones,
      tone: "text-foreground",
      hint: `${intervenidasScope} intervenidas`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 pb-24 sm:px-4 sm:py-6 sm:pb-6">
      {/* Encabezado ------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground sm:text-xl">Panel epidemiológico</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground sm:mt-1 sm:text-sm">
            Priorización operativa por riesgo · Noroeste Argentino
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground sm:px-2.5 sm:text-[11px]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                USING_MOCK ? "bg-risk-mid" : isError ? "bg-risk-critical" : "bg-risk-low"
              }`}
              aria-hidden="true"
            />
            {USING_MOCK
              ? "Salta: mock local"
              : isError
                ? "Salta: sin conexión, datos simulados"
                : status
                  ? `Salta en vivo · ${formatStamp(status.ultima_actualizacion)}`
                  : "Salta: cargando"}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Actualizar
          </button>
        </div>
      </div>

      {/* Selector de alcance --------------------------------------- */}
      <nav aria-label="Alcance del panel" className="mt-4 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2">
        <ScopeChip
          label="Todo el NOA"
          detail={`${noaStats.zones} zonas`}
          active={scope === "noa"}
          onClick={() => setScope("noa")}
          icon={<Globe2 className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        {data.summaries.map((s) => (
          <ScopeChip
            key={s.province.id}
            label={s.province.name}
            detail={`${s.score}`}
            active={scope === s.province.id}
            onClick={() => setScope(s.province.id)}
            icon={
              <span className={`h-2 w-2 rounded-full ${LEVEL_BG[s.level]}`} aria-hidden="true" />
            }
          />
        ))}
      </nav>

      {/* KPIs ------------------------------------------------------ */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.k} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{k.k}</p>
            <p className={`mt-1.5 text-2xl font-bold sm:mt-2 sm:text-3xl ${k.tone}`}>{k.v}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-[11px]">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* Distribución + tendencia ---------------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Distribución de celdas por nivel
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {scopeLabel} · {stats.cells} celdas H3 de ~1 km
          </p>

          <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
            {LEVEL_ORDER.map((level) => {
              const share = pct(stats.byLevel[level], stats.cells);
              if (share === 0) return null;
              return (
                <span
                  key={level}
                  className={LEVEL_BG[level]}
                  style={{ width: `${share}%` }}
                  title={`${RISK_LABELS[level]}: ${stats.byLevel[level]} celdas`}
                />
              );
            })}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LEVEL_ORDER.map((level) => (
              <div key={level}>
                <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${LEVEL_BG[level]}`}
                    aria-hidden="true"
                  />
                  {RISK_LABELS[level]}
                </dt>
                <dd className="mt-1 text-lg font-bold text-foreground">
                  {stats.byLevel[level]}
                  <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">
                    {pct(stats.byLevel[level], stats.cells)}%
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="truncate text-sm font-semibold text-foreground">
              Reportes últimos 7 días
            </h2>
            <span className="text-[11px] text-muted-foreground">reparto simulado</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {scopeLabel} · {stats.reports} reportes acumulados
          </p>
          <Sparkline data={trend} />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <span key={`${d}-${i}`}>{d}</span>
            ))}
          </div>
        </section>
      </div>

      {/* Ranking de provincias ------------------------------------- */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Provincias del NOA por riesgo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Las 6 provincias de la región. Tocá una fila para filtrar todo el panel.
        </p>

        {/* Vista mobile: cards apiladas */}
        <div className="mt-3 space-y-2 md:hidden">
          {data.summaries.map((s) => {
            const total = cellsByProvince.get(s.province.id) ?? 0;
            const share = pct(s.reports, noaStats.reports);
            const active = scope === s.province.id;
            return (
              <button
                key={s.province.id}
                type="button"
                onClick={() => setScope(s.province.id)}
                aria-current={active ? "true" : undefined}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                  active ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{s.province.name}</h3>
                  <RiskBadge score={s.score} showScore={false} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.province.capital}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Score</span>
                    <p className="font-mono font-semibold text-foreground">{s.score}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reportes</span>
                    <p className="font-mono text-foreground">{s.reports}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Altas</span>
                    <p className="font-mono text-foreground">{s.highCells}/{total}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className={`block h-full ${LEVEL_BG[s.level]}`}
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{share}%</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Vista desktop: tabla completa */}
        <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Provincias del Noroeste Argentino ordenadas por score de riesgo de dengue
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  Provincia
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Capital
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Score
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nivel
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Reportes 7d
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Celdas altas
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Participación
                </th>
              </tr>
            </thead>
            <tbody>
              {data.summaries.map((s) => {
                const total = cellsByProvince.get(s.province.id) ?? 0;
                const share = pct(s.reports, noaStats.reports);
                const active = scope === s.province.id;
                return (
                  <tr
                    key={s.province.id}
                    onClick={() => setScope(s.province.id)}
                    aria-current={active ? "true" : undefined}
                    className={`cursor-pointer border-b border-border transition-colors last:border-0 ${
                      active ? "bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-foreground">
                      {s.province.name}
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">{s.province.capital}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                      {s.score}
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge score={s.score} showScore={false} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{s.reports}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      <span className={s.highCells > 0 ? "text-risk-critical" : ""}>
                        {s.highCells}
                      </span>
                      <span className="text-muted-foreground"> / {total}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                          <span
                            className={`block h-full ${LEVEL_BG[s.level]}`}
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {share}%
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Focos activos --------------------------------------------- */}
      <section className="mt-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate text-sm font-semibold text-foreground">
            Focos activos · {scopeLabel}
          </h2>
          <span className="text-[11px] text-muted-foreground">celdas H3 de mayor score</span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          {hotspots.map((cell) => (
            <article key={cell.h3} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-semibold text-foreground sm:text-sm">{cell.zone}</h3>
                  <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
                    {cell.province ? (PROVINCE_NAME.get(cell.province) ?? "NOA") : "NOA"}
                  </p>
                </div>
                <RiskBadge score={cell.score} showScore={false} />
              </div>

              <dl className="mt-2 space-y-1 text-[11px] sm:mt-3 sm:space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Score</dt>
                  <dd className={`font-mono font-semibold ${LEVEL_TEXT[cell.level]}`}>
                    {cell.score}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Reportes</dt>
                  <dd className="font-mono text-foreground">{cell.reports}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Último reporte</dt>
                  <dd className="truncate text-foreground">{cell.lastReportAt || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Lluvia</dt>
                  <dd className={cell.recentRain ? "text-risk-mid" : "text-muted-foreground"}>
                    {cell.recentRain ? `hace ${cell.rainHoursAgo} h` : "sin registro"}
                  </dd>
                </div>
              </dl>

              <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground sm:mt-3">{cell.h3}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Zonas priorizadas ----------------------------------------- */}
      <section className="mt-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate text-sm font-semibold text-foreground">
            Zonas priorizadas · {scopeLabel}
          </h2>
          <span className="text-[11px] text-muted-foreground">{zones.length} zonas</span>
        </div>

        <div className="mt-3 space-y-2">
          {zones.map((z) => {
            const intervenida = intervenedZones.includes(z.key);
            return (
              <div
                key={z.key}
                className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:gap-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground sm:text-base">{z.zone}</h3>
                    {scope === "noa" && (
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {z.provinceName}
                      </span>
                    )}
                    {intervenida && (
                      <span className="shrink-0 rounded-full border border-risk-low/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-risk-low">
                        Intervenida
                      </span>
                    )}
                    {!intervenida && z.level === "alto" && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-risk-critical/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-risk-critical">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        Prioridad
                      </span>
                    )}
                  </div>

                  <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:mt-2 sm:gap-x-4 sm:text-xs">
                    <span className="inline-flex gap-1">
                      <dt>Reportes:</dt>
                      <dd className="font-mono text-foreground">{z.reports}</dd>
                    </span>
                    <span className="inline-flex gap-1">
                      <dt>Celdas:</dt>
                      <dd className="font-mono text-foreground">{z.cells}</dd>
                    </span>
                    <span className="inline-flex gap-1">
                      <dt>En alto:</dt>
                      <dd
                        className={`font-mono ${
                          z.high > 0 ? "text-risk-critical" : "text-foreground"
                        }`}
                      >
                        {z.high}
                      </dd>
                    </span>
                    {z.rain > 0 && (
                      <span className="inline-flex items-center gap-1 text-risk-mid">
                        <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                        <dt className="sr-only">Celdas con lluvia reciente:</dt>
                        <dd>{z.rain} con lluvia</dd>
                      </span>
                    )}
                    {z.lastReportAt && (
                      <span className="inline-flex gap-1">
                        <dt>Último:</dt>
                        <dd className="text-foreground">{z.lastReportAt}</dd>
                      </span>
                    )}
                  </dl>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 lg:justify-end">
                  <RiskBadge score={z.score} />
                  <button
                    type="button"
                    onClick={() => toggleZoneIntervened(z.key)}
                    aria-pressed={intervenida}
                    className="shrink-0 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent sm:px-3 sm:py-2 sm:text-xs"
                  >
                    {intervenida ? "Reabrir" : "Marcar intervenida"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-8 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Siren className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          El backend cubre Salta capital: sus scores salen de reportes vecinales reales cruzados con
          lluvia acumulada de 7 días. Las otras cinco provincias del NOA usan la grilla simulada de
          la demo. Las intervenciones son marcas operativas y no alteran el score.
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Piezas
 * ------------------------------------------------------------------ */

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function ScopeChip({
  label,
  detail,
  active,
  onClick,
  icon,
}: {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:gap-2 sm:px-3 sm:py-2 sm:text-[13px] ${
        active
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <span className="grid h-4 w-4 place-items-center">{icon}</span>
      {label}
      <span className="hidden font-mono text-[11px] font-normal text-muted-foreground sm:inline">{detail}</span>
    </button>
  );
}

function Sparkline({ data }: { data: number[] }) {
  // Sin esto, una serie en cero divide por cero y el path sale con NaN.
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * 300,
    y: 60 - (v / max) * 52,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,64 ${line} 300,64`;

  return (
    <svg viewBox="0 0 300 64" className="h-24 w-full" role="img" aria-label="Tendencia de 7 días">
      <polygon points={area} fill="var(--risk-high)" opacity="0.12" />
      <polyline points={line} fill="none" stroke="var(--risk-high)" strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--risk-high)" />
      ))}
    </svg>
  );
}
