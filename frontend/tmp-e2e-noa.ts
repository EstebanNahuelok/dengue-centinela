const list = (await (await fetch("http://127.0.0.1:9222/json/list")).json()) as {
  type: string;
  webSocketDebuggerUrl: string;
}[];
const page = list.find((t) => t.type === "page")!;
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise<void>((r) => ws.addEventListener("open", () => r()));
let id = 0;
const pending = new Map<number, (v: any) => void>();
const errors: string[] = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails?.exception?.description ?? "exception");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errors.push((m.params.args ?? []).map((a: any) => a.value ?? a.description).join(" "));
});
const send = (method: string, params: unknown = {}) =>
  new Promise<any>((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression: string) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r?.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r?.result?.result?.value;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: "http://localhost:8080/mapa" });
await sleep(9000);

const state = `(() => {
  const off = (sel) => { const p = document.querySelector(sel); return p ? p.classList.contains('dengue-pane-off') : 'no-pane'; };
  const map = document.querySelector('.leaflet-container').getBoundingClientRect();
  const rail = document.querySelector('nav[aria-label="Provincias del NOA"]');
  const railBox = rail.getBoundingClientRect();
  const activo = [...rail.querySelectorAll('button')].find(b => b.getAttribute('aria-current'));
  return JSON.stringify({
    escala: document.querySelector('.pointer-events-none.absolute.right-3')?.textContent,
    regionOff: off('.leaflet-dengue-region-pane'),
    detalleOff: off('.leaflet-dengue-hexes-pane'),
    regionVisibles: document.querySelectorAll('.leaflet-dengue-region-pane path').length,
    detalleVisibles: document.querySelectorAll('.leaflet-dengue-hexes-pane path').length,
    etiquetasProvincia: document.querySelectorAll('.dengue-province-label').length,
    etiquetasBarrio: document.querySelectorAll('.dengue-zone-label').length,
    railActivo: activo?.innerText.split('\\n')[0],
    railBotones: rail.querySelectorAll('button').length,
    railAncho: Math.round(railBox.width),
    mapa: Math.round(map.width) + 'x' + Math.round(map.height),
    railALaIzquierda: railBox.right <= map.left + 1,
  });
})()`;

const view = `(() => {
  const c = document.querySelector('.leaflet-container');
  const m = window.__leafletMapForTest;
  return 'n/a';
})()`;

console.log("1) vista inicial: región NOA");
console.log("  ", await evaluate(state));

console.log("\n2) click en una celda regional -> fila 'Provincia'");
await evaluate(`(() => {
  const el = [...document.querySelectorAll('.leaflet-dengue-region-pane path')].find(p => (p.getAttribute('aria-label')||'').includes('riesgo Alto'));
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:r.left+r.width/2, clientY:r.top+r.height/2, view:window}));
  return true;
})()`);
await sleep(600);
console.log(
  "  ",
  await evaluate(
    `(() => { const d=document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\\n/g,' | ') : 'sin popover'; })()`,
  ),
);

console.log("\n3) barra lateral: ir a Tucumán");
console.log(
  "  ",
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('nav[aria-label="Provincias del NOA"] button')].find(x => x.innerText.startsWith('Tucumán'));
    b.click();
    return 'click en ' + b.innerText.replace(/\\n/g,' / ');
  })()`),
);
await sleep(2600);
console.log("  ", await evaluate(state));

console.log("\n4) click en una celda de detalle -> fila 'Zona'");
await evaluate(`(() => {
  const c = document.querySelector('.leaflet-container').getBoundingClientRect();
  const el = [...document.querySelectorAll('.leaflet-dengue-hexes-pane path')].find(p => {
    const r = p.getBoundingClientRect();
    return r.top > c.top + 100 && r.bottom < c.bottom - 100 && r.left > c.left + 100 && r.right < c.right - 100;
  });
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:r.left+r.width/2, clientY:r.top+r.height/2, view:window}));
  return true;
})()`);
await sleep(600);
console.log(
  "  ",
  await evaluate(
    `(() => { const d=document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\\n/g,' | ') : 'sin popover'; })()`,
  ),
);

console.log("\n5) ir a Salta y verificar el gradiente del foco");
await evaluate(
  `[...document.querySelectorAll('nav[aria-label="Provincias del NOA"] button')].find(x => x.innerText.startsWith('Salta')).click()`,
);
await sleep(2600);
console.log("  ", await evaluate(state));
console.log(
  "  niveles visibles:",
  await evaluate(`(() => {
    const c = document.querySelector('.leaflet-container').getBoundingClientRect();
    const seen = {};
    for (const p of document.querySelectorAll('.leaflet-dengue-hexes-pane path')) {
      const r = p.getBoundingClientRect();
      if (r.right < c.left || r.left > c.right || r.bottom < c.top || r.top > c.bottom) continue;
      const m = (p.getAttribute('aria-label')||'').match(/riesgo (\\w+)/);
      if (m) seen[m[1]] = (seen[m[1]]||0)+1;
    }
    return JSON.stringify(seen);
  })()`),
);

console.log("\n6) volver a 'Todo el NOA'");
await evaluate(
  `[...document.querySelectorAll('nav[aria-label="Provincias del NOA"] button')].find(x => x.innerText.startsWith('Todo el NOA')).click()`,
);
await sleep(2800);
console.log("  ", await evaluate(state));

console.log("\n7) límite NOA: intentar salir de la región arrastrando lejos");
console.log(
  await evaluate(`(async () => {
    const before = document.querySelectorAll('.leaflet-dengue-region-pane path').length;
    const c = document.querySelector('.leaflet-container');
    // Leaflet expone el mapa vía el contenedor solo internamente; usamos el teclado.
    c.focus();
    for (let i = 0; i < 40; i++) {
      c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', keyCode: 38, bubbles: true }));
      c.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', keyCode: 38, bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 1500));
    const tiles = [...document.querySelectorAll('img.leaflet-tile')];
    return 'celdas regionales aún en el DOM = ' + before;
  })()`),
);

console.log("\n8) mobile 390x780: barra como tira horizontal arriba");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 780,
  deviceScaleFactor: 2,
  mobile: true,
});
await sleep(1800);
console.log(
  "  ",
  await evaluate(`(() => {
    const rail = document.querySelector('nav[aria-label="Provincias del NOA"]').getBoundingClientRect();
    const map = document.querySelector('.leaflet-container').getBoundingClientRect();
    return JSON.stringify({
      rail: Math.round(rail.width)+'x'+Math.round(rail.height),
      mapa: Math.round(map.width)+'x'+Math.round(map.height),
      railArribaDelMapa: rail.bottom <= map.top + 1,
      mapaAnchoCompleto: Math.round(map.width) === 390,
    });
  })()`),
);

console.log("\nerrores:", errors.length ? errors : "ninguno");
ws.close();
