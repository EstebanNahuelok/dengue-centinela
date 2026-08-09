import {
  cellToBoundary,
  cellToLatLng,
  gridDisk,
  gridDistance,
  latLngToCell,
  polygonToCells,
} from "h3-js";

import type { StatusZona } from "./api";
import { riskLevel, type RiskLevel } from "./mock-data";

/**
 * Datos simulados del mapa de riesgo del NOA (grilla H3 real).
 *
 * En producción esto se reemplaza por:
 *   GET /risk-map?res=8&bbox=…&from=…&to=…        -> detalle urbano
 *   GET /risk-map?res=4&region=noa&from=…&to=…    -> vista regional agregada
 *   -> { cells: [{ h3, score, reports, lastReportAt, recentRain, rainHoursAgo, zone }] }
 * Los polígonos se derivan del índice H3 con cellToBoundary(), igual que acá.
 */

export type LatLng = [number, number];

/** Resolución H3 del detalle urbano: celdas de ~1 km de lado a lado. */
export const H3_DETAIL_RES = 8;
/** Resolución H3 de la vista regional: celdas de ~45 km. */
export const H3_REGION_RES = 4;
/** Desde este zoom se muestra el detalle urbano en lugar de la vista regional. */
export const DETAIL_ZOOM = 10;

export const RISK_COLORS: Record<RiskLevel, string> = {
  bajo: "#2DD4BF",
  moderado: "#34D399",
  medio: "#FBBF24",
  alto: "#F87171",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  bajo: "Bajo",
  moderado: "Moderado",
  medio: "Medio",
  alto: "Alto",
};

/**
 * Silueta aproximada del Noroeste Argentino (Jujuy, Salta, Tucumán, Catamarca,
 * Santiago del Estero y La Rioja). Recorta la grilla regional para no generar
 * celdas sobre Chile, Bolivia ni el resto del país.
 */
const NOA_OUTLINE: LatLng[] = [
  [-22.0, -67.2],
  [-22.0, -66.3],
  [-22.05, -64.5],
  [-22.2, -62.9],
  [-24.1, -62.2],
  [-26.2, -61.8],
  [-28.5, -61.9],
  [-29.3, -62.2],
  [-30.0, -62.6],
  [-30.1, -63.5],
  [-30.4, -65.5],
  [-30.6, -66.5],
  [-30.4, -67.3],
  [-29.0, -68.9],
  [-27.5, -68.6],
  [-26.0, -68.6],
  [-24.5, -68.3],
  [-23.0, -67.5],
];

/** Límite de navegación del mapa: [[sur, oeste], [norte, este]]. */
export const NOA_BOUNDS: [LatLng, LatLng] = [
  [-30.9, -69.3],
  [-21.6, -61.2],
];

export const NOA_CENTER: LatLng = [-26.3, -65.3];

export type ProvinceId = "jujuy" | "salta" | "tucuman" | "santiago" | "catamarca" | "rioja";

interface Outbreak {
  at: LatLng;
  peak: number;
  decay: number;
  rings: number;
}

export interface Province {
  id: ProvinceId;
  name: string;
  capital: string;
  /** centro del área urbana principal */
  center: LatLng;
  /** zoom al que se enfoca desde la barra lateral */
  zoom: number;
  /** intensidad de la provincia en la vista regional (0-100) */
  baseRisk: number;
  /** anillos de la grilla urbana de detalle */
  rings: number;
  outbreaks: Outbreak[];
  /** barrios y localidades reales del área metropolitana */
  zones: { name: string; center: LatLng }[];
}

/**
 * Las 6 provincias del NOA. Los focos de brote son simulados; Salta concentra
 * el caso de uso principal de la demo.
 */
