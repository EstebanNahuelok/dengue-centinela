/**
 * Predicción de riesgo futuro por barrio.
 *
 * No es un modelo entrenado ni una "IA que adivina": es un modelo explícito
 * basado en la biología del Aedes aegypti y alimentado con el pronóstico real de
 * Open-Meteo (gratis, sin API key). Todo lo que entra al cálculo se devuelve en
 * `factores`, así se puede mostrar en pantalla y defender ante un jurado.
 *
 * Idea central: la lluvia de hoy no contagia hoy. Deja agua estancada, ahí se
 * cría el mosquito y recién 7-10 días después hay adultos capaces de transmitir.
 * Entonces, para proyectar el riesgo del día H, mira la lluvia de la ventana
 * H-12 .. H-5, y la pondera por temperatura: por debajo de ~15 °C el desarrollo
 * larvario se frena, y alrededor de 27 °C es óptimo.
 *
 * Corre como server function: una sola llamada a Open-Meteo con todos los
 * barrios en lugar de una por barrio desde el navegador.
 */
import { createServerFn } from "@tanstack/react-start";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 12000;

/** Días de historial que pedimos: la ventana de cría de +7d cae en el pasado. */
const PAST_DAYS = 14;
const FORECAST_DAYS = 16;

/** Horizontes ofrecidos en la UI. */
export const HORIZONTES = [7, 14] as const;
export type Horizonte = (typeof HORIZONTES)[number];

/**
 * De dónde sale el clima que alimenta la proyección.
 *
 * - "real"      : pronóstico de Open-Meteo. Es lo honesto, pero en agosto Salta
 *                 está en invierno (0 mm, mínimas de 0-6 °C) y el modelo predice
 *                 que el riesgo baja. Correcto, poco vistoso.
 * - "temporada" : escenario SIMULADO de temporada de dengue (verano, nov-mar).
 *                 Sirve para mostrar cómo responde el modelo cuando las
 *                 condiciones importan. Se rotula en pantalla como simulado.
 *
 * En los dos casos el modelo es el mismo: sólo cambia la serie climática que
 * entra. Nunca se falsea el resultado.
 */
export const ESCENARIOS = ["real", "temporada"] as const;
export type Escenario = (typeof ESCENARIOS)[number];

/** Cuánto del riesgo actual sobrevive una semana sin nueva cría. */
const DECAY_SEMANAL = 0.72;
/** Techo del aporte de la lluvia, para que un temporal no sature todo en 100. */
const TOPE_LLUVIA = 45;
/** Techo del aporte de los reportes vecinales vigentes. */
const TOPE_REPORTES = 15;
/** Por debajo de esta media el desarrollo larvario se frena. */
const TEMP_MINIMA = 15;
/** Rango sobre TEMP_MINIMA hasta el óptimo (~27 °C). */
const TEMP_RANGO = 12;

export interface ZonaParaPredecir {
  barrio: string;
  lat: number;
  lng: number;
  score: number;
  reportes_7d: number;
}

export interface FactoresPrediccion {
  /** mm acumulados en la ventana de cría relevante para el horizonte */
  lluviaMm: number;
  /** temperatura media (°C) de esa ventana */
  tempMedia: number;
  /** 0-1: qué tan favorable está la temperatura para el desarrollo larvario */
  factorTemp: number;
  /** primer y último día de la ventana considerada (ISO corto) */
  ventana: { desde: string; hasta: string };
}

export interface ZonaPredicha extends ZonaParaPredecir {
  /** score proyectado 0-100 */
  scoreProyectado: number;
  /** scoreProyectado - score */
  delta: number;
  factores: FactoresPrediccion;
}

export type ResultadoPrediccion =
  | {
      ok: true;
      horizonte: number;
      escenario: Escenario;
      generadoEn: string;
      zonas: ZonaPredicha[];
      /** promedios para el resumen de pantalla */
      resumen: { lluviaMm: number; tempMedia: number; suben: number; bajan: number };
    }
  | { ok: false; error: string };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

interface DailyOpenMeteo {
  time: string[];
  precipitation_sum: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
}

