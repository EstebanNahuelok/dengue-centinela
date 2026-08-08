/** Verificación end-to-end del mapa vía Chrome DevTools Protocol. */

const list = (await (await fetch("http://127.0.0.1:9222/json/list")).json()) as {
  type: string;
  webSocketDebuggerUrl: string;
}[];
const page = list.find((t) => t.type === "page");
if (!page) throw new Error("no page target");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise<void>((r) => ws.addEventListener("open", () => r()));

let id = 0;
const pending = new Map<number, (v: any) => void>();
const logs: string[] = [];
const errors: string[] = [];

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args ?? []).map((a: any) => a.value ?? a.description ?? "").join(" ");
    logs.push(`${msg.params.type}: ${text}`);
    if (msg.params.type === "error") errors.push(text);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails?.exception?.description ?? "exception");
  }
});

function send(method: string, params: unknown = {}) {
  const msgId = ++id;
  return new Promise<any>((resolve) => {
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function evaluate(expression: string) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails) {
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  }
  return res.result?.result?.value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:8080/mapa" });
await sleep(9000);

console.log("--- estado inicial ---");
console.log(
  await evaluate(`(() => {
    const hexes = document.querySelectorAll('.leaflet-dengue-hexes-pane path');
    const labels = document.querySelectorAll('.dengue-zone-label');
    const tiles = document.querySelectorAll('img.leaflet-tile');
    const box = document.querySelector('.leaflet-container').getBoundingClientRect();
    const first = hexes[0];
    return JSON.stringify({
      hexes: hexes.length,
      labels: labels.length,
      tilesLoaded: [...tiles].filter(t => t.complete && t.naturalWidth > 0).length,
      mapSize: Math.round(box.width) + 'x' + Math.round(box.height),
      dialog: !!document.querySelector('[role=dialog]'),
      sampleFill: first?.getAttribute('fill'),
      sampleFillOpacity: first?.getAttribute('fill-opacity'),
      sampleStrokeOpacity: first?.getAttribute('stroke-opacity'),
      sampleStroke: first?.getAttribute('stroke'),
    });
  })()`),
);

async function clickHex(level: string) {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll('.leaflet-dengue-hexes-pane path')]
      .find(p => (p.getAttribute('aria-label') || '').includes('riesgo ${level}'));
    if (!el) return 'NO_HEX_' + '${level}';
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
    return 'clicked ' + el.getAttribute('aria-label');
  })()`);
}

function readDialog() {
  return evaluate(`(() => {
    const d = document.querySelector('[role=dialog]');
    if (!d) return 'SIN_POPOVER';
    const r = d.getBoundingClientRect();
    const c = document.querySelector('.leaflet-container').getBoundingClientRect();
    const sel = [...document.querySelectorAll('.leaflet-dengue-hexes-pane path')]
      .filter(p => p.getAttribute('stroke') === '#E6EDF3').length;
    return JSON.stringify({
      texto: d.innerText.replace(/\\n/g, ' | '),
      dentroDelMapa: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1,
      pos: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height),
      opacidad: getComputedStyle(d).opacity,
      bg: getComputedStyle(d).backgroundColor,
      borde: getComputedStyle(d).borderTopColor,
      celdasResaltadas: sel,
    });
  })()`);
}

for (const level of ["Alto", "Medio", "Moderado", "Bajo"]) {
  console.log(`\n--- click en celda ${level} ---`);
  console.log(await clickHex(level));
  await sleep(600);
  console.log(await readDialog());
}

console.log("\n--- cerrar con la X ---");
await evaluate(`document.querySelector('[aria-label="Cerrar detalle"]').click()`);
await sleep(400);
console.log(await readDialog());

console.log("\n--- toggle de capas (ocultar heatmap) ---");
await evaluate(`document.querySelector('[aria-label="Ocultar capa de riesgo"]').click()`);
await sleep(600);
console.log(
  await evaluate(`(() => {
    const pane = document.querySelector('.leaflet-dengue-hexes-pane');
    return JSON.stringify({
      opacidad: getComputedStyle(pane).opacity,
      punteroEventos: getComputedStyle(pane).pointerEvents,
      botonAhora: !!document.querySelector('[aria-label="Mostrar capa de riesgo"]'),
      tilesVisibles: document.querySelectorAll('img.leaflet-tile').length,
    });
  })()`),
);
await evaluate(`document.querySelector('[aria-label="Mostrar capa de riesgo"]').click()`);
await sleep(500);
console.log(
  "restaurado opacidad:",
  await evaluate(`getComputedStyle(document.querySelector('.leaflet-dengue-hexes-pane')).opacity`),
);

console.log("\n--- zoom ---");
console.log(
  await evaluate(`(async () => {
    const before = document.querySelectorAll('img.leaflet-tile').length;
    document.querySelector('[aria-label="Acercar"]').click();
    await new Promise(r => setTimeout(r, 1200));
    document.querySelector('[aria-label="Alejar"]').click();
    await new Promise(r => setTimeout(r, 1200));
    return 'ok, tiles antes=' + before + ' despues=' + document.querySelectorAll('img.leaflet-tile').length;
  })()`),
);

console.log("\n--- mobile 390x780 ---");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 780,
  deviceScaleFactor: 2,
  mobile: true,
});
await sleep(1500);
console.log(await clickHex("Alto"));
await sleep(700);
console.log(await readDialog());

console.log("\n--- errores de consola ---");
console.log(errors.length ? errors : "ninguno");
console.log("warnings/logs:", logs.filter((l) => l.startsWith("warning")).slice(0, 5));

ws.close();
