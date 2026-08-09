/**
 * Datos simulados con el MISMO shape que devuelve GET /status.
 * Sirven para laburar el mapa sin depender de que el backend este levantado
 * (VITE_USE_MOCK=true).
 *
 * Los barrios son los 10 de backend/src/utils/barrios.js, pero las coordenadas
 * estan corregidas contra OpenStreetMap (Nominatim). Las del backend tienen
 * varios barrios desplazados entre 3 y 10 km — hay un TODO de Mauro al
 * respecto. Cuando las arregle, mock y backend van a coincidir.
 */
import type { StatusResponse } from "./api";

export const MOCK_STATUS: StatusResponse = {
  zonas: [
    // Foco principal: Centro / Tres Cerritos / Villa Mitre
    {
      barrio: "Tres Cerritos",
      lat: -24.7684,
      lng: -65.3926,
      score: 88,
      reportes_7d: 12,
      factor_clima: "alto",
    },
    {
      barrio: "Villa Mitre",
      lat: -24.792,
      lng: -65.418,
      score: 79,
      reportes_7d: 10,
      factor_clima: "alto",
    },
    {
      barrio: "Centro",
      lat: -24.7859,
      lng: -65.4117,
      score: 72,
      reportes_7d: 8,
      factor_clima: "alto",
    },
    {
      barrio: "Villa Soledad",
      lat: -24.8011,
      lng: -65.4016,
      score: 63,
      reportes_7d: 7,
      factor_clima: "medio",
    },
    {
      barrio: "Santa Lucía",
      lat: -24.758,
      lng: -65.431,
      score: 54,
      reportes_7d: 5,
      factor_clima: "medio",
    },
    // Foco secundario, mas chico: Limache al sur
    {
      barrio: "Limache",
      lat: -24.848,
      lng: -65.431,
      score: 76,
      reportes_7d: 9,
      factor_clima: "alto",
    },
    {
      barrio: "Castañares",
      lat: -24.7309,
      lng: -65.4013,
      score: 41,
      reportes_7d: 3,
      factor_clima: "medio",
    },
    {
      barrio: "San Remo",
      lat: -24.8295,
      lng: -65.4237,
      score: 35,
      reportes_7d: 3,
      factor_clima: "medio",
    },
    {
      barrio: "Grand Bourg",
      lat: -24.7761,
      lng: -65.4467,
      score: 26,
      reportes_7d: 2,
      factor_clima: "bajo",
    },
    {
      barrio: "Solidaridad",
      lat: -24.8429,
      lng: -65.4027,
      score: 22,
      reportes_7d: 1,
      factor_clima: "bajo",
    },
  ],
  ultima_actualizacion: "2026-08-08T18:30:00Z",
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const CLIMAS = ["bajo", "medio", "alto"] as const;

/**
 * Mueve un poco los numeros para que el boton "Actualizar mapa" produzca un
 * cambio visible aunque el backend todavia no este conectado.
 */
export function jitterStatus(previous: StatusResponse): StatusResponse {
  return {
    zonas: previous.zonas.map((z) => {
      // Sesgo levemente positivo: en la demo el riesgo tiende a moverse.
      const delta = Math.round((Math.random() - 0.42) * 22);
      const score = clamp(z.score + delta, 4, 100);
      const saltoReportes = delta > 8 ? 1 : delta < -8 ? -1 : 0;
      const clima =
        score >= 70 ? "alto" : score >= 40 ? "medio" : CLIMAS[Math.floor(Math.random() * 2)]!;

      return {
        ...z,
        score,
        reportes_7d: Math.max(0, z.reportes_7d + saltoReportes),
        factor_clima: clima,
      };
    }),
    ultima_actualizacion: new Date().toISOString(),
  };
}
