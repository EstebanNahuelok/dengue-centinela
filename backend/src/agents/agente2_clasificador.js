import { chatCompletion } from '../services/groq.js';

const CLASIFICACIONES_VALIDAS = ['sospecha_alta', 'sospecha_media', 'no_relevante'];

const TIMEOUT_MS = 8000;

// Este clasificador necesita sostener una lógica condicional compuesta
// (fiebre como compuerta + contar síntomas de una lista exacta + ignorar
// síntomas fuera de la lista) de forma confiable. Probado empíricamente:
// llama-3.1-8b-instant (el default del resto del sistema, ver groq.js) falla
// de forma reproducible en varios casos límite; este modelo más grande los
// resuelve todos en las pruebas. Vale el costo/latencia extra solo acá.
const MODELO_CLASIFICACION = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Sos un clasificador para un sistema de vigilancia epidemiológica de
dengue en Salta, Argentina. Tu única tarea es leer un reporte ciudadano y
clasificarlo. No des consejos médicos, no converses, no agregues nada fuera
del formato pedido.

Criterio para reportes de tipo "sintoma" (protocolo del Ministerio de Salud):
- sospecha_alta: hay fiebre Y al menos 2 de estos síntomas asociados: dolor
  de cabeza intenso, dolor retro-ocular (detrás de los ojos), dolores
  musculares o articulares, náuseas, vómitos, sarpullido.
- sospecha_media: hay fiebre, sola o con 1 solo síntoma asociado de esa
  lista. Si el texto menciona otros síntomas que NO están en esa lista
  exacta de 6 (por ejemplo cansancio, dolor de espalda, mareos, debilidad,
  o cualquier otro no listado), esos NO cuentan para el conteo de la lista
  de 6, sin importar cuántos se mencionen junto a los oficiales.
- no_relevante: se aplica ÚNICAMENTE si NO hay fiebre (esto incluye el caso
  de que el texto no describa ningún síntoma médico). Si HAY fiebre, el
  resultado NUNCA es no_relevante, sin importar qué otros síntomas -de la
  lista o no- se mencionen: como mínimo es sospecha_media.

Antes de responder, contá mentalmente cuántos síntomas de la lista EXACTA
de 6 (ni uno más) están presentes, ignorando cualquier síntoma fuera de esa
lista aunque el texto lo presente junto a los demás como si fuera uno más.

Criterio para reportes de tipo "criadero" (sin criterio médico):
- sospecha_alta: describe agua estancada real y significativa (neumáticos,
  baldes, floreros, tanques destapados, charcos que llevan tiempo).
- sospecha_media: la situación es dudosa o ambigua, no queda claro si hay
  agua estancada real.
- no_relevante: no describe un criadero real.

Respondé en dos líneas exactas, nada más:
1. Una línea de razonamiento de máximo 20 palabras, mencionando el conteo.
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

export async function clasificarReporte({ tipo, descripcion = '' }) {
  try {
    const respuesta = await conTimeout(
      chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: construirPrompt({ tipo, descripcion }) },
        ],
        MODELO_CLASIFICACION,
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
