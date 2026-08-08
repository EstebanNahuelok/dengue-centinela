const list = (await (await fetch("http://127.0.0.1:9222/json/list")).json()) as {
  type: string;
  webSocketDebuggerUrl: string;
}[];
const page = list.find((t) => t.type === "page")!;
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise<void>((r) => ws.addEventListener("open", () => r()));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m);
    pending.delete(m.id);
  }
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

await send("Runtime.enable");
await send("Emulation.clearDeviceMetricsOverride");
await send("Page.navigate", { url: "http://localhost:8080/mapa" });
await sleep(7000);

console.log(
  await evaluate(`(() => {
    const out = [];
    let el = document.querySelector('.leaflet-container');
    while (el && el !== document.documentElement) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push([
        el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
        'rect=' + Math.round(r.width) + 'x' + Math.round(r.height),
        'display=' + cs.display,
        'height=' + cs.height,
        'minH=' + cs.minHeight,
        'flex=' + cs.flex,
        'pos=' + cs.position,
      ].join('  '));
      el = el.parentElement;
    }
    out.push('viewport=' + window.innerWidth + 'x' + window.innerHeight);
    return out.reverse().join('\\n');
  })()`),
);
ws.close();
