/**
 * Los 10 barrios que conoce el backend (backend/src/utils/barrios.js).
 *
 * Tienen que coincidir EXACTAMENTE con esa lista: si el formulario manda un
 * barrio que no está ahí, el reporte se guarda en la base pero el Agente 3
 * nunca lo cuenta (itera sobre esos 10), así que quedaría invisible en el
 * mapa. Por eso el formulario ofrece una lista cerrada y no texto libre.
 */
export interface Barrio {
  nombre: string;
  lat: number;
  lng: number;
}

export const BARRIOS: readonly Barrio[] = [
  { nombre: "Centro", lat: -24.7859, lng: -65.4117 },
  { nombre: "Tres Cerritos", lat: -24.7691, lng: -65.389 },
  { nombre: "Grand Bourg", lat: -24.7975, lng: -65.4302 },
  { nombre: "Castañares", lat: -24.7642, lng: -65.4425 },
  { nombre: "Villa Soledad", lat: -24.8103, lng: -65.402 },
  { nombre: "San Remo", lat: -24.7735, lng: -65.4485 },
  { nombre: "Limache", lat: -24.755, lng: -65.418 },
  { nombre: "Solidaridad", lat: -24.805, lng: -65.455 },
  { nombre: "Santa Lucía", lat: -24.758, lng: -65.431 },
  { nombre: "Villa Mitre", lat: -24.792, lng: -65.418 },
] as const;

/**
 * Barrio más cercano a una coordenada. Distancia euclídea sobre lat/lng:
 * a la escala de una ciudad el error contra la distancia real es
 * despreciable, y evita traer una librería de geodesia para esto.
 */
export function barrioMasCercano(lat: number, lng: number): Barrio {
  let mejor = BARRIOS[0] as Barrio;
  let mejorDist = Number.POSITIVE_INFINITY;

  for (const b of BARRIOS) {
    const d = (b.lat - lat) ** 2 + (b.lng - lng) ** 2;
    if (d < mejorDist) {
      mejorDist = d;
      mejor = b;
    }
  }
  return mejor;
}
