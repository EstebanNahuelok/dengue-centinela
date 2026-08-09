/*
 * Service worker de Dengue Centinela.
 *
 * Dos trabajos:
 *  1. Cachear el app shell para que la app abra sin señal (aunque los datos
 *     del mapa queden desactualizados, que es preferible a una pantalla de
 *     error del navegador).
 *  2. Escuchar Background Sync y vaciar la cola de reportes de IndexedDB
 *     apenas vuelve la conexión, incluso si el usuario ya cerró la pestaña.
 *
 * Vanilla a proposito: sin Workbox ni build step, este archivo se sirve tal
 * cual desde /sw.js.
 */

const CACHE = "dengue-centinela-v1";

// Solo la cascara. Los datos del mapa NO se cachean acá: los sirve
// GET /status y es preferible mostrar "sin datos frescos" a mostrar
// numeros viejos como si fueran actuales.
const APP_SHELL = ["/", "/reportar", "/mapa"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Si alguna ruta falla (por ejemplo en el primer deploy), no queremos
        // que se caiga la instalacion entera del service worker.
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * Estrategia: red primero, cache como respaldo.
 *
 * Al reves (cache primero) la app cargaria mas rapido pero mostraria HTML
 * viejo estando online, que en una app de alertas sanitarias es peor que
 * esperar un poco mas.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET de nuestro propio origen. Los POST de reportes nunca se tocan:
  // de esos se encarga la cola en IndexedDB.
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copia));
        }
        return res;
      })
      .catch(async () => {
        const cacheado = await caches.match(req);
        if (cacheado) return cacheado;

        // Navegacion sin cache puntual: devolvemos la home cacheada para que
        // la app abra igual en vez de mostrar el dinosaurio del navegador.
        if (req.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        return Response.error();
      }),
  );
});

/* ------------------------------------------------------------------ *
 * Background Sync: vaciado de la cola de reportes
 * ------------------------------------------------------------------ */

const DB_NAME = "dengue-centinela";
const DB_VERSION = 1;
const STORE = "reportes-pendientes";
const SYNC_TAG = "sincronizar-reportes";

function abrirDB() {
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

function conStore(modo, fn) {
  return abrirDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

// Mismo criterio que lib/offline-queue.ts: se borra de la cola si el POST
// salio bien, o si el backend lo rechazo con 4xx (reintentarlo daria siempre
// el mismo error). Un 5xx o un fallo de red lo dejan encolado.
async function vaciarCola() {
  const pendientes = (await conStore("readonly", (s) => s.getAll())) || [];
  let enviados = 0;

  for (const item of pendientes) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        await conStore("readwrite", (s) => s.delete(item.id));
        enviados++;
      } else if (res.status >= 400 && res.status < 500) {
        await conStore("readwrite", (s) => s.delete(item.id));
      }
    } catch {
      break; // Se corto la red de nuevo.
    }
  }

  if (enviados > 0) {
    const clientes = await self.clients.matchAll({ includeUncontrolled: true });
    clientes.forEach((c) => c.postMessage({ tipo: "reportes-sincronizados", enviados }));
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(vaciarCola());
});

// Disparo manual desde la pagina (fallback para navegadores sin Background
// Sync, como Safari/iOS).
self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "sincronizar-ahora") {
    event.waitUntil(vaciarCola());
  }
});
