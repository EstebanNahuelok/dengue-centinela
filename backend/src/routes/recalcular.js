import { Router } from 'express';
import { recalcularTodosLosBarrios } from '../agents/agente3_recalculador.js';

const router = Router();

// Disparo manual del Agente 3 para la demo (en vez de esperar un cron real).
router.post('/', async (req, res, next) => {
  try {
    const zonas = await recalcularTodosLosBarrios();
    res.json({ ok: true, zonas_actualizadas: zonas.length, zonas });
  } catch (err) {
    next(err);
  }
});

export default router;
