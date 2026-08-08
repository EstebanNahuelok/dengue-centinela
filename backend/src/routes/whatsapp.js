import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { hashPhone } from '../utils/hash.js';
import { interpretarMensaje } from '../agents/agente1_conversacional.js';
import { clasificarReporte } from '../agents/agente2_clasificador.js';
import { twimlRespuesta } from '../services/twilio.js';

const router = Router();

// Twilio manda esto como application/x-www-form-urlencoded: Body, From,
// y Latitude/Longitude si el usuario compartio ubicacion.
router.post('/', async (req, res, next) => {
  try {
    const { Body, From, Latitude, Longitude } = req.body;

    if (!Body && !Latitude) {
      return res
        .type('text/xml')
        .send(twimlRespuesta('No entendí tu mensaje, contame si tenés síntomas o viste un criadero.'));
    }

    const interpretado = interpretarMensaje({ body: Body ?? '', latitude: Latitude, longitude: Longitude });

    if (interpretado.necesitaSeguimiento) {
      return res.type('text/xml').send(twimlRespuesta(interpretado.preguntaSeguimiento));
    }

    const reporte = await prisma.reporte.create({
      data: {
        telefonoHash: hashPhone(From ?? 'desconocido'),
        tipo: interpretado.tipo,
        barrio: interpretado.barrio,
        lat: interpretado.lat,
        lng: interpretado.lng,
        descripcion: interpretado.descripcion,
      },
    });

    const clasificacion = clasificarReporte(reporte);
    await prisma.reporte.update({
      where: { id: reporte.id },
      data: { clasificacionIa: clasificacion },
    });

    return res
      .type('text/xml')
      .send(
        twimlRespuesta(
          '¡Gracias! Registramos tu reporte. Si es una emergencia médica, llamá al 911 o acercate a tu centro de salud.'
        )
      );
  } catch (err) {
    next(err);
  }
});

export default router;
