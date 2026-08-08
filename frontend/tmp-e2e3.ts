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
});
const send = (method: string, params: unknown = {}) =>
  new Promise<any>((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression: string) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result
    ?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const probe = `(() => {
  const d = document.querySelector('[role=dialog]');
  const c = document.querySelector('.leaflet-container').getBoundingClientRect();
  if (!d) return 'sin popover';
  const r = d.getBoundingClientRect();
  return JSON.stringify({
    map: Math.round(c.width)+'x'+Math.round(c.height),
    box: Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height),
    dentro: r.left >= c.left-1 && r.right <= c.right+1 && r.top >= c.top-1 && r.bottom <= c.bottom+1,
    zona: d.innerText.split('\\n').pop(),
  });
})()`;

async function clickWhere(filter: string) {
  const pt = await evaluate(`(() => {
    const el = [...document.querySelectorAll('.leaflet-dengue-hexes-pane path')].filter(p => ${filter})[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), label: el.getAttribute('aria-label') });
  })()`);
  if (!pt) return "sin celda que cumpla el filtro";
  const { x, y, label } = JSON.parse(pt);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(500);
  return `(${x},${y}) ${label}`;
}

const edge = (side: "left" | "right" | "bottom") =>
  ({
    left: `(() => { const r=p.getBoundingClientRect(), c=document.querySelector('.leaflet-container').getBoundingClientRect(); return r.left-c.left < 50 && r.top-c.top > 200 && r.top-c.top < c.height-200; })()`,
    right: `(() => { const r=p.getBoundingClientRect(), c=document.querySelector('.leaflet-container').getBoundingClientRect(); return c.right-r.right < 50 && r.top-c.top > 200 && r.top-c.top < c.height-200; })()`,
    bottom: `(() => { const r=p.getBoundingClientRect(), c=document.querySelector('.leaflet-container').getBoundingClientRect(); return c.bottom-r.bottom < 60; })()`,
  })[side];

for (const [w, h] of [
  [720, 800],
  [1024, 640],
  [480, 900],
]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: "http://localhost:8080/mapa" });
  await sleep(7000);
  // zoom in para que la grilla llegue a los bordes
  await evaluate(`document.querySelector('[aria-label="Acercar"]').click()`);
  await sleep(1400);
  console.log(`\n=== viewport ${w}x${h} ===`);
  for (const side of ["left", "right", "bottom"] as const) {
    const clicked = await clickWhere(edge(side));
    console.log(`  borde ${side}: ${clicked}`);
    console.log(`     ->`, await evaluate(probe));
  }
}

console.log("\nerrores:", errors.length ? errors : "ninguno");
ws.close();
