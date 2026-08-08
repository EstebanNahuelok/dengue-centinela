import { getRiskMapData, NOA_PROVINCES, RISK_LABELS } from "./src/lib/risk-map";

const { region, detail, summaries } = getRiskMapData();

console.log("celdas regionales (res 4):", region.length);
console.log("celdas de detalle (res 8):", detail.length);
console.log("total polígonos:", region.length + detail.length);

const dist = (cells: typeof region) => {
  const by: Record<string, number> = {};
  for (const c of cells) by[c.level] = (by[c.level] ?? 0) + 1;
  const low = ((by["bajo"] ?? 0) + (by["moderado"] ?? 0)) / cells.length;
  return `${JSON.stringify(by)}  bajo+moderado=${Math.round(low * 100)}%`;
};
console.log("\nregional:", dist(region));
console.log("detalle: ", dist(detail));

console.log("\nresumen por provincia (orden de la barra lateral):");
for (const s of summaries) {
  console.log(
    `  ${s.province.name.padEnd(22)} score=${String(s.score).padStart(2)} ${RISK_LABELS[s.level].padEnd(9)} altos=${String(s.highCells).padStart(2)} reportes=${s.reports}`,
  );
}

console.log("\nceldas de detalle por provincia:");
for (const p of NOA_PROVINCES) {
  const own = detail.filter((c) => c.province === p.id);
  const zones = [...new Set(own.map((c) => c.zone))];
  console.log(`  ${p.name.padEnd(22)} ${String(own.length).padStart(3)} celdas  zonas=${zones.length}/${p.zones.length}`);
}

console.log("\nextensión de la grilla regional:");
const lats = region.map((c) => c.center[0]);
const lngs = region.map((c) => c.center[1]);
console.log(
  `  lat ${Math.min(...lats).toFixed(2)} .. ${Math.max(...lats).toFixed(2)}   lng ${Math.min(...lngs).toFixed(2)} .. ${Math.max(...lngs).toFixed(2)}`,
);
const b = region[0]!.boundary;
console.log(
  "  alto de celda regional ~",
  Math.round((Math.max(...b.map((p) => p[0])) - Math.min(...b.map((p) => p[0]))) * 111320),
  "m",
);

console.log("\nprovincia asignada en la vista regional (celdas por provincia):");
const byProv: Record<string, number> = {};
for (const c of region) byProv[c.province ?? "sin foco"] = (byProv[c.province ?? "sin foco"] ?? 0) + 1;
console.log(" ", byProv);
