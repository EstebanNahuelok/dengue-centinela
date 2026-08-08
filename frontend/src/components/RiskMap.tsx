import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Layers, Minus, Plus, X } from "lucide-react";
import type * as Leaflet from "leaflet";

import { ProvinceRail, type RailSelection } from "@/components/ProvinceRail";
import {
  DETAIL_ZOOM,
  NOA_BOUNDS,
  NOA_CENTER,
  NOA_PROVINCES,
  RISK_COLORS,
  RISK_LABELS,
  distanceKm,
  getRiskMapData,
  type LatLng,
  type ProvinceId,
  type ProvinceSummary,
  type RiskCell,
} from "@/lib/risk-map";

/** Base satelital gratuita de Esri (atribución obligatoria, ver abajo). */
const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION = "Imágenes: Esri · Maxar · Earthstar Geographics";

/** Ancho de contenedor por debajo del cual el popover pasa a hoja inferior. */
const SHEET_BREAKPOINT = 430;

/**
 * El relleno es traslúcido (0,45–0,60 según el score) y el borde va del mismo
 * color pero más opaco, para que se distinga el límite de celda contra el vecino.
 */
function cellStyle(cell: RiskCell, selected: boolean): Leaflet.PathOptions {
  const color = RISK_COLORS[cell.level];
  return {
    color: selected ? "#E6EDF3" : color,
    weight: selected ? 3 : 1,
    opacity: selected ? 1 : 0.9,
    fillColor: color,
    fillOpacity: 0.45 + (cell.score / 100) * 0.15,
  };
}

