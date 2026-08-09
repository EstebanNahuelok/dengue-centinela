import { findBarrioEnTexto, BARRIOS } from '../utils/barrios.js';
import { chatCompletion } from '../services/groq.js';

const NOMBRES_BARRIOS = BARRIOS.map((b) => b.nombre);

// Categorias fijas de sintomas asociados que le preguntamos al usuario.
// El Agente 2 (agente2_clasificador.js, de Mauro) no necesita conocer esta
// lista: nosotros armamos una descripcion en texto plano con lo que el
// usuario contesto y se la pasamos entera para que la clasifique.
export const CATEGORIAS_SINTOMAS = [
  'dolor de cabeza o detras de los ojos',
  'dolores musculares o articulares',
  'cansancio extremo',
  'nauseas o vomitos',
  'sarpullido o manchas rojas en la piel',
];

async function preguntarGroqJSON(prompt) {
  const respuesta = await chatCompletion([{ role: 'user', content: prompt }]);
  return JSON.parse(respuesta.trim());
}

// --- Signos de alarma -------------------------------------------------
// Heuristico fijo a proposito (no Groq): es la unica parte del flujo donde
// preferimos determinismo a flexibilidad. Una falla o demora de Groq nunca
// deberia hacer que nos salteemos esto. Preferimos que dispare de mas
// (falso positivo) a que se le escape un caso real.
//
// Por co-ocurrencia de raices (no frases exactas): asi cubrimos singular,
// plural y variaciones ("vomito"/"vomitos"/"vomita"/"vomitando") sin tener
// que enumerar cada combinacion a mano. normalizar() saca tildes para no
// depender de que el usuario los escriba bien.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function contieneAlguna(texto, palabras) {
  return palabras.some((p) => texto.includes(p));
}

const RAICES_VOMITO = ['vomit'];
const PALABRAS_SANGRE = ['sangre', 'sangrado'];
const PALABRAS_FRECUENCIA = ['frecuente', 'seguido', 'mucho', 'no para', 'todo el tiempo', 'sin parar'];
const PALABRAS_ENCIAS_NARIZ = ['encia', 'nariz', 'nasal'];
const PALABRAS_DOLOR = ['dolor'];
const PALABRAS_ZONA_ABDOMINAL = ['estomago', 'abdominal', 'panza', 'abdomen'];
const PALABRAS_INTENSIDAD = ['fuerte', 'intenso', 'continuo', 'insoportable'];
// OJO: "mucho sueno"/"tengo sueno" solos NO van aca — es una frase
// comunisima en charla casual ("tengo sueño") y disparaba falsos positivos
// (probado con un caso real). Solo cuentan las formas mas especificas de
// letargo/somnolencia real, que es el signo de alarma clinico de verdad
// (no simplemente estar cansado o con ganas de dormir).
const PALABRAS_CONCIENCIA = [
  'mareo', 'desmayo', 'desmaye', 'somnolencia', 'letargo', 'muy dormido', 'muy dormida',
  'no puedo mantenerme despierto', 'no puedo mantenerme despierta',
  'no se despierta', 'no reacciona', 'no reacciona bien',
];

export function detectarSignoAlarma(textoOriginal) {
  const t = normalizar(textoOriginal);

  if (contieneAlguna(t, PALABRAS_CONCIENCIA)) return true;
  if (contieneAlguna(t, RAICES_VOMITO) && contieneAlguna(t, PALABRAS_SANGRE)) return true;
  if (contieneAlguna(t, RAICES_VOMITO) && contieneAlguna(t, PALABRAS_FRECUENCIA)) return true;
  if (contieneAlguna(t, PALABRAS_SANGRE) && contieneAlguna(t, PALABRAS_ENCIAS_NARIZ)) return true;
  if (contieneAlguna(t, PALABRAS_DOLOR) && contieneAlguna(t, PALABRAS_ZONA_ABDOMINAL) && contieneAlguna(t, PALABRAS_INTENSIDAD)) {
    return true;
  }

  return false;
}

// --- Menu inicial -------------------------------------------------------
export function parseOpcionMenu(texto) {
  const t = texto.toLowerCase().trim();
  if (t.includes('1') || t.includes('sintoma') || t.includes('síntoma')) return 'sintoma';
  if (t.includes('2') || t.includes('criadero')) return 'criadero';
  return null;
}

// --- Si/no (pregunta de fiebre) -----------------------------------------
const AFIRMATIVOS = ['si', 'sí', 'sip', 'claro', 'tengo', 'positivo', 'afirmativo', 'obvio'];
const NEGATIVOS = ['no tengo', 'no', 'nop', 'negativo', 'ninguno'];

function interpretarSiNoHeuristico(texto) {
  const t = texto.toLowerCase().trim();
  if (NEGATIVOS.some((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p},`))) return false;
  if (AFIRMATIVOS.some((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p},`))) return true;
  return null;
}

// Heuristico PRIMERO a proposito (orden invertido respecto a las demas
// funciones de este archivo): un "si"/"no" literal es inequívoco y el
// heuristico lo resuelve siempre bien. Confiarle esto a Groq demostró ser
// mas riesgoso que util (llegó a interpretar un "no" como fiebre=true) para
// la pregunta que mas pesa en toda la clasificacion. Groq queda solo como
// respaldo para respuestas ambiguas que el heuristico no puede resolver.
export async function interpretarSiNo(texto) {
  const porHeuristico = interpretarSiNoHeuristico(texto);
  if (porHeuristico !== null) return porHeuristico;

  if (!process.env.GROQ_API_KEY) return null;
  try {
    const parsed = await preguntarGroqJSON(
      `El usuario respondio esto a la pregunta "¿Tenés fiebre alta (38°C o más)?": "${texto}"\n` +
        'Devolvé SOLO un JSON: {"respuesta": true, false, o null si no queda claro}'
    );
    if (typeof parsed.respuesta === 'boolean') return parsed.respuesta;
  } catch (err) {
    console.error('[Agente1] Groq fallo interpretando si/no:', err.message);
  }
  return null;
}

