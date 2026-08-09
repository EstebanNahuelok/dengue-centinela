import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import whatsappRouter from './routes/whatsapp.js';
import statusRouter from './routes/status.js';
import recalcularRouter from './routes/recalcular.js';
import reportesRouter from './routes/reportes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio manda x-www-form-urlencoded

app.get('/', (req, res) => res.json({ ok: true, service: 'dengue-centinela-backend' }));

app.use('/webhook/whatsapp', whatsappRouter);
app.use('/status', statusRouter);
app.use('/recalcular', recalcularRouter);
app.use('/reportes', reportesRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend escuchando en http://localhost:${PORT}`));
