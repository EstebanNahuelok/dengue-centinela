import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { hashPhone } from '../utils/hash.js';
import {
  detectarSignoAlarma,
  parseOpcionMenu,
  interpretarSiNo,
  interpretarSintomasAsociados,
  evaluarCriadero,
  detectarBarrio,
} from '../agents/agente1_conversacional.js';
import { clasificarReporte } from '../agents/agente2_clasificador.js';
import { recalcularBarrio } from '../agents/agente3_recalculador.js';
import { twimlRespuesta } from '../services/twilio.js';
import { BARRIOS, coordsDeBarrio } from '../utils/barrios.js';
import { getPendiente, setPendiente, clearPendiente } from '../utils/conversationState.js';

const router = Router();

const MENU =
  'Hola! Soy el asistente de Dengue Centinela. ¿Qué querés hacer?\n' +
  '1️⃣ Reportar un posible caso de dengue (síntomas)\n' +
  '2️⃣ Reportar un criadero (agua estancada, etc.)';

const PREGUNTA_FIEBRE = '¿Tenés fiebre alta (38°C o más)?';

const PREGUNTA_SINTOMAS_ASOCIADOS =
  '¿Tenés alguno de estos síntomas? Contame cuáles: dolor de cabeza fuerte o detrás de los ojos, ' +
  'dolores musculares o articulares, cansancio extremo, náuseas o vómitos, sarpullido o manchas rojas en la piel.';

const PREGUNTA_BARRIO = '¿En qué barrio estás?';

const PREGUNTA_DESCRIPCION_CRIADERO = 'Contame qué viste: ¿agua estancada, en qué tipo de recipiente, dónde está ubicado?';

const MENSAJE_ALARMA =
  '🚨 Lo que contás son signos de alarma del dengue. Por favor, andá a un hospital o centro de salud ' +
  'urgente, o llamá al 911. Ya registramos tu reporte para el seguimiento.';

const MENSAJE_NO_RELEVANTE_SINTOMA =
  'Gracias por reportar. Tus síntomas no coinciden con el patrón típico de dengue (fiebre alta + síntomas ' +
  'asociados). Si empeorás o te preocupa, consultá a un médico igual.';

const MENSAJE_NO_RELEVANTE_CRIADERO =
  'Gracias por el aviso. Para que cuente como foco de dengue necesitamos que haya agua estancada real ' +
  '(en un balde, neumático, florero, tanque destapado, etc). Si ves algo así, contanos de nuevo.';

const MENSAJE_BARRIO_NO_RECONOCIDO = 'No reconozco ese barrio, ¿podés escribirlo de nuevo? (Ej: Centro, Tres Cerritos...)';

// NOTA: el estado de la conversacion vive en memoria (utils/conversationState.js).
// Alcanza para la demo del hackathon; en produccion real esto deberia
// persistirse (DB o Redis), porque se pierde si el server se reinicia y no
// funciona si corren mas de una instancia del backend.
//
// La clasificacion final (sospecha_alta/media/no_relevante) la decide
// agente2_clasificador.js (Mauro) via Groq. Nosotros armamos una descripcion
// clara con lo que el usuario contesto en la entrevista guiada y se la
// pasamos entera - la unica excepcion son los signos de alarma, que se
// deciden aca mismo de forma determinista y nunca pasan por Groq.

function responder(res, texto) {
  return res.type('text/xml').send(twimlRespuesta(texto));
}

function acumular(estado, texto) {
  return estado.descripcion ? `${estado.descripcion}. ${texto}` : texto;
}

function descripcionParaSintomas({ fiebre, sintomasDetectados, mensajeOriginal }) {
  const listaSintomas = sintomasDetectados.length ? sintomasDetectados.join(', ') : 'ninguno';
  return (
    `Fiebre: ${fiebre ? 'sí' : 'no'}. Síntomas asociados mencionados: ${listaSintomas}. ` +
    `Mensaje original del usuario: "${mensajeOriginal}"`
  );
}

async function guardarReporte({ From, tipo, barrio, descripcion, clasificacion }) {
  const coords = coordsDeBarrio(barrio);

  await prisma.reporte.create({
    data: {
      telefonoHash: hashPhone(From ?? 'desconocido'),
      tipo,
      barrio,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      descripcion,
      clasificacionIa: clasificacion,
    },
  });

  if (clasificacion === 'no_relevante') return;

  // Efecto "en vivo" en el mapa: recalculamos la zona en segundo plano, sin
  // demorar la respuesta a Twilio (si Open-Meteo esta lento, no bloquea nada).
  const barrioInfo = BARRIOS.find((b) => b.nombre === barrio);
  if (barrioInfo) {
    recalcularBarrio(barrioInfo).catch((err) =>
      console.error(`[Agente3] recalculo automatico fallo para ${barrio}:`, err.message)
    );
  }
}

async function manejarAlarma(res, { From, estado, texto }) {
  clearPendiente(From);

  const descripcion = acumular(estado, texto);
  const barrio = estado.barrio ?? (await detectarBarrio(texto)) ?? 'Sin especificar';

  // Los signos de alarma fuerzan sospecha_alta directo, sin pasar por Groq:
  // es la parte de seguridad del flujo, tiene que ser inmediata y confiable.
  await guardarReporte({
    From,
    tipo: estado.tipo ?? 'sintoma',
    barrio,
    descripcion,
    clasificacion: 'sospecha_alta',
  });

  return responder(res, MENSAJE_ALARMA);
}

