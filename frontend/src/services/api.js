import { mockZonas } from '../mocks/mockZonas.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export async function getStatus() {
  if (USE_MOCK) return mockZonas;

  const res = await fetch(`${API_URL}/status`);
  if (!res.ok) throw new Error(`GET /status respondio ${res.status}`);
  return res.json();
}

export async function postRecalcular() {
  const res = await fetch(`${API_URL}/recalcular`, { method: 'POST' });
  if (!res.ok) throw new Error(`POST /recalcular respondio ${res.status}`);
  return res.json();
}
