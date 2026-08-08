// Coordenadas aproximadas (suficiente para la demo). Si hay tiempo, ajustar
// contra un mapa real antes del pitch — no son oficiales.
export const BARRIOS = [
  { nombre: 'Centro', lat: -24.7859, lng: -65.4117 },
  { nombre: 'Tres Cerritos', lat: -24.7691, lng: -65.389 },
  { nombre: 'Grand Bourg', lat: -24.7975, lng: -65.4302 },
  { nombre: 'Castañares', lat: -24.7642, lng: -65.4425 },
  { nombre: 'Villa Soledad', lat: -24.8103, lng: -65.402 },
  { nombre: 'San Remo', lat: -24.7735, lng: -65.4485 },
  { nombre: 'Limache', lat: -24.755, lng: -65.418 },
  { nombre: 'Solidaridad', lat: -24.805, lng: -65.455 },
  { nombre: 'Santa Lucía', lat: -24.758, lng: -65.431 },
  { nombre: 'Villa Mitre', lat: -24.792, lng: -65.418 },
];

export function findBarrioEnTexto(textoLower) {
  return BARRIOS.find((b) => textoLower.includes(b.nombre.toLowerCase()))?.nombre ?? null;
}

export function coordsDeBarrio(nombre) {
  return BARRIOS.find((b) => b.nombre.toLowerCase() === String(nombre).toLowerCase());
}
