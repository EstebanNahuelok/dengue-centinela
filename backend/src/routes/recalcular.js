import { Router } from 'express';
import { recalcularTodosLosBarrios } from '../agents/agente3_recalculador.js';
import { categoriaClima } from '../services/openMeteo.js';

const router = Router();

// Disparo manual del Agente 3 para la demo (en vez de esperar un cron real).
// TODO producción: reemplazar por cron cada N min.
router.post('/', async (req, res, next) => {
  try {
    const zonas = await recalcularTodosLosBarrios();

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