/* ------------------------------------------------------------------ *
 * Escenario simulado de temporada
 * ------------------------------------------------------------------ */

/** Hash FNV-1a: misma técnica que risk-map.ts, para que la demo sea estable. */
function semilla(texto: string) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG determinista (mulberry32). Mismo barrio -> misma serie, siempre. */
function prng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Serie diaria simulada con perfil de verano salteño (temporada de dengue):
 * lluvias frecuentes con algún evento fuerte, máximas de 27-34 °C y mínimas
 * que no bajan de ~18 °C, así el factor de temperatura queda cerca del óptimo.
 *
 * A diferencia del pronóstico real, varía POR BARRIO: la grilla de Open-Meteo
 * es de ~11 km y les da el mismo clima a barrios vecinos, con lo cual el mapa
 * quedaba plano.
 */
function serieSimulada(barrio: string): DailyOpenMeteo {
  const dias = PAST_DAYS + FORECAST_DAYS;
  const azar = prng(semilla(barrio));

  // Intensidad propia del barrio: unos se llueven y otros no.
  const intensidad = 0.5 + azar() * 1.05;

  const time: string[] = [];
  const precipitation_sum: number[] = [];
  const temperature_2m_max: number[] = [];
  const temperature_2m_min: number[] = [];

  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);

  for (let i = 0; i < dias; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() + (i - PAST_DAYS));
    time.push(fecha.toISOString().slice(0, 10));

    const llueve = azar() < 0.45;
    const tormenta = llueve && azar() < 0.22;
    const mm = llueve ? (tormenta ? 18 + azar() * 30 : 1 + azar() * 12) * intensidad : 0;
    precipitation_sum.push(Math.round(mm * 10) / 10);

    const tmax = 27 + azar() * 7 - (llueve ? 2 : 0);
    temperature_2m_max.push(Math.round(tmax * 10) / 10);
    temperature_2m_min.push(Math.round((tmax - (7 + azar() * 4)) * 10) / 10);
  }

  return { time, precipitation_sum, temperature_2m_max, temperature_2m_min };
}

/**
 * Ventana de cría cuyo resultado se ve en el día `horizonte`.
 * Índices sobre la serie diaria, donde hoy = PAST_DAYS.
 */
function ventanaDeCria(horizonte: number) {
  const desde = clamp(PAST_DAYS + horizonte - 12, 0, PAST_DAYS + FORECAST_DAYS - 1);
  const hasta = clamp(PAST_DAYS + horizonte - 5, desde, PAST_DAYS + FORECAST_DAYS - 1);
  return { desde, hasta };
}

function proyectar(zona: ZonaParaPredecir, daily: DailyOpenMeteo, horizonte: number): ZonaPredicha {
  const { desde, hasta } = ventanaDeCria(horizonte);

  let lluviaMm = 0;
  let sumaTemp = 0;
  let dias = 0;

  for (let i = desde; i <= hasta; i++) {
    lluviaMm += daily.precipitation_sum[i] ?? 0;
    const tmax = daily.temperature_2m_max[i];
    const tmin = daily.temperature_2m_min[i];
    if (typeof tmax === "number" && typeof tmin === "number") {
      sumaTemp += (tmax + tmin) / 2;
      dias += 1;
    }
  }

  const tempMedia = dias > 0 ? sumaTemp / dias : 0;
  const factorTemp = clamp((tempMedia - TEMP_MINIMA) / TEMP_RANGO, 0, 1);

  // Sin cría nueva, el riesgo instalado decae.
  const base = zona.score * Math.pow(DECAY_SEMANAL, horizonte / 7);
  // La lluvia sólo suma si la temperatura permite que las larvas lleguen a adulto.
  const aporteLluvia = Math.min(TOPE_LLUVIA, lluviaMm * 1.6) * factorTemp;
  // La transmisión en curso también depende de que haya mosquitos vivos.
  const aporteReportes = Math.min(TOPE_REPORTES, zona.reportes_7d * 1.2) * factorTemp;

  const scoreProyectado = clamp(Math.round(base + aporteLluvia + aporteReportes), 0, 100);

  return {
    ...zona,
    scoreProyectado,
    delta: scoreProyectado - zona.score,
    factores: {
      lluviaMm: Math.round(lluviaMm * 10) / 10,
      tempMedia: Math.round(tempMedia * 10) / 10,
      factorTemp: Math.round(factorTemp * 100) / 100,
      ventana: {
        desde: daily.time[desde] ?? "?",
        hasta: daily.time[hasta] ?? "?",
      },
    },
  };
}

