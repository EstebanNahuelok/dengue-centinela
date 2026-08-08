import { PrismaClient } from '@prisma/client';
import { BARRIOS } from '../src/utils/barrios.js';

const prisma = new PrismaClient();

const DESCRIPCIONES_SINTOMA = [
  'Tengo fiebre alta y dolor de cabeza desde ayer',
  'Fiebre, dolor muscular y dolor detras de los ojos',
  'Me duele el cuerpo y tengo nauseas',
  'Fiebre y sarpullido en los brazos',
  'Dolor de cabeza fuerte, sin fiebre',
  'Fiebre, dolor articular y vomito',
];

const DESCRIPCIONES_CRIADERO = [
  'Hay un neumatico con agua estancada hace dias en el patio del vecino',
  'Encontre varios recipientes con agua acumulada en un baldio',
  'Un tanque destapado con mucha agua en la vereda',
  'Charco de agua estancada al lado de la plaza',
  'Baldes con agua de lluvia acumulada hace una semana',
];

const CLASIFICACIONES = ['sospecha_alta', 'sospecha_media', 'no_relevante'];

function randomFecha(diasAtras) {
  return new Date(Date.now() - Math.random() * diasAtras * 24 * 60 * 60 * 1000);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log('Limpiando datos previos...');
  await prisma.reporte.deleteMany();
  await prisma.zonaRiesgo.deleteMany();

  console.log('Creando reportes de ejemplo...');
  const cantidadReportes = 18;
  const reportes = [];

  for (let i = 0; i < cantidadReportes; i++) {
    const barrio = pick(BARRIOS);
    const esCriadero = Math.random() < 0.4;
    const descripcion = esCriadero ? pick(DESCRIPCIONES_CRIADERO) : pick(DESCRIPCIONES_SINTOMA);

    reportes.push({
      telefonoHash: `demo-hash-${i}`,
      tipo: esCriadero ? 'criadero' : 'sintoma',
      barrio: barrio.nombre,
      lat: barrio.lat,
      lng: barrio.lng,
      descripcion,
      timestamp: randomFecha(7),
      clasificacionIa: pick(CLASIFICACIONES),
    });
  }

  await prisma.reporte.createMany({ data: reportes });

  console.log('Creando zonas de riesgo iniciales...');
  for (const barrio of BARRIOS) {
    const reportesDelBarrio = reportes.filter((r) => r.barrio === barrio.nombre).length;
    const factorClima = Math.round(Math.random() * 40);
    const score = Math.max(0, Math.min(100, Math.round(reportesDelBarrio * 8 + factorClima * 1.5)));

    await prisma.zonaRiesgo.create({
      data: {
        barrio: barrio.nombre,
        lat: barrio.lat,
        lng: barrio.lng,
        scoreActual: score,
        cantidadReportes7d: reportesDelBarrio,
        factorClima,
      },
    });
  }

  console.log(`Listo: ${cantidadReportes} reportes y ${BARRIOS.length} zonas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
