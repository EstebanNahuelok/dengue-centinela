import { useSyncExternalStore } from "react";
import {
  buildHexes,
  INITIAL_ALERTS,
  riskLevel,
  type Alert,
  type Hex,
  type Report,
  type ZoneName,
} from "./mock-data";

interface State {
  hexes: Hex[];
  reports: Report[];
  alerts: Alert[];
  /**
   * Zonas marcadas como intervenidas por una cuadrilla. La clave es
   * "<provincia>:<zona>" porque el panel cubre las 6 provincias del NOA y los
   * nombres de barrio se repiten entre ellas (casi todas tienen un "Centro").
   */
  intervenedZones: string[];
}

let state: State = {
  hexes: buildHexes(),
  reports: [],
  alerts: INITIAL_ALERTS,
  intervenedZones: [],
};

const listeners = new Set<() => void>();
function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState() {
  return state;
}

export function useAppState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Alta de reporte. En producción: POST /reports  (multipart con la foto)
 * y luego revalidación de GET /risk-map. Acá subimos el score localmente
 * para que la demo muestre el hexágono cambiando de nivel.
 */
export function addReport(input: {
  type: Report["type"];
  zone: ZoneName;
  hexId: string;
  symptoms: string[];
  photo: boolean;
}) {
  const report: Report = {
    ...input,
    id: `r${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  const bump = input.type === "ambos" ? 22 : input.type === "criadero" ? 16 : 14;
  const hexes = state.hexes.map((h) => {
    if (h.id !== input.hexId) return h;
    return {
      ...h,
      score: Math.min(100, h.score + bump),
      reports: h.reports + 1,
      lastReport: "hace instantes",
    };
  });

  const target = hexes.find((h) => h.id === input.hexId);
  const alerts = [...state.alerts];
  if (target && riskLevel(target.score) === "alto") {
    alerts.unshift({
      id: `a${Date.now()}`,
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      zone: target.zone,
      level: "alto",
      score: target.score,
      notified: "ambos",
    });
  }

  state = { ...state, hexes, reports: [report, ...state.reports], alerts };
  emit();
  return { report, hex: target };
}

/**
 * Marca o desmarca una zona como intervenida. En producción:
 *   POST   /zones/:id/interventions
 *   DELETE /zones/:id/interventions
 *
 * Es una marca operativa (cuadrilla despachada), no toca el score: el riesgo
 * lo recalcula el Agente 3 con reportes y lluvia reales, no el panel.
 */
export function toggleZoneIntervened(key: string) {
  const intervenedZones = state.intervenedZones.includes(key)
    ? state.intervenedZones.filter((z) => z !== key)
    : [...state.intervenedZones, key];
  state = { ...state, intervenedZones };
  emit();
}

export function zoneAggregates(hexes: Hex[]) {
  const map = new Map<
    ZoneName,
    { zone: ZoneName; score: number; reports: number; hexes: number }
  >();
  for (const h of hexes) {
    const cur = map.get(h.zone) ?? { zone: h.zone, score: 0, reports: 0, hexes: 0 };
    cur.score = Math.max(cur.score, h.score);
    cur.reports += h.reports;
    cur.hexes += 1;
    map.set(h.zone, cur);
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}
