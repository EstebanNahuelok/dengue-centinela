import { createFileRoute } from "@tanstack/react-router";
import { RiskBadge } from "@/components/RiskBadge";
import { useAppState } from "@/lib/store";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Historial de alertas — Dengue Centinela" },
      {
        name: "description",
        content:
          "Timeline de alertas disparadas por zona: nivel de riesgo, fecha y destinatarios notificados.",
      },
      { property: "og:title", content: "Historial de alertas — Dengue Centinela" },
      {
        property: "og:description",
        content: "Registro de alertas automáticas enviadas al municipio y a los vecinos.",
      },
    ],
  }),
  component: AlertasPage,
});

const NOTIF: Record<string, string> = {
  municipio: "Municipio",
  vecinos: "Vecinos cercanos",
  ambos: "Municipio + vecinos",
};

function AlertasPage() {
  // GET /alerts?limit=50
  const { alerts } = useAppState();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">Historial de alertas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Se dispara automáticamente cuando una zona supera el umbral de riesgo.
      </p>

      <ol className="mt-6 space-y-0">
        {alerts.map((a, i) => (
          <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 h-3 w-3 rounded-full bg-risk-high" />
              {i < alerts.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="pb-6">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{a.zone}</p>
                  <p className="text-xs text-muted-foreground">{a.date}</p>
                </div>
                <RiskBadge score={a.score} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Notificado a: <span className="text-foreground">{NOTIF[a.notified]}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
