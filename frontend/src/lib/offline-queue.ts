/**
 * Cola offline de reportes (IndexedDB nativa, sin dependencias).
 *
 * El vecino que reporta desde el celular en el barrio muchas veces no tiene
 * señal buena. En vez de tratar eso como un error, es el caso normal: si el
 * POST falla o el navegador ya está offline, el reporte se guarda acá y se
 * reintenta solo cuando vuelve la conexión.
 *
 * Cada registro guarda la URL destino completa, no solo el payload: así el
 * service worker (que no ve las variables VITE_*) puede reenviarlo sin
 * necesitar saber a qué backend apunta este build.
 */
import { API_BASE } from "./api";

const DB_NAME = "dengue-centinela";
const DB_VERSION = 1;
const STORE = "reportes-pendientes";

/** Mismo tag que escucha el service worker en public/sw.js. */
export const SYNC_TAG = "sincronizar-reportes";

export interface ReportePayload {
  tipo: "sintoma" | "criadero";
  barrio: string;
  descripcion: string;
  clienteId: string;
}

export interface ReportePendiente {
  id: number;
  url: string;
  payload: ReportePayload;
  createdAt: string;
}

/** Resultado de intentar enviar: sirve para decidir qué mensaje mostrar. */
export type ResultadoEnvio =
  | { estado: "enviado"; clasificacion?: string | undefined }
  | { estado: "encolado" }
  | { estado: "error"; mensaje: string };

const hayIndexedDB = () => typeof indexedDB !== "undefined";

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function conStore<T>(
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrirDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function listarPendientes(): Promise<ReportePendiente[]> {
  if (!hayIndexedDB()) return [];
  const todos = await conStore<ReportePendiente[]>("readonly", (s) => s.getAll());
  return todos ?? [];
}

export async function contarPendientes(): Promise<number> {
  if (!hayIndexedDB()) return 0;
  return (await conStore<number>("readonly", (s) => s.count())) ?? 0;
}

async function encolar(payload: ReportePayload): Promise<void> {
  await conStore("readwrite", (s) =>
    s.add({ url: `${API_BASE}/reportes`, payload, createdAt: new Date().toISOString() }),
  );
}

async function borrarPendiente(id: number): Promise<void> {
  await conStore("readwrite", (s) => s.delete(id));
}

/**
 * Le pide al navegador que dispare la sincronización cuando vuelva la red.
 * Background Sync no existe en Safari/iOS: si no está, no pasa nada y el
 * fallback del listener `online` de la página se encarga igual.
 */
async function pedirBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register(SYNC_TAG);
  } catch {
    // Sin Background Sync seguimos igual: el fallback por evento `online` cubre el caso.
  }
}

/**
 * Envía el reporte. Si no hay red (o el POST falla por red), lo encola y
 * devuelve "encolado" en vez de tirar el error: el usuario no pierde nada.
 * Un rechazo del backend (400) SÍ es un error real y no se encola, porque
 * reintentarlo daría el mismo 400 para siempre.
 */
export async function enviarReporte(payload: ReportePayload): Promise<ResultadoEnvio> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await encolar(payload);
    await pedirBackgroundSync();
    return { estado: "encolado" };
  }

  try {
    const res = await fetch(`${API_BASE}/reportes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = (await res.json()) as { clasificacion?: string };
      return { estado: "enviado", clasificacion: data.clasificacion };
    }

    // 4xx = el backend rechazó el contenido; reintentar no lo va a arreglar.
    if (res.status >= 400 && res.status < 500) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        estado: "error",
        mensaje: data.error ?? `El servidor rechazó el reporte (${res.status}).`,
      };
    }

    // 5xx: el servidor está caído o dormido (Render tarda en despertar).
    // Es transitorio, así que lo encolamos igual que si no hubiera red.
    await encolar(payload);
    await pedirBackgroundSync();
    return { estado: "encolado" };
  } catch {
    // fetch rechaza = no hay red.
    await encolar(payload);
    await pedirBackgroundSync();
    return { estado: "encolado" };
  }
}

/**
 * Vacía la cola reporte por reporte. Cada uno se borra SOLO si el POST
 * respondió bien (o si el backend lo rechazó con 4xx, porque en ese caso
 * quedaría trabado para siempre ocupando la cola).
 */
export async function sincronizarPendientes(): Promise<{ enviados: number; quedan: number }> {
  const pendientes = await listarPendientes();
  let enviados = 0;

  for (const item of pendientes) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        await borrarPendiente(item.id);
        enviados++;
      } else if (res.status >= 400 && res.status < 500) {
        await borrarPendiente(item.id);
      }
      // 5xx o error de red: lo dejamos en la cola para el próximo intento.
    } catch {
      break; // Se cortó la red otra vez: no tiene sentido seguir con el resto.
    }
  }

  return { enviados, quedan: await contarPendientes() };
}
