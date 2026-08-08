import { createFileRoute, Link } from "@tanstack/react-router";
import { CentinelaIcon } from "@/components/brand/Logo";
import { useAppState } from "@/lib/store";
import { riskLevel } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dengue Centinela — Vigilancia comunitaria de dengue en Salta" },
      {
        name: "description",
        content:
          "Reportá síntomas o criaderos y mirá el mapa de riesgo por hexágonos en tiempo real para tu zona de Salta.",
      },
      { property: "og:title", content: "Dengue Centinela — Vigilancia comunitaria de dengue" },
      {
        property: "og:description",
        content: "Reportes vecinales + datos climáticos = mapa de riesgo y alertas tempranas.",
      },
    ],
  }),
  component: Home,
});

const STEPS = [
  {
    n: "01",
    title: "Reportá",
    body: "Vecinos informan síntomas o agua estancada con foto, por WhatsApp o desde la web. Toma menos de un minuto.",
  },
  {
    n: "02",
    title: "Cruzamos con el clima",
    body: "Un agente combina cada reporte con lluvia reciente y temperatura para estimar el riesgo real de criaderos.",
  },
  {
    n: "03",
    title: "Mapa de calor",
    body: "El riesgo se calcula sobre una grilla de hexágonos H3, no por barrio: precisión de cuadra, no de mancha.",
  },
  {
    n: "04",
    title: "Alerta temprana",
    body: "Cuando una zona supera el umbral, se notifica automáticamente al municipio y a los vecinos cercanos.",
  },
];

function Home() {
  const { hexes, reports } = useAppState();
  const activos = hexes.reduce((a, h) => a + h.reports, 0) + reports.length;
  const enAlerta = hexes.filter((h) => riskLevel(h.score) === "alto").length;

  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-risk-low" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-risk-low" />
              </span>
              Monitoreo activo · Salta capital
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Vigilancia comunitaria de dengue, cuadra por cuadra
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Los reportes de los vecinos, cruzados con datos climáticos, se convierten en un mapa
              de riesgo en tiempo real y en alertas tempranas para el municipio.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/reportar"
                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Reportar
              </Link>
              <Link
                to="/mapa"
                className="rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Ver el mapa
              </Link>
            </div>
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-3">
              {[
                { k: "Reportes activos", v: activos },
                { k: "Hexágonos en alerta", v: enAlerta },
                { k: "Zonas monitoreadas", v: 10 },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-border bg-card p-3">
                  <dt className="text-xs text-muted-foreground">{s.k}</dt>
                  <dd className="mt-1 text-2xl font-bold text-foreground">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex justify-center">
            <div className="rounded-3xl border border-border bg-card p-10">
              <CentinelaIcon className="h-52 w-auto text-foreground" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl font-bold text-foreground">Cómo funciona</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <article key={s.n} className="rounded-2xl border border-border bg-card p-5">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">Escala de riesgo</p>
            <div className="risk-scale mt-3 h-2 w-full rounded-full" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Riesgo bajo</span>
              <span>Medio</span>
              <span>Alto</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
