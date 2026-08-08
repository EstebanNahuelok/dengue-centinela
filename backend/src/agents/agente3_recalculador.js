import { prisma } from '../services/prisma.js';
import { lluviaAcumulada7d } from '../services/openMeteo.js';
import { BARRIOS } from '../utils/barrios.js';

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

// Pesos explicables para el pitch: cada reporte de sospecha_alta suma 15
// puntos, cada sospecha_media suma 6 (no_relevante no suma nada), y la
// lluvia acumulada de los ultimos 7 dias suma 1.5 puntos por mm hasta un
// tope de MM_LLUVIA_TOPE - el clima empuja el score pero nunca lo satura
// el solo, sin reportes, tiene que seguir habiendo señal humana. Acotado 0-100.
const PESO_SOSPECHA_ALTA = 15;
const PESO_SOSPECHA_MEDIA = 6;
const PESO_MM_LLUVIA = 1.5;
const MM_LLUVIA_TOPE = 40;

function calcularScore({ altas, medias, mmLluvia }) {
  const aporteClima = Math.min(mmLluvia, MM_LLUVIA_TOPE) * PESO_MM_LLUVIA;
  const score = altas * PESO_SOSPECHA_ALTA + medias * PESO_SOSPECHA_MEDIA + aporteClima;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function recalcularBarrio(barrio) {
  const desde = new Date(Date.now() - SIETE_DIAS_MS);

  const conteosPorClasificacion = await prisma.reporte.groupBy({
    by: ['clasificacionIa'],
    where: { barrio: barrio.nombre, timestamp: { gte: desde } },
    _count: { _all: true },
  });

  let cantidadReportes = 0;
  let altas = 0;
  let medias = 0;
  for (const grupo of conteosPorClasificacion) {
    cantidadReportes += grupo._count._all;
    if (grupo.clasificacionIa === 'sospecha_alta') altas = grupo._count._all;
    if (grupo.clasificacionIa === 'sospecha_media') medias = grupo._count._all;
  }

  let mmLluvia = 0;
  try {
    mmLluvia = await lluviaAcumulada7d(barrio.lat, barrio.lng);
  } catch (err) {
    console.error(`Open-Meteo fallo para ${barrio.nombre}, uso 0mm de respaldo:`, err.message);
  }

  const score = calcularScore({ altas, medias, mmLluvia });

  return prisma.zonaRiesgo.upsert({
    where: { barrio: barrio.nombre },
    create: {
      barrio: barrio.nombre,
      lat: barrio.lat,
      lng: barrio.lng,
      scoreActual: score,
      cantidadReportes7d: cantidadReportes,
      factorClima: mmLluvia,
    },
    update: {
      scoreActual: score,
      cantidadReportes7d: cantidadReportes,
      factorClima: mmLluvia,
    },
  });
}

export async function recalcularTodosLosBarrios() {
  const resultados = [];
  for (const barrio of BARRIOS) {
    resultados.push(await recalcularBarrio(barrio));
  }
  return resultados;
}
