import { createFileRoute } from "@tanstack/react-router";
import { RiskMap } from "@/components/RiskMap";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de riesgo de dengue · Salta — Dengue Centinela" },
      {
        name: "description",
        content:
          "Mapa de calor por hexágonos H3 con el riesgo de dengue por zona, reportes vecinales y lluvia reciente.",
      },
      { property: "og:title", content: "Mapa de riesgo de dengue · Salta" },
      {
        property: "og:description",
        content: "Grilla H3 coloreada por score de riesgo, actualizada con reportes vecinales.",
      },
    ],
  }),
  component: MapaPage,
});

/**
 * Solo el mapa: ocupa todo el ancho y todo el alto disponible bajo el header.
 * El panel lateral (leyenda, contadores, botón de reporte, filtro de fechas)
 * es un componente aparte y todavía no está montado acá.
 */
function MapaPage() {
  return (
    <section
      aria-label="Mapa de riesgo de dengue en Salta"
      className="flex min-h-0 flex-1 items-stretch"
    >
      <RiskMap />
    </section>
  );
}