export const predecirRiesgo = createServerFn({ method: "POST" })
  .validator(
    (
      data: unknown,
    ): {
      zonas: ZonaParaPredecir[];
      horizonte: number;
      escenario: Escenario;
    } => {
      const d = (data ?? {}) as Record<string, unknown>;
      const crudas = Array.isArray(d["zonas"]) ? d["zonas"] : [];

      const zonas: ZonaParaPredecir[] = [];
      for (const item of crudas) {
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
        });
      }
      if (zonas.length === 0) throw new Error("No hay zonas para predecir.");

      const pedido = Number(d["horizonte"]);
      const horizonte = HORIZONTES.includes(pedido as Horizonte) ? pedido : 7;

      const escenarioPedido = String(d["escenario"] ?? "real");
      const escenario: Escenario = ESCENARIOS.includes(escenarioPedido as Escenario)
        ? (escenarioPedido as Escenario)
        : "real";

      // Open-Meteo acepta muchas coordenadas por request, pero no abusamos.
      return { zonas: zonas.slice(0, 40), horizonte, escenario };
    },
  )
  .handler(async ({ data }): Promise<ResultadoPrediccion> => {
    const resumir = (zonas: ZonaPredicha[]) => {
      const promedio = (nums: number[]) =>
        nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
      return {
        lluviaMm: Math.round(promedio(zonas.map((z) => z.factores.lluviaMm)) * 10) / 10,
        tempMedia: Math.round(promedio(zonas.map((z) => z.factores.tempMedia)) * 10) / 10,
        suben: zonas.filter((z) => z.delta > 0).length,
        bajan: zonas.filter((z) => z.delta < 0).length,
      };
    };

    // Escenario simulado: no sale a la red, arma la serie localmente y la pasa
    // por el MISMO modelo que el escenario real.
    if (data.escenario === "temporada") {
      const zonas = data.zonas.map((zona) =>
        proyectar(zona, serieSimulada(zona.barrio), data.horizonte),
      );
      return {
        ok: true,
        horizonte: data.horizonte,
        escenario: "temporada",
        generadoEn: new Date().toISOString(),
        zonas,
        resumen: resumir(zonas),
      };
    }

    const url =
      OPEN_METEO +
      `?latitude=${data.zonas.map((z) => z.lat).join(",")}` +
      `&longitude=${data.zonas.map((z) => z.lng).join(",")}` +
      "&daily=precipitation_sum,temperature_2m_max,temperature_2m_min" +
      `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
      "&timezone=America%2FArgentina%2FSalta";

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        console.error(`Open-Meteo respondió ${res.status}: ${await res.text()}`);
        return { ok: false, error: `El servicio de clima respondió ${res.status}.` };
      }

      const json: unknown = await res.json();
      // Con una sola coordenada devuelve un objeto; con varias, un array.
      const lista = (Array.isArray(json) ? json : [json]) as { daily?: DailyOpenMeteo }[];

      const zonas: ZonaPredicha[] = [];
      data.zonas.forEach((zona, i) => {
        const daily = lista[i]?.daily ?? lista[0]?.daily;
        if (!daily) return;
        zonas.push(proyectar(zona, daily, data.horizonte));
      });

      if (zonas.length === 0) {
        return { ok: false, error: "El servicio de clima no devolvió datos utilizables." };
      }

      return {
        ok: true,
        horizonte: data.horizonte,
        escenario: "real",
        generadoEn: new Date().toISOString(),
        zonas,
        resumen: resumir(zonas),
      };
    } catch (error) {
      console.error("Falló la predicción:", error);
      const esTimeout = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        error: esTimeout
          ? "El servicio de clima tardó demasiado. Probá de nuevo."
          : "No se pudo consultar el pronóstico del clima.",
      };
    }
  });
