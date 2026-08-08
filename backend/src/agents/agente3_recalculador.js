import { prisma } from '../services/prisma.js';
import { lluviaAcumulada7d } from '../services/openMeteo.js';
import { BARRIOS } from '../utils/barrios.js';

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

// TODO(Mauro): ajustar la formula cuando haya datos reales para calibrar.
function calcularScore(cantidadReportes, mmLluvia) {
  const score = cantidadReportes * 8 + mmLluvia * 1.5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function recalcularBarrio(barrio) {
  const desde = new Date(Date.now() - SIETE_DIAS_MS);

  const cantidadReportes = await prisma.reporte.count({
    where: { barrio: barrio.nombre, timestamp: { gte: desde } },
  });

  let mmLluvia = 0;
  try {
    mmLluvia = await lluviaAcumulada7d(barrio.lat, barrio.lng);
  } catch (err) {
    console.error(`Open-Meteo fallo para ${barrio.nombre}:`, err.message);
  }

  const score = calcularScore(cantidadReportes, mmLluvia);

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
