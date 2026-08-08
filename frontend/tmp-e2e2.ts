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
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: "http://localhost:8080/mapa" });
await sleep(8000);

const probe = `(() => {
  const d = document.querySelector('[role=dialog]');
  const c = document.querySelector('.leaflet-container').getBoundingClientRect();
  if (!d) return JSON.stringify({ popover: null, map: Math.round(c.width)+'x'+Math.round(c.height) });
  const r = d.getBoundingClientRect();
  return JSON.stringify({
    map: Math.round(c.width)+'x'+Math.round(c.height),
    box: Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height),
    dentro: r.left >= c.left-1 && r.right <= c.right+1 && r.top >= c.top-1 && r.bottom <= c.bottom+1,
    nivel: d.querySelector('span[style*=color]')?.textContent,
    zona: d.innerText.split('\\n').pop(),
  });
})()`;

/** Hace click real (CDP) en el centro de la celda que cumpla el filtro. */
async function clickCellAt(filter: string) {
  const pt = await evaluate(`(() => {
    const el = [...document.querySelectorAll('.leaflet-dengue-hexes-pane path')].filter(p => ${filter})[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), label: el.getAttribute('aria-label') });
  })()`);
  if (!pt) return "sin celda";
  const { x, y, label } = JSON.parse(pt);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await sleep(500);
  return `click real en (${x},${y}) -> ${label}`;
}

console.log("1) celda alta, click real del mouse");
console.log("  ", await clickCellAt(`(p.getAttribute('aria-label')||'').includes('riesgo Alto')`));
console.log("  ", await probe.length, await evaluate(probe));

console.log("\n2) celda pegada al borde SUPERIOR del mapa (debe voltear hacia abajo y quedar dentro)");
console.log(
  "  ",
  await clickCellAt(
    `(() => { const r = p.getBoundingClientRect(); const c = document.querySelector('.leaflet-container').getBoundingClientRect(); return r.top - c.top < 90 && r.left - c.left > 200; })()`,
  ),
);
console.log("  ", await evaluate(probe));

console.log("\n3) celda pegada al borde IZQUIERDO (debe clampear, no salirse)");
console.log(
  "  ",
  await clickCellAt(
    `(() => { const r = p.getBoundingClientRect(); const c = document.querySelector('.leaflet-container').getBoundingClientRect(); return r.left - c.left < 60 && r.top - c.top > 250; })()`,
  ),
);
console.log("  ", await evaluate(probe));

console.log("\n4) celda pegada al borde DERECHO");
console.log(
  "  ",
  await clickCellAt(
    `(() => { const r = p.getBoundingClientRect(); const c = document.querySelector('.leaflet-container').getBoundingClientRect(); return c.right - r.right < 60 && r.top - c.top > 250; })()`,
  ),
);
console.log("  ", await evaluate(probe));

console.log("\n5) la card sigue a la celda al desplazar el mapa (panBy 120,90)");
const before = await evaluate(probe);
await evaluate(`window.__map_pan = true; document.querySelector('.leaflet-container'); true`);
await evaluate(`(() => {
  // pan mediante el teclado de Leaflet: flechas mueven el mapa
  const c = document.querySelector('.leaflet-container');
  c.focus();
  return true;
})()`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await sleep(1200);
console.log("   antes:", before);
console.log("   después:", await evaluate(probe));

console.log("\n6) click en el fondo del mapa cierra la card");
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 1180, y: 850, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 1180, y: 850, button: "left", clickCount: 1 });
await sleep(500);
console.log("  ", await evaluate(probe));

console.log("\n7) Escape cierra la card");
await clickCellAt(`(p.getAttribute('aria-label')||'').includes('riesgo Medio')`);
console.log("   abierta:", await evaluate(probe));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(400);
console.log("   después de Escape:", await evaluate(probe));

console.log("\n8) teclado: Enter sobre un hexágono enfocado");
console.log(
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('.leaflet-dengue-hexes-pane path')].find(p => (p.getAttribute('aria-label')||'').includes('riesgo Alto'));
    el.focus();
    return 'foco = ' + (document.activeElement === el) + ' | outline = ' + getComputedStyle(el).outlineColor;
  })()`),
);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await sleep(500);
console.log("  ", await evaluate(probe));

console.log("\n9) estilos de celda por nivel (relleno traslúcido, borde más opaco, mismo color)");
console.log(
  await evaluate(`(() => {
    const seen = {};
    for (const p of document.querySelectorAll('.leaflet-dengue-hexes-pane path')) {
      const label = (p.getAttribute('aria-label')||'').match(/riesgo (\\w+)/);
      if (!label) continue;
      const lvl = label[1];
      if (seen[lvl] || p.getAttribute('stroke') === '#E6EDF3') continue;
      seen[lvl] = { fill: p.getAttribute('fill'), fillOp: p.getAttribute('fill-opacity'), stroke: p.getAttribute('stroke'), strokeOp: p.getAttribute('stroke-opacity'), w: p.getAttribute('stroke-width') };
    }
    return JSON.stringify(seen, null, 1);
  })()`),
);

console.log("\n10) etiquetas de zona visibles y no interactivas");
console.log(
  await evaluate(`(() => {
    const els = [...document.querySelectorAll('.dengue-zone-label')];
    const cs = els[0] ? getComputedStyle(els[0].querySelector('span')) : null;
    return JSON.stringify({
      total: els.length,
      nombres: els.map(e => e.textContent),
      pointerEvents: els[0] ? getComputedStyle(els[0]).pointerEvents : null,
      color: cs?.color, size: cs?.fontSize, shadow: (cs?.textShadow||'').slice(0,40),
    });
  })()`),
);

console.log("\n11) controles: 4 botones circulares apilados arriba a la izquierda");
console.log(
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button[aria-label]')].filter(b => b.closest('.relative') && /Acercar|Alejar|Centrar|capa de riesgo/.test(b.getAttribute('aria-label')));
    const c = document.querySelector('.leaflet-container').getBoundingClientRect();
    return JSON.stringify(btns.map(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
      return { label: b.getAttribute('aria-label'), size: Math.round(r.width)+'x'+Math.round(r.height), radius: cs.borderRadius, dx: Math.round(r.left-c.left), dy: Math.round(r.top-c.top), bg: cs.backgroundColor, encimaDelMapa: cs.zIndex };
    }), null, 1);
  })()`),
);

console.log("\nerrores:", errors.length ? errors : "ninguno");
ws.close();
