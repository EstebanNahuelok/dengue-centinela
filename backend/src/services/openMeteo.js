const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 5000;

// Devuelve mm de lluvia acumulada en los ultimos 7 dias para una coordenada.
// Recalcular itera los barrios secuencialmente, asi que esta llamada tiene
// timeout propio: si Open-Meteo cuelga la conexion en vez de fallar rapido,
// no puede trabar POST /recalcular completo en vivo durante la demo.
export async function lluviaAcumulada7d(lat, lng) {
  const url =
    `${BASE_URL}?latitude=${lat}&longitude=${lng}` +
    '&daily=precipitation_sum&past_days=7&forecast_days=1&timezone=America%2FArgentina%2FSalta';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`Open-Meteo respondio ${res.status}`);

  const data = await res.json();
  const valores = data?.daily?.precipitation_sum ?? [];
  return valores.reduce((acc, mm) => acc + (mm || 0), 0);
}

// Traduce mm acumulados a la categoria que espera el frontend en /status.
export function categoriaClima(mm) {
  if (mm >= 30) return 'alto';
  if (mm >= 10) return 'medio';
  return 'bajo';
}
