# Dengue Centinela

Detección temprana y mapeo de riesgo de dengue en Salta capital. Reportes de
síntomas/criaderos por WhatsApp → clasificación con IA → cruce con clima →
score de riesgo por barrio en un mapa de calor.

Monorepo con dos proyectos independientes, cada uno con su propio `package.json`:

```
dengue-centinela/
├── backend/     # Express + Prisma + Postgres (Neon)
├── frontend/    # React 19 + TanStack Start (Router + SSR) + Tailwind + Leaflet + H3
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
pnpm prisma:deploy          # aplica las migraciones existentes (reportes, zonas_riesgo)
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

Con `VITE_USE_MOCK=true` el mapa arranca con datos hardcodeados en
`src/lib/mock-status.ts`, así se puede laburar sin depender de que el backend
esté levantado. Cuando el backend responda `/status` con datos reales, cambiar a
`VITE_USE_MOCK=false`.

> **Ojo en producción:** `VITE_*` son variables de *build*, no de runtime — Vite
> las hornea en el bundle. Hay que definirlas ANTES de buildear, no alcanza con
> setearlas en el panel del hosting si el build ya se hizo. Si `VITE_API_URL` no
> está definida, el default es `http://localhost:3001` y el mapa queda vacío.

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
| `GROQ_API_KEY` | Groq, usado por los Agentes 1 y 2. Sin esto ambos caen a su heurística de respaldo |
| `GROQ_MODEL` | Modelo por defecto (`llama-3.1-8b-instant`). El Agente 2 usa uno más grande, fijado en su código |
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

## Deploy

Son **dos servicios separados**, no uno solo. El frontend NO es hosting estático.

### Backend → Render / Railway (cualquier PaaS con Node)

| Config | Valor |
|---|---|
| Root directory | `backend` |
| Build command | `pnpm install && pnpm build` |
| Start command | `pnpm start` |

`pnpm build` corre `prisma generate && prisma migrate deploy`. El `postinstall`
también corre `prisma generate`, para no depender de que el PaaS ejecute los
scripts de instalación de las dependencias (pnpm 10+ los bloquea por defecto).

Variables a cargar: `DATABASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, `HASH_SALT`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`. `PORT` lo
inyecta la plataforma sola.

> Para `migrate deploy` conviene la connection string **directa** de Neon, no la
> pooled: PgBouncer puede dar problemas aplicando migraciones.

### Frontend → Cloudflare Workers

Viene del scaffold: `vite build` usa nitro con target Cloudflare y genera
`.output/server/wrangler.json` ya listo (con `nodejs_compat` activado).

```bash
cd frontend
VITE_API_URL=https://<backend-desplegado> VITE_USE_MOCK=false pnpm build
npx nitro deploy --prebuilt
```

`GROQ_API_KEY` va como **secret del Worker**, sin prefijo `VITE_` — es una server
function de TanStack Start, la key nunca sale al navegador. Gracias a
`nodejs_compat`, `process.env` funciona dentro del Worker.

### Después del deploy

Reapuntar el webhook de Twilio a `https://<backend-desplegado>/webhook/whatsapp`
(reemplaza a la URL de ngrok que se usa en dev).

## Quién toca qué (para no pisarse)

- **Esteban** — `backend/src/agents/agente1_conversacional.js`, `backend/src/routes/whatsapp.js`, integración real de Twilio/ngrok.
- **Mauro** — `backend/src/agents/agente2_clasificador.js`, `backend/src/agents/agente3_recalculador.js`, `backend/src/services/openMeteo.js`.
- **Leito** — todo `frontend/`, especialmente `src/components/RiskMap.tsx` y `src/routes/panel.tsx`. No necesita esperar al backend gracias a `VITE_USE_MOCK`.

Los `TODO(nombre)` en el código marcan justamente los puntos donde el
placeholder heurístico debe reemplazarse por la lógica real de cada uno.

## Notas / decisiones tomadas por default

- Las coordenadas de barrios en `backend/src/utils/barrios.js` son
  aproximadas — ajustar si hay tiempo antes del pitch.
- `factor_clima` se guarda en la DB como mm de lluvia acumulada (número) y se
  traduce a `"bajo"/"medio"/"alto"` en `GET /status` para matchear el formato
  pedido por el frontend.
- El Agente 1 (entrevista guiada por menú) y el Agente 2 (clasificador) usan
  Groq, cada uno con una heurística de respaldo propia: si Groq falla, tarda o
  devuelve algo no parseable, el flujo sigue funcionando igual.
- Los signos de alarma (vómito con sangre, sangrado de encías/nariz, dolor
  abdominal intenso, mareo/desmayo) se detectan de forma **determinista**, nunca
  vía Groq, y cortan el flujo en cualquier paso. Misma lógica en el webhook de
  WhatsApp y en el chat del frontend (`frontend/src/lib/asistente.ts`).
- Sin migración de teléfono en crudo: se hashea con SHA-256 + salt antes de guardar.
