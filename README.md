# Dengue Centinela

Detección temprana y mapeo de riesgo de dengue en Salta capital. Reportes de
síntomas/criaderos por WhatsApp → clasificación con IA → cruce con clima →
score de riesgo por barrio en un mapa de calor.

Monorepo con dos proyectos independientes, cada uno con su propio `package.json`:

```
dengue-centinela/
├── backend/     # Express + Prisma + Postgres (Neon)
├── frontend/    # React + Vite + Tailwind + Leaflet
└── docker-compose.yml   # Plan B de Postgres local (ver mas abajo)
```

## Por qué Neon y no Postgres en Docker

Con 2 de las 3 máquinas en Windows, priorizamos cero fricción de instalación:
Neon da un Postgres gratis en la nube en ~2 minutos (signup + copiar connection
string), sin instalar Docker Desktop/WSL2 en nadie, y los 3 comparten la misma
base de datos en vivo. `docker-compose.yml` queda como respaldo si hay
problemas de red en el lugar del hackathon.

## Setup rápido

### 0. Base de datos (una sola vez, cualquiera del equipo)

1. Crear cuenta/proyecto en [neon.tech](https://neon.tech) (o [supabase.com](https://supabase.com) si prefieren).
2. Copiar la **connection string directa** (no la pooled) — algo como
   `postgresql://user:pass@ep-xxxx.neon.tech/dengue_centinela?sslmode=require`.
3. Compartirla por el chat del equipo. Los 3 la usan como `DATABASE_URL`.

### 1. Backend

```bash
cd backend
pnpm install
cp .env.example .env        # completar DATABASE_URL, GROQ_API_KEY, TWILIO_*
pnpm prisma:migrate         # crea las tablas (reportes, zonas_riesgo)
pnpm seed                   # carga ~18 reportes + zonas de ejemplo en barrios de Salta
pnpm dev                    # http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local  # VITE_API_URL, VITE_USE_MOCK
pnpm dev                    # http://localhost:5173
```

Por defecto `VITE_USE_MOCK=true`: el mapa arranca con datos hardcodeados en
`src/mocks/mockZonas.js`, así Leito labura sin depender de que el backend esté
levantado. Cuando el backend responda `/status` con datos reales, cambiar a
`VITE_USE_MOCK=false`.

### 3. Twilio Sandbox (WhatsApp)

1. En la [consola de Twilio](https://console.twilio.com), activar el Sandbox de WhatsApp.
2. Mandar `join <codigo-sandbox>` al número del sandbox desde tu WhatsApp (explicar esto en la demo).
3. Configurar el webhook "WHEN A MESSAGE COMES IN" apuntando a
   `https://<tu-url-publica>/webhook/whatsapp` (usar `ngrok http 3001` en dev).

## Variables de entorno

**backend/.env**
| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Neon/Supabase/Docker |
| `PORT` | Puerto del backend (default 3001) |
| `HASH_SALT` | Salt para hashear teléfonos (nunca se guarda el número crudo) |
| `GROQ_API_KEY` | Para agentes con Groq (opcional mientras se usan los heurísticos placeholder) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Credenciales de Twilio |
| `TWILIO_WHATSAPP_NUMBER` | Número del sandbox (`whatsapp:+14155238886`) |

**frontend/.env.local**
| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL del backend |
| `VITE_USE_MOCK` | `true`/`false` — usar mocks o pegarle al backend real |

## Endpoints

- `POST /webhook/whatsapp` — recibe mensajes de Twilio, corre Agente 1 (interpretación) + Agente 2 (clasificación), guarda `Reporte`.
- `GET /status` — zonas con score actual, consumido por el mapa.
- `POST /recalcular` — dispara Agente 3 (recalcula todos los barrios: reportes 7d + lluvia de Open-Meteo). Botón "Recalcular riesgo" en el frontend lo llama directo, útil para mostrarlo en vivo en el pitch.

## Quién toca qué (para no pisarse)

- **Esteban** — `backend/src/agents/agente1_conversacional.js`, `backend/src/routes/whatsapp.js`, integración real de Twilio/ngrok.
- **Mauro** — `backend/src/agents/agente2_clasificador.js`, `backend/src/agents/agente3_recalculador.js`, `backend/src/services/openMeteo.js`.
- **Leito** — todo `frontend/`, especialmente `HeatMap.jsx` y `DetailPanel.jsx`. No necesita esperar al backend gracias a `VITE_USE_MOCK`.

Los `TODO(nombre)` en el código marcan justamente los puntos donde el
placeholder heurístico debe reemplazarse por la lógica real de cada uno.

## Notas / decisiones tomadas por default

- Las coordenadas de barrios en `backend/src/utils/barrios.js` son
  aproximadas — ajustar si hay tiempo antes del pitch.
- `factor_clima` se guarda en la DB como mm de lluvia acumulada (número) y se
  traduce a `"bajo"/"medio"/"alto"` en `GET /status` para matchear el formato
  pedido por el frontend.
- El Agente 1 y el Agente 2 hoy son heurísticos por palabras clave (sin Groq
  todavía) para que el flujo end-to-end funcione desde el minuto uno; están
  marcados con `TODO` para conectarlos a `services/groq.js`.
- Sin migración de teléfono en crudo: se hashea con SHA-256 + salt antes de guardar.