function manejarMenuNuevo(res, { From }) {
  setPendiente(From, { paso: 'esperando_opcion', descripcion: '' });
  return responder(res, MENU);
}

function manejarEsperandoOpcion(res, { From, texto }) {
  const opcion = parseOpcionMenu(texto);

  if (opcion === 'sintoma') {
    setPendiente(From, { paso: 'sintoma_fiebre', tipo: 'sintoma', descripcion: '' });
    return responder(res, PREGUNTA_FIEBRE);
  }

  if (opcion === 'criadero') {
    setPendiente(From, { paso: 'criadero_descripcion', tipo: 'criadero', descripcion: '' });
    return responder(res, PREGUNTA_DESCRIPCION_CRIADERO);
  }

  return responder(res, `No entendí esa opción.\n\n${MENU}`);
}

async function manejarFiebre(res, { From, estado, texto }) {
  const fiebre = await interpretarSiNo(texto);

  if (fiebre === null) {
    return responder(res, `No te entendí, respondé sí o no: ${PREGUNTA_FIEBRE}`);
  }

  setPendiente(From, { ...estado, paso: 'sintoma_asociados', fiebre, descripcion: acumular(estado, texto) });
  return responder(res, PREGUNTA_SINTOMAS_ASOCIADOS);
}

async function manejarSintomasAsociados(res, { From, estado, texto }) {
  const sintomasDetectados = await interpretarSintomasAsociados(texto);

  setPendiente(From, {
    ...estado,
    paso: 'sintoma_barrio',
    sintomasDetectados,
    descripcion: acumular(estado, texto),
  });
  return responder(res, PREGUNTA_BARRIO);
}

async function manejarBarrioSintoma(res, { From, estado, texto }) {
  const barrio = await detectarBarrio(texto);
  if (!barrio) return responder(res, MENSAJE_BARRIO_NO_RECONOCIDO);

  clearPendiente(From);
  const descripcion = descripcionParaSintomas({
    fiebre: estado.fiebre,
    sintomasDetectados: estado.sintomasDetectados,
    mensajeOriginal: acumular(estado, texto),
  });

  const clasificacion = await clasificarReporte({ tipo: 'sintoma', descripcion });
  await guardarReporte({ From, tipo: 'sintoma', barrio, descripcion, clasificacion });

  const mensaje =
    clasificacion === 'no_relevante' ? MENSAJE_NO_RELEVANTE_SINTOMA : `Gracias, registramos tu reporte en la zona ${barrio}.`;
  return responder(res, mensaje);
}

async function manejarDescripcionCriadero(res, { From, estado, texto }) {
  // Solo la usamos para decidir si hace falta repreguntar algo mas adelante;
  // la clasificacion final la hace agente2 con la descripcion completa.
  await evaluarCriadero(texto);

  setPendiente(From, {
    ...estado,
    paso: 'criadero_barrio',
    descripcion: acumular(estado, texto),
  });
  return responder(res, PREGUNTA_BARRIO);
}

async function manejarBarrioCriadero(res, { From, estado, texto }) {
  const barrio = await detectarBarrio(texto);
  if (!barrio) return responder(res, MENSAJE_BARRIO_NO_RECONOCIDO);

  clearPendiente(From);
  const descripcion = acumular(estado, texto);
  const clasificacion = await clasificarReporte({ tipo: 'criadero', descripcion });

  await guardarReporte({ From, tipo: 'criadero', barrio, descripcion, clasificacion });

  const mensaje =
    clasificacion === 'no_relevante' ? MENSAJE_NO_RELEVANTE_CRIADERO : `¡Gracias! Registramos el criadero en la zona ${barrio}.`;
  return responder(res, mensaje);
}

// Twilio manda esto como application/x-www-form-urlencoded: Body, From (y
// Latitude/Longitude si comparten ubicacion, que no usamos: el modelo de
// zonas es por nombre de barrio, asi que igual preguntamos cual es).
router.post('/', async (req, res, next) => {
  try {
    const { Body, From } = req.body;
    const texto = (Body ?? '').trim();

    if (!texto) {
      return responder(res, 'No entendí tu mensaje. Escribime algo para empezar.');
    }

    const estado = getPendiente(From);

    // Los signos de alarma cortan cualquier flujo, en cualquier paso.
    if (detectarSignoAlarma(texto)) {
      return manejarAlarma(res, { From, estado: estado ?? {}, texto });
    }

    if (!estado) return manejarMenuNuevo(res, { From });

    switch (estado.paso) {
      case 'esperando_opcion':
        return manejarEsperandoOpcion(res, { From, texto });
      case 'sintoma_fiebre':
        return manejarFiebre(res, { From, estado, texto });
      case 'sintoma_asociados':
        return manejarSintomasAsociados(res, { From, estado, texto });
      case 'sintoma_barrio':
        return manejarBarrioSintoma(res, { From, estado, texto });
      case 'criadero_descripcion':
        return manejarDescripcionCriadero(res, { From, estado, texto });
      case 'criadero_barrio':
        return manejarBarrioCriadero(res, { From, estado, texto });
      default:
        return manejarMenuNuevo(res, { From });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
