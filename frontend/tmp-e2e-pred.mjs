// Temporal: verifica el boton de prediccion (escenario temporada y real).
const BASE = 'http://localhost:8080';

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no hay page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.addEventListener('open', () => r());
  ws.addEventListener('error', j);
});
let seq = 0;
const pending = new Map();
const errores = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errores.push((m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown')
    errores.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
async function ev(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  const d = r.result?.exceptionDetails;
  if (d) throw new Error(d.exception?.description ?? d.text);
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED', e);
  process.exit(1);
});

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: BASE + '/mapa' });
await sleep(10000);

const ESTADO = `
(() => {
  const nodos = [...document.querySelectorAll('path.leaflet-interactive[aria-label]')];
  const niveles = {};
  for (const n of nodos) {
    const m = /riesgo (\\w+)/.exec(n.getAttribute('aria-label') || '');
    if (m) niveles[m[1]] = (niveles[m[1]] || 0) + 1;
  }
  const pill = [...document.querySelectorAll('p')].find(p => /Proyecci/.test(p.textContent||''));
  const clima = [...document.querySelectorAll('button')].find(b => /Clima usado/.test(b.getAttribute('aria-label')||''));
  return {
    celdas: nodos.length,
    niveles,
    huella: nodos.map(n => n.getAttribute('fill')).join(''),
    pill: pill ? pill.textContent.replace(/\\s+/g,' ').trim() : null,
    escenarioBoton: clima ? clima.textContent.trim() : 'NO ENCONTRADO',
    verActual: !!([...document.querySelectorAll('button')].find(b => /Ver actual/.test(b.textContent||''))),
  };
})()
`;

const clickAria = (re) =>
  ev(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.getAttribute('aria-label')||'')); if(!b) return 'NO_ENCONTRADO'; b.click(); return 'ok'; })()`,
  );

const antes = await ev(ESTADO);
console.log('=== ACTUAL (sin proyeccion) ===');
console.log(`celdas: ${antes.celdas}  niveles: ${JSON.stringify(antes.niveles)}`);
console.log(`boton escenario: "${antes.escenarioBoton}"   pill: ${antes.pill}`);

console.log(`\n--- click +7d (escenario temporada) ---`);
console.log('click: ' + (await clickAria('/Predecir riesgo a 7/')));
await sleep(7000);
const t7 = await ev(ESTADO);
console.log(`niveles: ${JSON.stringify(t7.niveles)}`);
console.log(`pill   : ${t7.pill}`);
console.log(`Ver actual visible: ${t7.verActual}`);
console.log(`la grilla cambio: ${antes.huella !== t7.huella ? 'SI' : 'no'}`);

console.log(`\n--- click +14d ---`);
console.log('click: ' + (await clickAria('/Predecir riesgo a 14/')));
await sleep(7000);
const t14 = await ev(ESTADO);
console.log(`niveles: ${JSON.stringify(t14.niveles)}`);
console.log(`pill   : ${t14.pill}`);
console.log(`+14d difiere de +7d: ${t7.huella !== t14.huella ? 'SI' : 'no'}`);

console.log(`\n--- cambio a escenario real (Open-Meteo) ---`);
console.log('click: ' + (await clickAria('/Clima usado/')));
await sleep(9000);
const real = await ev(ESTADO);
console.log(`boton escenario: "${real.escenarioBoton}"`);
console.log(`niveles: ${JSON.stringify(real.niveles)}`);
console.log(`pill   : ${real.pill}`);
console.log(`real difiere de temporada: ${real.huella !== t14.huella ? 'SI' : 'no'}`);

console.log(`\n--- Ver actual ---`);
const vaBtn = await ev(
  `(() => { const b=[...document.querySelectorAll('button')].find(x=>/Ver actual/.test(x.textContent||'')); if(!b) return 'NO_ENCONTRADO'; b.click(); return 'ok'; })()`,
);
console.log('click: ' + vaBtn);
await sleep(2500);
const fin = await ev(ESTADO);
console.log(`niveles: ${JSON.stringify(fin.niveles)}`);
console.log(`pill: ${fin.pill}`);
console.log(`volvio al original: ${fin.huella === antes.huella ? 'SI' : 'no'}`);

console.log(`\nerrores de consola: ${errores.length}`);
errores.slice(0, 6).forEach((e) => console.log('  - ' + String(e).slice(0, 240)));

await send('Emulation.clearDeviceMetricsOverride');
ws.close();