export const NOA_PROVINCES: Province[] = [
  {
    id: "jujuy",
    name: "Jujuy",
    capital: "San Salvador de Jujuy",
    center: [-24.1858, -65.2995],
    zoom: 13,
    baseRisk: 68,
    rings: 5,
    outbreaks: [{ at: [-24.2062, -65.2795], peak: 78, decay: 20, rings: 3 }],
    zones: [
      { name: "Centro", center: [-24.1876, -65.2989] },
      { name: "Ciudad de Nieva", center: [-24.1699, -65.3161] },
      { name: "Alto Comedero", center: [-24.2318, -65.2604] },
      { name: "Los Perales", center: [-24.2004, -65.2757] },
      { name: "Palpalá", center: [-24.2556, -65.2094] },
    ],
  },
  {
    id: "salta",
    name: "Salta",
    capital: "Salta",
    center: [-24.7859, -65.4117],
    zoom: 13,
    baseRisk: 96,
    rings: 8,
    outbreaks: [
      // Foco principal: Zona Norte / Tres Cerritos
      { at: [-24.7702, -65.4008], peak: 96, decay: 18, rings: 4 },
      // Foco secundario, más chico: Limache / Sur
      { at: [-24.8118, -65.4331], peak: 80, decay: 20, rings: 3 },
    ],
    zones: [
      { name: "Castañares", center: [-24.7497, -65.4262] },
      { name: "B° El Huaico", center: [-24.7418, -65.4021] },
      { name: "Grand Bourg", center: [-24.7566, -65.4402] },
      { name: "Zona Norte", center: [-24.7621, -65.4092] },
      { name: "Tres Cerritos", center: [-24.7744, -65.3968] },
      { name: "Centro", center: [-24.7893, -65.4106] },
      { name: "San Luis", center: [-24.8001, -65.4463] },
      { name: "Limache", center: [-24.8062, -65.4287] },
      { name: "La Silleta", center: [-24.8158, -65.4762] },
      { name: "Sur", center: [-24.8214, -65.4131] },
    ],
  },
  {
    id: "tucuman",
    name: "Tucumán",
    capital: "San Miguel de Tucumán",
    center: [-26.8083, -65.2176],
    zoom: 13,
    baseRisk: 82,
    rings: 6,
    outbreaks: [{ at: [-26.8321, -65.1868], peak: 88, decay: 19, rings: 3 }],
    zones: [
      { name: "Centro", center: [-26.8241, -65.2032] },
      { name: "Tafí Viejo", center: [-26.7333, -65.2833] },
      { name: "Yerba Buena", center: [-26.8167, -65.3167] },
      { name: "Banda del Río Salí", center: [-26.8397, -65.1725] },
      { name: "Alderetes", center: [-26.8167, -65.1333] },
    ],
  },
  {
    id: "santiago",
    name: "Santiago del Estero",
    capital: "Santiago del Estero",
    center: [-27.7951, -64.2615],
    zoom: 13,
    baseRisk: 56,
    rings: 5,
    outbreaks: [{ at: [-27.7712, -64.2402], peak: 62, decay: 18, rings: 2 }],
    zones: [
      { name: "Centro", center: [-27.7951, -64.2615] },
      { name: "La Banda", center: [-27.7333, -64.25] },
      { name: "B° Jorge Newbery", center: [-27.8112, -64.2887] },
      { name: "Autonomía", center: [-27.8214, -64.2402] },
      { name: "Sur", center: [-27.8354, -64.2661] },
    ],
  },
  {
    id: "catamarca",
    name: "Catamarca",
    capital: "San Fernando del Valle de Catamarca",
    center: [-28.4696, -65.7852],
    zoom: 13,
    baseRisk: 34,
    rings: 5,
    outbreaks: [{ at: [-28.4581, -65.7614], peak: 44, decay: 14, rings: 2 }],
    zones: [
      { name: "Centro", center: [-28.4696, -65.7852] },
      { name: "Valle Viejo", center: [-28.4667, -65.7167] },
      { name: "Fray M. Esquiú", center: [-28.4, -65.75] },
      { name: "Villa Cubas", center: [-28.4494, -65.8004] },
      { name: "B° 200 Viviendas", center: [-28.4912, -65.8046] },
    ],
  },
  {
    id: "rioja",
    name: "La Rioja",
    capital: "La Rioja",
    center: [-29.4131, -66.8558],
    zoom: 13,
    baseRisk: 26,
    rings: 5,
    outbreaks: [{ at: [-29.4004, -66.8321], peak: 38, decay: 12, rings: 2 }],
    zones: [
      { name: "Centro", center: [-29.4131, -66.8558] },
      { name: "B° Vargas", center: [-29.3921, -66.8461] },
      { name: "Antártida", center: [-29.4287, -66.8812] },
      { name: "J. V. González", center: [-29.4318, -66.8321] },
      { name: "Sur", center: [-29.4402, -66.8604] },
    ],
  },
];

