// Datos simulados (MVP hackathon). En producción esto vendría de:
//   GET /risk-map      -> hexágonos H3 con score de riesgo
//   GET /zones         -> zonas y agregados
//   GET /alerts        -> historial de alertas
//   POST /reports      -> alta de reporte ciudadano

export type RiskLevel = "bajo" | "moderado" | "medio" | "alto";

export const ZONES = [
  "Centro",
  "Zona Norte",
  "Tres Cerritos",
  "Villa Soledad",
  "San Remo",
  "Zona Sur",
  "Limache",
  "El Huaico",
  "Castañares",
  "Villa Palacios",
] as const;

export type ZoneName = (typeof ZONES)[number];

export interface Hex {
  id: string;
  /** índice H3 simulado */
  h3: string;
  col: number;
  row: number;
  zone: ZoneName;
  score: number; // 0-100
  reports: number;
  lastReport: string;
  recentRain: boolean;
}

export interface Report {
  id: string;
  type: "sintomas" | "criadero" | "ambos";
  zone: ZoneName;
  hexId: string;
  symptoms: string[];
  photo: boolean;
  createdAt: string;
}

export interface Alert {
  id: string;
  date: string;
  zone: ZoneName;
  level: RiskLevel;
  score: number;
  notified: "municipio" | "vecinos" | "ambos";
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "alto";
  if (score >= 50) return "medio";
  if (score >= 28) return "moderado";
  return "bajo";
}

/** PRNG determinista para que la demo sea siempre igual */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const COLS = 9;
const ROWS = 6;

const HOTSPOT = new Set(["3-2", "4-2", "4-3", "3-3", "5-2", "4-1"]);
const WARM = new Set(["2-2", "5-3", "3-4", "6-2", "2-1"]);

export function buildHexes(): Hex[] {
  const rand = seeded(20260807);
  const hexes: Hex[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const key = `${col}-${row}`;
      const zone = ZONES[(col + row * 3) % ZONES.length] as ZoneName;
      let score: number;
      if (HOTSPOT.has(key)) score = 74 + Math.floor(rand() * 24);
      else if (WARM.has(key)) score = 50 + Math.floor(rand() * 20);
      else score = Math.floor(rand() * 26) + (rand() > 0.82 ? 16 : 0);
      const reports =
        Math.max(0, Math.round(score / 7 + (rand() * 3 - 1))) + (score > 70 ? 4 : 0);
      hexes.push({
        id: key,
        h3: `8ab1${(col * 7 + row * 13).toString(16).padStart(2, "0")}c07ffff`,
        col,
        row,
        zone,
        score,
        reports,
        lastReport: `hace ${1 + Math.floor(rand() * 46)} h`,
        recentRain: rand() > 0.45,
      });
    }
  }
  return hexes;
}

export const INITIAL_ALERTS: Alert[] = [
  {
    id: "a1",
    date: "2026-08-07 18:40",
    zone: "Villa Soledad",
    level: "alto",
    score: 88,
    notified: "ambos",
  },
  {
    id: "a2",
    date: "2026-08-07 09:12",
    zone: "Tres Cerritos",
    level: "medio",
    score: 61,
    notified: "municipio",
  },
  {
    id: "a3",
    date: "2026-08-06 20:05",
    zone: "Villa Soledad",
    level: "alto",
    score: 79,
    notified: "vecinos",
  },
  {
    id: "a4",
    date: "2026-08-05 16:30",
    zone: "Zona Norte",
    level: "medio",
    score: 55,
    notified: "municipio",
  },
  {
    id: "a5",
    date: "2026-08-04 11:20",
    zone: "Centro",
    level: "moderado",
    score: 41,
    notified: "municipio",
  },
];

export const TREND_7D = [12, 18, 15, 27, 34, 46, 58];

export const SYMPTOMS = [
  "Fiebre",
  "Dolor de cabeza",
  "Dolor muscular",
  "Dolor detrás de los ojos",
  "Sarpullido",
  "Náuseas",
];
