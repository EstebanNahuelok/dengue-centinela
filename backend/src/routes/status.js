import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { categoriaClima } from '../services/openMeteo.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const zonas = await prisma.zonaRiesgo.findMany({ orderBy: { scoreActual: 'desc' } });

    const ultimaActualizacion = zonas.reduce(
      (max, z) => (z.ultimaActualizacion > max ? z.ultimaActualizacion : max),
      new Date(0)
    );

    res.json({
      zonas: zonas.map((z) => ({
        barrio: z.barrio,
        lat: z.lat,
        lng: z.lng,
        score: z.scoreActual,
        reportes_7d: z.cantidadReportes7d,
        factor_clima: categoriaClima(z.factorClima),
      })),
      ultima_actualizacion: zonas.length ? ultimaActualizacion.toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
