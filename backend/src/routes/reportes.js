import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { hashPhone } from '../utils/hash.js';
import { clasificarReporte } from '../agents/agente2_clasificador.js';
import { recalcularBarrio } from '../agents/agente3_recalculador.js';
import { BARRIOS, coordsDeBarrio } from '../utils/barrios.js';

const router = Router();

const TIPOS_VALIDOS = ['sintoma', 'criadero'];
const MAX_DESCRIPCION = 1000;

// Alta de reportes desde la web (el canal alternativo a WhatsApp). Mismo
// pipeline que usa el webhook: se guarda el Reporte, lo clasifica el Agente 2
// y despues se recalcula la zona. La diferencia es que aca no hay telefono:
// el cliente manda un id anonimo generado en el navegador, y lo hasheamos
// igual para no guardar en crudo nada que identifique al dispositivo.
router.post('/', async (req, res, next) => {
  try {
    const { tipo, barrio, descripcion, clienteId } = req.body ?? {};

    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo invalido: se espera ${TIPOS_VALIDOS.join(' o ')}` });
    }

    // El barrio tiene que ser uno de los conocidos: si no, el Agente 3 nunca
    // lo iteraria y el reporte quedaria guardado pero invisible en el mapa.
    const barrioInfo = BARRIOS.find((b) => b.nombre === barrio);
    if (!barrioInfo) {
      return res.status(400).json({
        error: 'barrio desconocido',
        barrios_validos: BARRIOS.map((b) => b.nombre),
      });
    }

    const texto = String(descripcion ?? '').trim().slice(0, MAX_DESCRIPCION);
    if (!texto) {
      return res.status(400).json({ error: 'descripcion vacia' });
    }

    const coords = coordsDeBarrio(barrio);

    const reporte = await prisma.reporte.create({
      data: {
        telefonoHash: hashPhone(`web:${clienteId ?? 'anonimo'}`),
        tipo,
        barrio,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        descripcion: texto,
      },
    });

    const clasificacion = await clasificarReporte({ tipo, descripcion: texto });
    await prisma.reporte.update({
      where: { id: reporte.id },
      data: { clasificacionIa: clasificacion },
    });

    // Igual que en el webhook: recalculamos la zona en segundo plano para que
    // el mapa se actualice, sin hacer esperar la respuesta (Open-Meteo puede
    // estar lento y el cliente ya tiene lo que necesita).
    if (clasificacion !== 'no_relevante') {
      recalcularBarrio(barrioInfo).catch((err) =>
        console.error(`[Agente3] recalculo automatico fallo para ${barrio}:`, err.message)
      );
    }

    return res.status(201).json({
      ok: true,
      id: reporte.id,
      barrio,
      tipo,
      clasificacion,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
