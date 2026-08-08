import { findBarrioEnTexto, coordsDeBarrio } from '../utils/barrios.js';

const PALABRAS_CRIADERO = [
  'criadero',
  'agua estancada',
  'charco',
  'recipiente',
  'neumatico',
  'neumático',
  'balde',
  'florero',
  'tanque destapado',
];

// TODO(Esteban): reemplazar este heuristico por una llamada a Groq
// (services/groq.js) que interprete el mensaje libre, decida tipo/barrio/
// descripcion, y arme la pregunta de seguimiento si falta info. El shape de
// retorno de abajo es el contrato que espera routes/whatsapp.js — mantenerlo
// si se cambia la implementacion.
export function interpretarMensaje({ body = '', latitude, longitude }) {
  const texto = body.trim();
  const textoLower = texto.toLowerCase();

  const esCriadero = PALABRAS_CRIADERO.some((p) => textoLower.includes(p));
  const tipo = esCriadero ? 'criadero' : 'sintoma';

  const barrioDetectado = findBarrioEnTexto(textoLower);
  const coords = barrioDetectado ? coordsDeBarrio(barrioDetectado) : null;

  const lat = latitude ? Number(latitude) : coords?.lat ?? null;
  const lng = longitude ? Number(longitude) : coords?.lng ?? null;

  // Si no dijo un barrio conocido y tampoco compartio ubicacion, falta info
  // clave: el webhook debe repreguntar en vez de guardar el reporte.
  const necesitaSeguimiento = !barrioDetectado && !latitude;

  return {
    tipo,
    barrio: barrioDetectado ?? 'Sin especificar',
    descripcion: texto,
    lat,
    lng,
    necesitaSeguimiento,
    preguntaSeguimiento: necesitaSeguimiento
      ? '¿En qué barrio estás? (Ej: Centro, Tres Cerritos, Castañares...)'
      : null,
  };
}
