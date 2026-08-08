import { chatCompletion } from '../services/groq.js';

const CLASIFICACIONES_VALIDAS = ['sospecha_alta', 'sospecha_media', 'no_relevante'];

const TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `Sos un clasificador para un sistema de vigilancia epidemiológica de
dengue en Salta, Argentina. Tu única tarea es leer un reporte ciudadano y
clasificarlo. No des consejos médicos, no converses, no agregues nada fuera
del formato pedido.

Criterio para reportes de tipo "sintoma" (protocolo del Ministerio de Salud):
- sospecha_alta: hay fiebre Y al menos 2 de estos síntomas asociados: dolor
  de cabeza intenso, dolor retro-ocular (detrás de los ojos), dolores
  musculares o articulares, náuseas, vómitos, sarpullido.
- sospecha_media: hay fiebre, sola o con 1 solo síntoma asociado de esa lista.
- no_relevante: NO hay fiebre (sin importar cuántos síntomas de la lista
  aparezcan sin fiebre), o el texto no describe síntomas médicos. La fiebre
  es condición necesaria: sin fiebre, siempre es no_relevante.

Criterio para reportes de tipo "criadero" (sin criterio médico):
- sospecha_alta: describe agua estancada real y significativa (neumáticos,
  baldes, floreros, tanques destapados, charcos que llevan tiempo).
- sospecha_media: la situación es dudosa o ambigua, no queda claro si hay
  agua estancada real.
- no_relevante: no describe un criadero real.

Respondé en dos líneas exactas, nada más:
1. Una línea de razonamiento de máximo 15 palabras.
2. Una línea final con EXACTAMENTE este formato: "RESULTADO: <clasificacion>"
   donde <clasificacion> es una sola de estas palabras: sospecha_alta,
   sospecha_media, no_relevante.`;

function construirPrompt({ tipo, descripcion }) {
  return `Tipo de reporte: ${tipo}\nDescripción del ciudadano: "${descripcion}"`;
}

function parsearClasificacion(textoRespuesta) {
  const matchEtiquetado = textoRespuesta.match(
    /RESULTADO:\s*(sospecha_alta|sospecha_media|no_relevante)/i
  );
  if (matchEtiquetado) return matchEtiquetado[1].toLowerCase();

  const ultimaLinea = textoRespuesta.trim().split('\n').pop() ?? '';
  const matchSuelto = ultimaLinea.match(/sospecha_alta|sospecha_media|no_relevante/i);
  return matchSuelto ? matchSuelto[0].toLowerCase() : null;
}

function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Groq timeout')), ms)),
  ]);
}

// Heuristica de respaldo: se usa SOLO si Groq falla, tarda mas de TIMEOUT_MS,
// o devuelve algo no parseable. Mantiene el webhook funcionando en vivo
// (ej. durante la demo) aunque la API externa falle.
function clasificarConHeuristica({ tipo, descripcion = '' }) {
  const textoLower = descripcion.toLowerCase();

  if (tipo === 'criadero') {
    const grave = ['mucho', 'varios', 'hace dias', 'hace días', 'estancada'].some((p) =>
      textoLower.includes(p)
    );
    return grave ? 'sospecha_alta' : 'sospecha_media';
  }

  const SINTOMAS = [
    'fiebre',
    'dolor de cabeza',
    'dolor muscular',
    'dolor articular',
    'sarpullido',
    'nauseas',
    'náuseas',
    'vomito',
    'vómito',
    'dolor detras de los ojos',
    'dolor detrás de los ojos',
  ];
  const tieneFiebre = textoLower.includes('fiebre');
  const cantidadSintomas = SINTOMAS.filter((s) => textoLower.includes(s)).length;

  if (!tieneFiebre) return 'no_relevante';
  if (cantidadSintomas >= 2) return 'sospecha_alta';
  return 'sospecha_media';
}

// NOTA para Esteban: esta funcion paso a ser async (llama a Groq). El caller
// en routes/whatsapp.js:39 hoy no hace `await clasificarReporte(...)` -
// hay que agregarlo para que clasificacionIa no reciba una Promise.
export async function clasificarReporte({ tipo, descripcion = '' }) {
  try {
    const respuesta = await conTimeout(
      chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: construirPrompt({ tipo, descripcion }) },
        ],
        undefined,
        { temperature: 0 }
      ),
      TIMEOUT_MS
    );

    const clasificacion = parsearClasificacion(respuesta);
    if (CLASIFICACIONES_VALIDAS.includes(clasificacion)) return clasificacion;

    console.error('Agente 2: Groq devolvio algo no parseable, uso heuristica:', respuesta);
  } catch (err) {
    console.error('Agente 2: Groq fallo, uso heuristica de respaldo:', err.message);
  }

  return clasificarConHeuristica({ tipo, descripcion });
}