// --- Sintomas asociados (texto libre -> categorias) ----------------------
const KEYWORDS_POR_CATEGORIA = {
  [CATEGORIAS_SINTOMAS[0]]: ['dolor de cabeza', 'cefalea', 'dolor detras de los ojos', 'dolor detrás de los ojos', 'duele la cabeza'],
  [CATEGORIAS_SINTOMAS[1]]: ['dolor muscular', 'dolor articular', 'dolor de huesos', 'me duele el cuerpo', 'dolor en las articulaciones', 'quebrantahuesos'],
  [CATEGORIAS_SINTOMAS[2]]: ['cansancio', 'cansado', 'cansada', 'agotado', 'agotada', 'sin energia', 'sin energía', 'sin fuerzas', 'debilidad'],
  [CATEGORIAS_SINTOMAS[3]]: ['nausea', 'náusea', 'nauseas', 'náuseas', 'vomito', 'vómito', 'ganas de vomitar'],
  [CATEGORIAS_SINTOMAS[4]]: ['sarpullido', 'manchas rojas', 'erupcion', 'erupción', 'ronchas'],
};

const NEGACIONES_SINTOMAS = ['ninguno', 'ningun sintoma', 'ningún síntoma', 'no tengo nada', 'nada', 'no'];

function interpretarSintomasHeuristico(texto) {
  const t = texto.toLowerCase();
  if (NEGACIONES_SINTOMAS.some((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p},`))) return [];
  return Object.entries(KEYWORDS_POR_CATEGORIA)
    .filter(([, keywords]) => keywords.some((k) => t.includes(k)))
    .map(([categoria]) => categoria);
}

export async function interpretarSintomasAsociados(texto) {
  if (process.env.GROQ_API_KEY) {
    try {
      const parsed = await preguntarGroqJSON(
        `Un usuario respondio esto sobre sus sintomas: "${texto}"\n` +
          'De esta lista de categorias, devolvé SOLO un JSON {"detectados": [...]} con las que el usuario ' +
          'menciono (puede ser un array vacio):\n' +
          CATEGORIAS_SINTOMAS.map((c) => `- ${c}`).join('\n')
      );
      if (Array.isArray(parsed.detectados)) {
        return parsed.detectados.filter((c) => CATEGORIAS_SINTOMAS.includes(c));
      }
    } catch (err) {
      console.error('[Agente1] Groq fallo interpretando sintomas:', err.message);
    }
  }
  return interpretarSintomasHeuristico(texto);
}

// --- Evaluacion de criadero (texto libre -> si / dudoso / no) ------------
// NOTA: esto es solo para decidir si repreguntar el barrio o no en el
// webhook; la clasificacion final del criadero la hace agente2 (Mauro), que
// recibe la descripcion completa del criadero.
const PALABRAS_CRIADERO_CLARO = [
  'neumatico', 'neumático', 'balde', 'florero', 'pileta abandonada', 'tanque destapado',
  'agua estancada', 'recipiente con agua', 'charco permanente',
];
const PALABRAS_CRIADERO_DUDOSO = ['charco', 'agua', 'humedo', 'húmedo'];

function evaluarCriaderoHeuristico(texto) {
  const t = texto.toLowerCase();
  if (PALABRAS_CRIADERO_CLARO.some((p) => t.includes(p))) return 'si';
  if (PALABRAS_CRIADERO_DUDOSO.some((p) => t.includes(p))) return 'dudoso';
  return 'no';
}

export async function evaluarCriadero(texto) {
  if (process.env.GROQ_API_KEY) {
    try {
      const parsed = await preguntarGroqJSON(
        `Un usuario describio esto sobre un posible criadero de mosquitos (dengue) en Salta: "${texto}"\n` +
          'Evaluá si describe agua estancada real (neumatico, balde, florero, pileta abandonada, tanque ' +
          'destapado, charco permanente, etc).\n' +
          'Devolvé SOLO un JSON: {"evaluacion": "si" | "dudoso" | "no"}\n' +
          '- "si": describe claramente un recipiente o lugar con agua estancada\n' +
          '- "dudoso": menciona agua o humedad pero no queda claro si es un foco real\n' +
          '- "no": no menciona agua estancada (ej: solo vio un mosquito)'
      );
      if (['si', 'dudoso', 'no'].includes(parsed.evaluacion)) return parsed.evaluacion;
    } catch (err) {
      console.error('[Agente1] Groq fallo evaluando criadero:', err.message);
    }
  }
  return evaluarCriaderoHeuristico(texto);
}

// --- Barrio (texto libre -> uno de BARRIOS o null) ------------------------
async function detectarBarrioConGroq(texto) {
  const parsed = await preguntarGroqJSON(
    `Extraé el barrio de Salta capital mencionado en este mensaje: "${texto}"\n` +
      'Devolvé SOLO un JSON: {"barrio": "<uno de esta lista o null>"}\n' +
      `Lista: ${NOMBRES_BARRIOS.join(', ')}`
  );
  return NOMBRES_BARRIOS.includes(parsed.barrio) ? parsed.barrio : null;
}

export async function detectarBarrio(texto) {
  const porHeuristico = findBarrioEnTexto(texto.toLowerCase());
  if (porHeuristico) return porHeuristico;

  if (!process.env.GROQ_API_KEY) return null;
  try {
    return await detectarBarrioConGroq(texto);
  } catch (err) {
    console.error('[Agente1] Groq fallo detectando barrio:', err.message);
    return null;
  }
}