export type CellScope = "region" | "detail";

export interface RiskCell {
  /** índice H3 real de la celda */
  h3: string;
  scope: CellScope;
  center: LatLng;
  /** anillo del hexágono en [lat, lng], listo para Leaflet */
  boundary: LatLng[];
  score: number;
  level: RiskLevel;
  /** barrio (detalle) o provincia (regional) */
  zone: string;
  province: ProvinceId | null;
  reports: number;
  /** fecha y hora formateada del último reporte vecinal */
  lastReportAt: string;
  recentRain: boolean;
  rainHoursAgo: number;
}

export interface ProvinceSummary {
  province: Province;
  /** score máximo de la provincia */
  score: number;
  level: RiskLevel;
  reports: number;
  /** celdas urbanas en riesgo alto */
  highCells: number;
}

export interface RiskMapData {
  region: RiskCell[];
  detail: RiskCell[];
  summaries: ProvinceSummary[];
}

/** Momento de referencia de la demo (fijo, para que SSR y cliente coincidan). */
const DEMO_NOW_MS = Date.UTC(2026, 7, 8, 23, 10); // 2026-08-08 20:10 (UTC-3)
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Formatea en hora de Argentina sin depender del timezone del runtime. */
function formatStamp(ms: number) {
  const d = new Date(ms - ARG_OFFSET_MS);
  const month = MONTHS[d.getUTCMonth()] ?? "ago";
  return `${pad(d.getUTCDate())} ${month} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Hash determinista (FNV-1a) para que la demo se vea siempre igual. */
function hashSeed(text: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pseudoaleatorio determinista en [0, 1) a partir de la celda. */
function rand(h3: string, salt: number) {
  let s = hashSeed(h3, salt) || 1;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >> 17;
  s ^= s << 5;
  s >>>= 0;
  return s / 4294967296;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Distancia aproximada en km, suficiente a escala regional. */
export function distanceKm(a: LatLng, b: LatLng) {
  const dLat = (a[0] - b[0]) * 110.574;
  const dLng = (a[1] - b[1]) * 111.32 * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** gridDistance lanza si las celdas están demasiado lejos: es "fuera del foco". */
function ringDistance(from: string, to: string) {
  try {
    return gridDistance(from, to);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Deriva el resto de los atributos simulados a partir del score. */
function cellFacts(h3: string, score: number, level: RiskLevel, weight: number) {
  const reports = Math.max(
    0,
    Math.round(
      (score / 8 + Math.floor(rand(h3, 53) * 3) - 1 + (level === "alto" ? 4 : 0)) * weight,
    ),
  );
  // Cuanto más alto el riesgo, más reciente el último reporte.
  const window = level === "alto" ? 9 : level === "medio" ? 26 : 96;
  const hoursAgo = 1 + Math.floor(rand(h3, 67) * window);
  return {
    reports,
    lastReportAt: formatStamp(DEMO_NOW_MS - hoursAgo * 60 * 60 * 1000),
    recentRain: rand(h3, 79) < 0.22 + score / 200,
    // La lluvia reciente es uno de los disparadores del riesgo: en las celdas
    // calientes es más cercana en el tiempo.
    rainHoursAgo: 2 + Math.floor(rand(h3, 83) * (level === "alto" ? 14 : 34)),
  };
}

function nearestZone(province: Province, center: LatLng) {
  let best = province.zones[0]?.name ?? province.name;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const zone of province.zones) {
    const dist = distanceKm(center, zone.center);
    if (dist < bestDist) {
      bestDist = dist;
      best = zone.name;
    }
  }
  return best;
}

/** Grilla urbana de detalle: el gradiente baja de vecino a vecino desde cada foco. */
function buildDetailCells(): RiskCell[] {
  const cells: RiskCell[] = [];

  for (const province of NOA_PROVINCES) {
    const origin = latLngToCell(province.center[0], province.center[1], H3_DETAIL_RES);
    const outbreakCells = province.outbreaks.map((o) =>
      latLngToCell(o.at[0], o.at[1], H3_DETAIL_RES),
    );

    for (const h3 of gridDisk(origin, province.rings)) {
      // Base "normal" de la ciudad: casi todo bajo, con algo de textura moderada.
      let score = 6 + Math.round(rand(h3, 11) * 20);
      if (rand(h3, 29) > 0.88) score += 14;

      province.outbreaks.forEach((outbreak, i) => {
        const target = outbreakCells[i];
        if (!target) return;
        const d = ringDistance(h3, target);
        if (d > outbreak.rings) return;
        const jitter = d === 0 ? 0 : Math.round((rand(h3, 41 + i) - 0.5) * 7);
        score = Math.max(score, outbreak.peak - d * outbreak.decay + jitter);
      });

      score = clamp(Math.round(score), 4, 99);
      const level = riskLevel(score);
      const center = cellToLatLng(h3) as LatLng;

      cells.push({
        h3,
        scope: "detail",
        center,
        boundary: cellToBoundary(h3) as LatLng[],
        score,
        level,
        zone: nearestZone(province, center),
        province: province.id,
        ...cellFacts(h3, score, level, 1),
      });
    }
  }

  return cells;
}

/**
 * Grilla regional: cubre el NOA y decae con la distancia a cada área urbana,
 * así el degradé también se lee a escala de región.
 */
function buildRegionCells(): RiskCell[] {
  const indexes = polygonToCells(NOA_OUTLINE, H3_REGION_RES);

  return indexes.map((h3) => {
    const center = cellToLatLng(h3) as LatLng;

    let score = 4 + Math.round(rand(h3, 17) * 12);
    let province: ProvinceId | null = null;
    let zone = "NOA";

    for (const candidate of NOA_PROVINCES) {
      const d = distanceKm(center, candidate.center);
      const value = candidate.baseRisk - d * 0.5 + Math.round((rand(h3, 37) - 0.5) * 6);
      if (value > score) {
        score = value;
        province = candidate.id;
        zone = candidate.name;
      }
    }

    score = clamp(Math.round(score), 4, 99);
    const level = riskLevel(score);

    return {
      h3,
      scope: "region" as const,
      center,
      boundary: cellToBoundary(h3) as LatLng[],
      score,
      level,
      zone,
      province,
      // Una celda regional agrega muchos barrios: los reportes escalan.
      ...cellFacts(h3, score, level, 6),
    };
  });
}

function buildSummaries(detail: RiskCell[]): ProvinceSummary[] {
  return NOA_PROVINCES.map((province) => {
    const own = detail.filter((c) => c.province === province.id);
    const score = own.reduce((max, c) => Math.max(max, c.score), 0);
    return {
      province,
      score,
      level: riskLevel(score),
      reports: own.reduce((sum, c) => sum + c.reports, 0),
      highCells: own.filter((c) => c.level === "alto").length,
    };
  }).sort((a, b) => b.score - a.score);
}

let cache: RiskMapData | null = null;

/** Datos del mapa de riesgo (memoizados: el cálculo H3 corre una sola vez). */
export function getRiskMapData(): RiskMapData {
  if (!cache) {
    const detail = buildDetailCells();
    cache = { region: buildRegionCells(), detail, summaries: buildSummaries(detail) };
  }
  return cache;
}

/* ------------------------------------------------------------------ *
 * Datos reales del backend (GET /status)
 * ------------------------------------------------------------------ */

/**
 * Caída del score por anillo H3 al alejarse del centroide del barrio.
 * Mismo orden que el decay de los focos simulados (18-20), así el degradé
 * mantiene el lenguaje visual del mapa. Con celdas de 0,86 km, un barrio
 * con score 90 deja de influir a ~5 anillos (4,3 km).
 */
const BARRIO_DECAY = 18;

/** Piso urbano para celdas sin ningún barrio cerca. */
const URBAN_FLOOR = 4;

interface BarrioAnchor extends StatusZona {
  /** celda H3 res 8 donde cae el centroide del barrio */
  h3: string;
  center: LatLng;
}

function summarizeProvince(province: Province, cells: RiskCell[]): ProvinceSummary {
  const score = cells.reduce((max, c) => Math.max(max, c.score), 0);
  return {
    province,
    score,
    level: riskLevel(score),
    reports: cells.reduce((sum, c) => sum + c.reports, 0),
    highCells: cells.filter((c) => c.level === "alto").length,
  };
}

/**
 * Pinta la grilla urbana de Salta con los datos reales de GET /status.
 *
 * Cada barrio actúa como foco: su score decae por anillo H3, igual que los
 * brotes simulados, de modo que 10 puntos se leen como mancha de calor y no
 * como 10 hexágonos aislados. Cada celda se atribuye a su barrio más cercano,
 * y de ahí toma reportes y factor climático.
 *
 * Las otras 5 provincias del NOA y la vista regional (res 4) siguen simuladas:
 * el backend sólo cubre Salta capital. Devuelve objetos nuevos para no
 * contaminar el cache de getRiskMapData().
 */
export function applyStatusToRiskMap(base: RiskMapData, zonas: StatusZona[]): RiskMapData {
  if (zonas.length === 0) return base;

  const anchors: BarrioAnchor[] = zonas.map((zona) => ({
    ...zona,
    h3: latLngToCell(zona.lat, zona.lng, H3_DETAIL_RES),
    center: [zona.lat, zona.lng] as LatLng,
  }));

  const detail = base.detail.map<RiskCell>((cell) => {
    if (cell.province !== "salta") return cell;

    let score = URBAN_FLOOR;
    let nearest: BarrioAnchor | null = null;
    let nearestKm = Number.POSITIVE_INFINITY;

    for (const anchor of anchors) {
      const rings = ringDistance(cell.h3, anchor.h3);
      if (Number.isFinite(rings)) {
        score = Math.max(score, anchor.score - rings * BARRIO_DECAY);
      }
      const km = distanceKm(cell.center, anchor.center);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = anchor;
      }
    }

    score = clamp(Math.round(score), URBAN_FLOOR, 100);
    const level = riskLevel(score);

    return {
      ...cell,
      score,
      level,
      zone: nearest?.barrio ?? cell.zone,
      // /status informa los reportes por barrio, no por celda.
      reports: nearest?.reportes_7d ?? 0,
      // /status no trae fecha del último reporte: se oculta en lugar de inventarla.
      lastReportAt: "",
      recentRain: nearest !== null && nearest.factor_clima !== "bajo",
      rainHoursAgo: nearest?.factor_clima === "alto" ? 3 : 14,
    };
  });

  const summaries = base.summaries
    .map((summary) =>
      summary.province.id === "salta"
        ? summarizeProvince(
            summary.province,
            detail.filter((cell) => cell.province === "salta"),
          )
        : summary,
    )
    .sort((a, b) => b.score - a.score);

  return { region: base.region, detail, summaries };
}
