/**
 * Cliente del backend de Dengue Centinela (Express + Prisma, lo mantiene Mauro).
 *
 *   GET  /status      -> zonas con el score actual por barrio
 *   POST /recalcular  -> corre el Agente 3 (reportes 7d + lluvia) y devuelve
 *                        el mismo formato que /status
 *
 * El contrato lo fija el equipo: no se cambia desde el frontend.
 */
import { MOCK_STATUS, jitterStatus } from "./mock-status";

export interface StatusZona {
  barrio: string;
  lat: number;
  lng: number;
  /** 0-100 */
  score: number;
  reportes_7d: number;
  /** "bajo" | "medio" | "alto" — el backend lo traduce desde mm de lluvia. */
  factor_clima: string;
}

export interface StatusResponse {
  zonas: StatusZona[];
  ultima_actualizacion: string;
}

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

/** Con VITE_USE_MOCK=true el mapa funciona sin backend levantado. */
export const USING_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export const API_BASE = API_URL;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * El backend puede estar a medio hacer o devolver un campo raro: normalizamos
 * para que el mapa no se caiga en medio de la demo. Descartamos zonas sin
 * coordenadas validas porque no se pueden ubicar en la grilla H3.
 */
function normalize(raw: unknown): StatusResponse {
  const obj = (raw ?? {}) as { zonas?: unknown; ultima_actualizacion?: unknown };
  const list = Array.isArray(obj.zonas) ? obj.zonas : [];

  const zonas: StatusZona[] = [];
  for (const item of list) {
    const z = (item ?? {}) as Record<string, unknown>;
    const lat = Number(z["lat"]);
    const lng = Number(z["lng"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    zonas.push({
      barrio: String(z["barrio"] ?? "Sin nombre"),
      lat,
      lng,
      score: clamp(Math.round(Number(z["score"]) || 0), 0, 100),
      reportes_7d: Math.max(0, Math.round(Number(z["reportes_7d"]) || 0)),
      factor_clima: String(z["factor_clima"] ?? "bajo").toLowerCase(),
    });
  }

  return {
    zonas,
    ultima_actualizacion:
      typeof obj.ultima_actualizacion === "string"
        ? obj.ultima_actualizacion
        : new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Modo simulado
 * ------------------------------------------------------------------ */

// Estado mutable: sin esto, "Actualizar mapa" no mostraria ningun cambio
// mientras el backend no este listo, y ese es el momento clave del pitch.
let mockState: StatusResponse = MOCK_STATUS;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * API publica
 * ------------------------------------------------------------------ */

export async function getStatus(): Promise<StatusResponse> {
  if (USING_MOCK) {
    await delay(200);
    mockState = { ...mockState, ultima_actualizacion: new Date().toISOString() };
    return mockState;
  }

  const res = await fetch(`${API_URL}/status`);
  if (!res.ok) throw new Error(`GET /status respondió ${res.status}`);
  return normalize(await res.json());
}

export async function postRecalcular(): Promise<StatusResponse> {
  if (USING_MOCK) {
    await delay(700); // el recalculo real tarda: evitamos un flash instantaneo
    mockState = jitterStatus(mockState);
    return mockState;
  }

  const res = await fetch(`${API_URL}/recalcular`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /recalcular respondió ${res.status}`);

  // El backend devuelve el payload completo en el POST (ver
  // backend/src/routes/recalcular.js), así que normalmente no hace falta otra
  // vuelta. El fallback cubre el caso de que en algún momento el POST pase a
  // responder sólo un ack: el orden siempre es recalcular y después leer.
  const recalculado = normalize(await res.json());
  if (recalculado.zonas.length > 0) return recalculado;

  return getStatus();
}