export function RiskMap() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const polysRef = useRef(new Map<string, Leaflet.Polygon>());
  const panesRef = useRef<Record<string, HTMLElement>>({});
  const userMarkerRef = useRef<Leaflet.Marker | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cells, setCells] = useState<RiskCell[]>([]);
  const [summaries, setSummaries] = useState<ProvinceSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [detailMode, setDetailMode] = useState(false);
  const [activeRail, setActiveRail] = useState<RailSelection>("noa");
  const [selected, setSelected] = useState<RiskCell | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [bounds, setBounds] = useState({ w: 0, h: 0 });
  const [heatOn, setHeatOn] = useState(true);
  const [locating, setLocating] = useState(false);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  const cellsByH3 = useMemo(() => new Map(cells.map((c) => [c.h3, c])), [cells]);

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }

  // Leaflet necesita el DOM: se monta solo en el cliente, después del primer render.
  useEffect(() => {
    let disposed = false;
    const polys = polysRef.current;

    void (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: NOA_CENTER,
        zoom: 6,
        minZoom: 5,
        maxZoom: 18,
        // El área de trabajo es el NOA: no se puede navegar fuera de la región.
        maxBounds: L.latLngBounds(NOA_BOUNDS[0], NOA_BOUNDS[1]),
        maxBoundsViscosity: 1,
        zoomControl: false,
        zoomSnap: 0.5,
        attributionControl: true,
      });
      mapRef.current = map;
      map.fitBounds(L.latLngBounds(NOA_BOUNDS[0], NOA_BOUNDS[1]));

      // Un panel por capa: el cambio regional/detalle y el toggle son solo CSS.
      for (const [name, zIndex] of [
        ["dengue-region", "440"],
        ["dengue-hexes", "450"],
        ["dengue-region-labels", "630"],
        ["dengue-labels", "640"],
      ] as const) {
        const pane = map.createPane(name);
        pane.style.zIndex = zIndex;
        if (name.endsWith("labels")) pane.style.pointerEvents = "none";
        panesRef.current[name] = pane;
      }

      let tilesLoaded = false;
      let tileErrors = 0;
      const tiles = L.tileLayer(SATELLITE_URL, {
        maxZoom: 18,
        className: "dengue-tiles",
        attribution: SATELLITE_ATTRIBUTION,
      }).addTo(map);
      tiles.on("tileload", () => {
        tilesLoaded = true;
        if (!disposed) setTilesFailed(false);
      });
      tiles.on("tileerror", () => {
        tileErrors += 1;
        // Si la base no carga, queda visible la textura de calles de respaldo.
        if (!disposed && !tilesLoaded && tileErrors >= 4) setTilesFailed(true);
      });

      // GET /risk-map iría acá. Por ahora: grilla H3 simulada, determinista.
      const data = getRiskMapData();
      setCells([...data.region, ...data.detail]);
      setSummaries(data.summaries);

      for (const cell of [...data.region, ...data.detail]) {
        const poly = L.polygon(cell.boundary, {
          ...cellStyle(cell, false),
          pane: cell.scope === "region" ? "dengue-region" : "dengue-hexes",
          bubblingMouseEvents: false,
        }).addTo(map);

        poly.on("click", () => setSelected(cell));
        poly.on("mouseover", () => {
          if (prevSelectedRef.current === cell.h3) return;
          poly.setStyle({ weight: 2.5, opacity: 1 });
        });
        poly.on("mouseout", () => {
          if (prevSelectedRef.current === cell.h3) return;
          poly.setStyle(cellStyle(cell, false));
        });

        // Los paths de Leaflet no son navegables por teclado: los hacemos foco-ables.
        const el = poly.getElement();
        if (el) {
          el.setAttribute("tabindex", "0");
          el.setAttribute("role", "button");
          el.setAttribute(
            "aria-label",
            `${cell.zone}: riesgo ${RISK_LABELS[cell.level]}, ${cell.reports} reportes`,
          );
          el.addEventListener("keydown", (event) => {
            const key = (event as KeyboardEvent).key;
            if (key === "Enter" || key === " ") {
              event.preventDefault();
              setSelected(cell);
            }
          });
        }

        polys.set(cell.h3, poly);
      }

      const label = (text: string, at: LatLng, pane: string, className: string) => {
        L.marker(at, {
          pane,
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className,
            html: `<span>${text}</span>`,
            iconSize: [160, 18],
            iconAnchor: [80, 9],
          }),
        }).addTo(map);
      };

      for (const province of NOA_PROVINCES) {
        label(province.name, province.center, "dengue-region-labels", "dengue-province-label");
        for (const zone of province.zones) {
          label(zone.name, zone.center, "dengue-labels", "dengue-zone-label");
        }
      }

      const syncView = () => {
        if (disposed) return;
        const zoom = map.getZoom();
        const isDetail = zoom >= DETAIL_ZOOM;
        setDetailMode(isDetail);
        if (!isDetail) {
          setActiveRail("noa");
          return;
        }
        const center = map.getCenter();
        let nearest: ProvinceId = "salta";
        let best = Number.POSITIVE_INFINITY;
        for (const province of NOA_PROVINCES) {
          const d = distanceKm([center.lat, center.lng], province.center);
          if (d < best) {
            best = d;
            nearest = province.id;
          }
        }
        setActiveRail(best <= 80 ? nearest : "noa");
      };
      map.on("moveend zoomend", syncView);
      syncView();

      // Click en el fondo (no en un hexágono) cierra la card.
      map.on("click", () => setSelected(null));

      setReady(true);
    })();

    return () => {
      disposed = true;
      polys.clear();
      panesRef.current = {};
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // El contenedor puede cambiar de tamaño (responsive, rotación): Leaflet debe saberlo.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBounds({ w: rect.width, h: rect.height });
      mapRef.current?.invalidateSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Cambio regional <-> detalle según el zoom.
  useEffect(() => {
    const panes = panesRef.current;
    if (!ready) return;
    panes["dengue-region"]?.classList.toggle("dengue-pane-off", detailMode);
    panes["dengue-region-labels"]?.classList.toggle("dengue-pane-off", detailMode);
    panes["dengue-hexes"]?.classList.toggle("dengue-pane-off", !detailMode);
    panes["dengue-labels"]?.classList.toggle("dengue-pane-off", !detailMode);
    setSelected((current) =>
      current && current.scope !== (detailMode ? "detail" : "region") ? null : current,
    );
  }, [detailMode, ready]);

  // Toggle de capas: oculta el heatmap sin desmontar nada.
  useEffect(() => {
    const panes = panesRef.current;
    if (!ready) return;
    panes["dengue-region"]?.classList.toggle("dengue-pane-hidden", !heatOn);
    panes["dengue-hexes"]?.classList.toggle("dengue-pane-hidden", !heatOn);
    if (!heatOn) setSelected(null);
  }, [heatOn, ready]);

  // Resalta la celda elegida y devuelve la anterior a su estilo normal.
  useEffect(() => {
    if (!ready) return;
    const polys = polysRef.current;
    const previous = prevSelectedRef.current;

    if (previous && previous !== selected?.h3) {
      const cell = cellsByH3.get(previous);
      const poly = polys.get(previous);
      if (cell && poly) poly.setStyle(cellStyle(cell, false));
    }
    if (selected) {
      const poly = polys.get(selected.h3);
      if (poly) {
        poly.setStyle(cellStyle(selected, true));
        poly.bringToFront();
      }
    }
    prevSelectedRef.current = selected?.h3 ?? null;
  }, [selected, ready, cellsByH3]);

  // La card sigue a la celda mientras se navega el mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selected) {
      setAnchor(null);
      return;
    }
    const update = () => {
      const point = map.latLngToContainerPoint(selected.center);
      setAnchor({ x: point.x, y: point.y });
    };
    update();
    map.on("move zoom viewreset resize", update);
    return () => {
      map.off("move zoom viewreset resize", update);
    };
  }, [selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (!userPos) return;

    userMarkerRef.current = L.marker(userPos, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "dengue-user-dot",
        html: '<span class="dengue-user-pulse"></span><span class="dengue-user-core"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).addTo(map);
  }, [userPos, ready]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function zoom(delta: 1 | -1) {
    const map = mapRef.current;
    if (!map) return;
    if (delta === 1) map.zoomIn(1);
    else map.zoomOut(1);
  }

  /** Navegación rápida desde la barra lateral. */
  function goTo(selection: RailSelection) {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    setSelected(null);
    setActiveRail(selection);

    if (selection === "noa") {
      map.flyToBounds(L.latLngBounds(NOA_BOUNDS[0], NOA_BOUNDS[1]), { duration: 1 });
      return;
    }
    const province = NOA_PROVINCES.find((p) => p.id === selection);
    if (province) map.flyTo(province.center, province.zoom, { duration: 1.2 });
  }

  function locateMe() {
    const map = mapRef.current;
    if (!map) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showNotice("Este navegador no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        const inArea =
          latitude >= NOA_BOUNDS[0][0] &&
          latitude <= NOA_BOUNDS[1][0] &&
          longitude >= NOA_BOUNDS[0][1] &&
          longitude <= NOA_BOUNDS[1][1];

        if (!inArea) {
          setUserPos(null);
          showNotice("Estás fuera del NOA. Volvemos a la vista regional.");
          goTo("noa");
          return;
        }
        setUserPos([latitude, longitude]);
        map.flyTo([latitude, longitude], 15, { duration: 0.9 });
      },
      () => {
        setLocating(false);
        showNotice("No pudimos obtener tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  const sheetMode = bounds.w > 0 && bounds.w < SHEET_BREAKPOINT;

  return (
    <div className="relative flex min-h-[26rem] w-full flex-1 flex-col overflow-hidden bg-background md:flex-row">
      <ProvinceRail summaries={summaries} active={activeRail} onSelect={goTo} />

      {/* Área del mapa: ocupa todo el ancho restante. */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* Respaldo: si la base satelital no carga, queda esta textura de manzanas. */}
        <div className="dengue-map-fallback absolute inset-0" aria-hidden="true" />
        <div ref={containerRef} className="absolute inset-0" />

        {!ready && (
          <div className="absolute inset-0 z-[880] flex items-center justify-center bg-background/70">
            <p className="text-xs text-muted-foreground">Cargando mapa de riesgo…</p>
          </div>
        )}

        <div className="absolute left-3 top-3 z-[900] flex flex-col gap-2">
          <MapButton label="Acercar" onClick={() => zoom(1)}>
            <Plus className="h-4.5 w-4.5" />
          </MapButton>
          <MapButton label="Alejar" onClick={() => zoom(-1)}>
            <Minus className="h-4.5 w-4.5" />
          </MapButton>
          <MapButton
            label="Centrar en mi ubicación"
            onClick={locateMe}
            active={locating}
            className="mt-1"
          >
            <Crosshair className={`h-4.5 w-4.5 ${locating ? "animate-spin" : ""}`} />
          </MapButton>
          <MapButton
            label={heatOn ? "Ocultar capa de riesgo" : "Mostrar capa de riesgo"}
            onClick={() => setHeatOn((value) => !value)}
            active={heatOn}
            pressed={heatOn}
          >
            <Layers className="h-4.5 w-4.5" />
          </MapButton>
        </div>

        {/* Escala vigente: la grilla H3 cambia de resolución con el zoom. */}
        <p className="pointer-events-none absolute right-3 top-3 z-[900] rounded-full border border-border bg-card/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {detailMode ? "Detalle urbano · H3 res 8" : "Vista regional NOA · H3 res 4"}
        </p>

        {notice && (
          <div
            role="status"
            className="absolute left-1/2 top-3 z-[900] max-w-[min(20rem,calc(100%-6rem))] -translate-x-1/2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-center text-xs text-foreground shadow-xl backdrop-blur"
          >
            {notice}
          </div>
        )}

        {tilesFailed && (
          <p className="absolute bottom-8 left-3 z-[900] rounded-lg border border-border bg-card/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
            Base satelital no disponible — se muestra el esquema de manzanas.
          </p>
        )}

        {selected && anchor && (
          <CellPopover
            cell={selected}
            anchor={anchor}
            bounds={bounds}
            sheetMode={sheetMode}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
  active = false,
  pressed,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      className={`grid h-10 w-10 place-items-center rounded-full border border-border bg-card/90 shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active ? "text-primary" : "text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function CellPopover({
  cell,
  anchor,
  bounds,
  sheetMode,
  onClose,
}: {
  cell: RiskCell;
  anchor: { x: number; y: number };
  bounds: { w: number; h: number };
  sheetMode: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const color = RISK_COLORS[cell.level];

  // Se ubica cerca de la celda, pero nunca fuera del contenedor.
  useLayoutEffect(() => {
    if (sheetMode) {
      setPos(null);
      return;
    }
    const el = ref.current;
    if (!el || bounds.w === 0) return;
    const margin = 12;
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    const maxLeft = Math.max(margin, bounds.w - width - margin);
    const left = Math.min(Math.max(anchor.x - width / 2, margin), maxLeft);

    const above = anchor.y - height - 16;
    const raw = above < margin ? anchor.y + 18 : above;
    const maxTop = Math.max(margin, bounds.h - height - margin);
    const top = Math.min(Math.max(raw, margin), maxTop);

    setPos((current) =>
      current && current.left === left && current.top === top ? current : { left, top },
    );
  }, [anchor.x, anchor.y, bounds.w, bounds.h, sheetMode, cell.h3]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Detalle de riesgo en ${cell.zone}`}
      className={
        sheetMode
          ? "absolute bottom-3 left-3 right-3 z-[900] rounded-2xl border border-border bg-popover p-3.5 shadow-2xl"
          : "absolute z-[900] w-[15.5rem] rounded-2xl border border-border bg-popover p-3.5 shadow-2xl transition-opacity"
      }
      style={
        sheetMode
          ? undefined
          : { left: pos?.left ?? -9999, top: pos?.top ?? 0, opacity: pos ? 1 : 0 }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          Riesgo:{" "}
          <span className="font-bold" style={{ color }}>
            {RISK_LABELS[cell.level]}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="-mr-1.5 -mt-1.5 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="mt-2 h-1 w-full rounded-full"
        style={{ backgroundColor: color, opacity: 0.75 }}
      />

      <dl className="mt-3 space-y-1.5 text-xs">
        <Row label="Reportes">
          <span className="font-mono font-semibold">{cell.reports}</span>
        </Row>
        <Row label="Último reporte">{cell.lastReportAt}</Row>
        <Row label="Lluvia reciente">
          {cell.recentRain ? (
            <span className="font-semibold" style={{ color: RISK_COLORS.medio }}>
              Sí, hace {cell.rainHoursAgo} h
            </span>
          ) : (
            "No"
          )}
        </Row>
        <Row label={cell.scope === "region" ? "Provincia" : "Zona"}>{cell.zone}</Row>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{children}</dd>
    </div>
  );
}
