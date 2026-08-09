import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CloudRain,
  Crosshair,
  Hospital as HospitalIcon,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  X,
} from "lucide-react";
import type * as Leaflet from "leaflet";

import { ProvinceRail, type RailSelection } from "@/components/ProvinceRail";
import { HOSPITALES } from "@/lib/hospitales";
import {
  HORIZONTES,
  predecirRiesgo,
  type Escenario,
  type Horizonte,
  type ResultadoPrediccion,
} from "@/lib/prediccion";
import {
  USING_MOCK,
  getStatus,
  postRecalcular,
  type StatusResponse,
  type StatusZona,
} from "@/lib/api";
import {
  DETAIL_ZOOM,
  NOA_BOUNDS,
  NOA_CENTER,
  NOA_PROVINCES,
  RISK_COLORS,
  RISK_LABELS,
  applyStatusToRiskMap,
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

/** Los nombres de barrio vienen del backend y se inyectan en un divIcon. */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Cruz médica del marcador de hospital. */
const CRUZ_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<rect x="6.6" y="3" width="2.8" height="10" rx="0.7"/>' +
  '<rect x="3" y="6.6" width="10" height="2.8" rx="0.7"/>' +
  "</svg>";

/** Hora de Argentina, corta. Sólo se usa en cliente (después del fetch). */
function formatUpdatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Salta",
  });
}

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
  /** Celdas vigentes por índice H3: los handlers de Leaflet leen de acá para no
   *  quedarse con la versión que existía cuando se creó el polígono. */
  const cellsRef = useRef(new Map<string, RiskCell>());
  /** Etiquetas de barrio de Salta: se reemplazan con los barrios reales. */
  const saltaLabelsRef = useRef<Leaflet.Marker[]>([]);
  /** Marcadores de hospitales y centros de salud. */
  const hospitalesRef = useRef<Leaflet.Marker[]>([]);

  const [cells, setCells] = useState<RiskCell[]>([]);
  const [summaries, setSummaries] = useState<ProvinceSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [detailMode, setDetailMode] = useState(false);
  const [activeRail, setActiveRail] = useState<RailSelection>("noa");
  const [selected, setSelected] = useState<RiskCell | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [bounds, setBounds] = useState({ w: 0, h: 0 });
  const [heatOn, setHeatOn] = useState(true);
  const [hospitalesOn, setHospitalesOn] = useState(true);
  const [locating, setLocating] = useState(false);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveData, setLiveData] = useState(false);
  const [prediccion, setPrediccion] = useState<Extract<ResultadoPrediccion, { ok: true }> | null>(
    null,
  );
  const [prediciendo, setPrediciendo] = useState(false);
  // Arranca en "temporada": con el pronóstico real de invierno el mapa no se
  // mueve y no se ve qué hace el modelo. Se puede cambiar en vivo.
  const [escenario, setEscenario] = useState<Escenario>("temporada");

  const cellsByH3 = useMemo(() => new Map(cells.map((c) => [c.h3, c])), [cells]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  useEffect(() => {
    cellsRef.current = cellsByH3;
  }, [cellsByH3]);

  /** Pinta la grilla H3 con un set de zonas (sirve para actual y para proyección). */
  const pintarZonas = useCallback((zonas: StatusZona[]) => {
    const merged = applyStatusToRiskMap(getRiskMapData(), zonas);
    setCells([...merged.region, ...merged.detail]);
    setSummaries(merged.summaries);
  }, []);

  /** Reproyecta la grilla con los scores reales por barrio. */
  const applyStatus = useCallback(
    (data: StatusResponse) => {
      pintarZonas(data.zonas);
      setStatus(data);
      setLiveData(!USING_MOCK);
      // Datos nuevos invalidan la proyección anterior.
      setPrediccion(null);
    },
    [pintarZonas],
  );

  /**
   * Corre la predicción y repinta los mismos hexágonos con el score proyectado.
   * No cambia la geometría: sólo el color, así el mapa sigue siendo el mismo.
   */
  const correrPrediccion = useCallback(
    async (horizonte: Horizonte) => {
      if (!status || status.zonas.length === 0) {
        showNotice("Todavía no hay datos del mapa para proyectar.");
        return;
      }
      setPrediciendo(true);
      try {
        const resultado = await predecirRiesgo({
          data: {
            zonas: status.zonas.map((z) => ({
              barrio: z.barrio,
              lat: z.lat,
              lng: z.lng,
              score: z.score,
              reportes_7d: z.reportes_7d,
            })),
            horizonte,
            escenario,
          },
        });

        if (!resultado.ok) {
          showNotice(resultado.error);
          return;
        }

        setPrediccion(resultado);
        pintarZonas(
          resultado.zonas.map((z) => ({
            barrio: z.barrio,
            lat: z.lat,
            lng: z.lng,
            score: z.scoreProyectado,
            reportes_7d: z.reportes_7d,
            // Categoría derivada de la lluvia prevista, mismos cortes que el backend.
            factor_clima:
              z.factores.lluviaMm >= 30 ? "alto" : z.factores.lluviaMm >= 10 ? "medio" : "bajo",
          })),
        );

        const { suben, bajan, lluviaMm } = resultado.resumen;
        const etiqueta =
          resultado.escenario === "temporada" ? "escenario de temporada (simulado)" : "clima real";
        showNotice(
          `Proyección a ${horizonte} días · ${etiqueta} · ${lluviaMm} mm · ${suben} barrios suben, ${bajan} bajan`,
        );
      } catch (error) {
        const detalle = error instanceof Error ? error.message : "error desconocido";
        showNotice(`No se pudo predecir: ${detalle}`);
      } finally {
        setPrediciendo(false);
      }
    },
    [status, pintarZonas, showNotice, escenario],
  );

  /** Vuelve a mostrar la situación actual. */
  const volverAActual = useCallback(() => {
    setPrediccion(null);
    if (status) pintarZonas(status.zonas);
  }, [status, pintarZonas]);

  /**
   * "init" hace GET /status al montar; "recalc" es el botón del pitch y hace
   * POST /recalcular. Si el backend no responde, el mapa se queda con la
   * grilla simulada y se avisa por pantalla en vez de romperse.
   */
  const loadStatus = useCallback(
    async (mode: "init" | "recalc") => {
      setRefreshing(true);
      try {
        const data = mode === "recalc" ? await postRecalcular() : await getStatus();
        applyStatus(data);
        if (mode === "recalc") {
          showNotice(`Riesgo recalculado · ${data.zonas.length} barrios actualizados`);
        }
      } catch (error) {
        setLiveData(false);
        const detail = error instanceof Error ? error.message : "error desconocido";
        showNotice(`Sin conexión al backend (${detail}). Se muestra la grilla simulada.`);
      } finally {
        setRefreshing(false);
      }
    },
    [applyStatus, showNotice],
  );

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
        // Los hospitales van sobre los hexágonos pero debajo de los rótulos.
        ["dengue-hospitals", "620"],
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

        // Siempre resolvemos la celda vigente: después de /recalcular los
        // scores cambian pero el polígono sigue siendo el mismo objeto.
        const current = () => cellsRef.current.get(cell.h3) ?? cell;

        poly.on("click", () => setSelected(current()));
        poly.on("mouseover", () => {
          if (prevSelectedRef.current === cell.h3) return;
          poly.setStyle({ weight: 2.5, opacity: 1 });
        });
        poly.on("mouseout", () => {
          if (prevSelectedRef.current === cell.h3) return;
          poly.setStyle(cellStyle(current(), false));
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
              setSelected(current());
            }
          });
        }

        polys.set(cell.h3, poly);
      }

      const label = (text: string, at: LatLng, pane: string, className: string) =>
        L.marker(at, {
          pane,
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className,
            html: `<span>${escapeHtml(text)}</span>`,
            iconSize: [160, 18],
            iconAnchor: [80, 9],
          }),
        }).addTo(map);

      for (const province of NOA_PROVINCES) {
        label(province.name, province.center, "dengue-region-labels", "dengue-province-label");
        for (const zone of province.zones) {
          const marker = label(zone.name, zone.center, "dengue-labels", "dengue-zone-label");
          // Guardamos las de Salta: se reemplazan por los barrios que informe
          // GET /status, así el rótulo del mapa coincide con la card.
          if (province.id === "salta") saltaLabelsRef.current.push(marker);
        }
      }

      // Hospitales y centros de salud de las 6 provincias del NOA.
      hospitalesRef.current = HOSPITALES.map((h) => {
        const grande = h.tipo === "hospital";
        const lado = grande ? 18 : 13;
        const etiqueta = `${grande ? "Hospital" : "Centro de salud"}: ${h.nombre}${
          h.guardia === true ? " (con guardia)" : ""
        }`;

        const marker = L.marker([h.lat, h.lng], {
          pane: "dengue-hospitals",
          keyboard: true,
          title: etiqueta,
          alt: etiqueta,
          riseOnHover: true,
          icon: L.divIcon({
            className: `dengue-hospital-dot${grande ? " dengue-hospital-dot--grande" : ""}`,
            html: `<span>${CRUZ_SVG}</span>`,
            iconSize: [lado, lado],
            iconAnchor: [lado / 2, lado / 2],
          }),
        }).addTo(map);

        marker.bindTooltip(
          `<strong>${escapeHtml(h.nombre)}</strong>${h.guardia === true ? "<br/>Con guardia" : ""}`,
          { direction: "top", offset: [0, -lado / 2] },
        );

        // El click en un hospital no debe cerrar la card de la celda.
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event as unknown as Event);
        });

        return marker;
      });

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
      saltaLabelsRef.current = [];
      hospitalesRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // GET /status en cuanto el mapa está montado. Va en un efecto aparte para no
  // reconstruir la grilla entera cada vez que cambia loadStatus.
  useEffect(() => {
    if (!ready) return;
    void loadStatus("init");
  }, [ready, loadStatus]);

  // Repinta los polígonos cuando llegan scores nuevos (carga inicial y
  // /recalcular). No se recrean: sólo cambia el estilo y la etiqueta accesible.
  useEffect(() => {
    if (!ready) return;
    const polys = polysRef.current;

    for (const cell of cells) {
      const poly = polys.get(cell.h3);
      if (!poly) continue;
      poly.setStyle(cellStyle(cell, prevSelectedRef.current === cell.h3));
      poly
        .getElement()
        ?.setAttribute(
          "aria-label",
          `${cell.zone}: riesgo ${RISK_LABELS[cell.level]}, ${cell.reports} reportes`,
        );
    }

    // Si hay una card abierta, que muestre los datos nuevos y no los viejos.
    setSelected((current) => (current ? (cellsByH3.get(current.h3) ?? current) : current));
  }, [cells, ready, cellsByH3]);

  // Rótulos de barrio de Salta según los datos reales.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L || !status || status.zonas.length === 0) return;

    for (const marker of saltaLabelsRef.current) marker.remove();
    saltaLabelsRef.current = status.zonas.map((zona) =>
      L.marker([zona.lat, zona.lng], {
        pane: "dengue-labels",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "dengue-zone-label",
          html: `<span>${escapeHtml(zona.barrio)}</span>`,
          iconSize: [160, 18],
          iconAnchor: [80, 9],
        }),
      }).addTo(map),
    );
  }, [status, ready]);

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

  // Capa de hospitales: se apaga por CSS, sin desmontar los marcadores.
  useEffect(() => {
    if (!ready) return;
    panesRef.current["dengue-hospitals"]?.classList.toggle("dengue-pane-hidden", !hospitalesOn);
  }, [hospitalesOn, ready]);

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
    <div className="relative flex min-h-[26rem] w-full flex-1 flex-col overflow-hidden bg-background isolate md:flex-row">
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

        <div className="absolute bottom-24 left-2 z-[900] flex flex-col gap-1.5 sm:bottom-auto sm:left-3 sm:top-3 sm:gap-2">
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
          <MapButton
            label={
              hospitalesOn
                ? "Ocultar hospitales y centros de salud"
                : "Mostrar hospitales y centros de salud"
            }
            onClick={() => setHospitalesOn((value) => !value)}
            active={hospitalesOn}
            pressed={hospitalesOn}
          >
            <HospitalIcon className="h-4.5 w-4.5" />
          </MapButton>
        </div>

        <div className="absolute right-2 top-2 z-[900] flex max-w-[calc(100%-4rem)] flex-col items-end gap-1.5 sm:right-3 sm:top-3 sm:max-w-none sm:gap-2">
          {/* Momento clave del pitch: dispara POST /recalcular en vivo. */}
          <button
            type="button"
            onClick={() => void loadStatus("recalc")}
            disabled={refreshing}
            aria-busy={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1.5 text-[11px] font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 sm:h-3.5 sm:w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {/* En pantallas chicas queda solo el ícono, para no comerse el mapa. */}
            <span className="hidden sm:inline">
              {refreshing ? "Recalculando…" : "Actualizar mapa"}
            </span>
          </button>

          {/* Predicción: proyecta el riesgo con el pronóstico de Open-Meteo.
              Repinta los mismos hexágonos, no cambia la geometría del mapa. */}
          <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
            {prediccion && (
              <button
                type="button"
                onClick={volverAActual}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1.5 text-[11px] font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Ver actual</span>
              </button>
            )}

            {HORIZONTES.map((h) => {
              const activo = prediccion?.horizonte === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => void correrPrediccion(h)}
                  disabled={prediciendo}
                  aria-pressed={activo}
                  aria-label={`Predecir riesgo a ${h} días`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1.5 text-[11px] font-semibold shadow-lg backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs ${
                    activo
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border bg-card/90 text-foreground hover:bg-accent"
                  }`}
                >
                  <TrendingUp
                    className={`h-3.5 w-3.5 sm:h-3.5 sm:w-3.5 ${prediciendo ? "animate-pulse" : ""}`}
                  />
                  {prediciendo ? "…" : `+${h}d`}
                </button>
              );
            })}

            {/* Fuente del clima que alimenta la proyección. Si ya hay una
                proyección en pantalla, cambiar de escenario la recalcula. */}
            <button
              type="button"
              onClick={() => {
                const siguiente: Escenario = escenario === "real" ? "temporada" : "real";
                setEscenario(siguiente);
                if (prediccion) void correrPrediccion(prediccion.horizonte as Horizonte);
              }}
              disabled={prediciendo}
              aria-label={`Clima usado para predecir: ${
                escenario === "real" ? "pronóstico real" : "escenario de temporada simulado"
              }. Tocá para cambiar.`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1.5 text-[11px] font-medium text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
            >
              <CloudRain className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {escenario === "real" ? "real" : "temporada"}
            </button>
          </div>

          {/* Mientras hay proyección activa, decimos de dónde sale. */}
          {prediccion && (
            <p className="pointer-events-none flex max-w-[11rem] items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-medium text-foreground backdrop-blur sm:max-w-[15rem] sm:gap-1.5 sm:px-3 sm:text-[11px]">
              <CloudRain className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                +{prediccion.horizonte}d ·{" "}
                {prediccion.escenario === "temporada" ? "simulado" : "real"} ·{" "}
                {prediccion.resumen.lluviaMm} mm · {prediccion.resumen.tempMedia}°C
              </span>
            </p>
          )}

          {/* Escala vigente segun el zoom. Texto en criollo, sin jerga tecnica
              (H3/resolucion es implementacion interna, no le importa a quien
              mira la demo). Se oculta en celular: es informacion secundaria. */}
          <p className="pointer-events-none hidden rounded-full border border-border bg-card/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur sm:block">
            {detailMode ? "Detalle urbano" : "Vista regional NOA"}
          </p>

          {/* Que quede explícito si los números son reales o simulados, sin
              nombrar "backend" — esto lo ve el jurado, no un programador. */}
          {status && (
            <p className="pointer-events-none flex items-center gap-1.5 rounded-full border border-border bg-card/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: liveData ? RISK_COLORS.bajo : RISK_COLORS.medio }}
              />
              {/* En celular solo la hora: el texto completo no entra. */}
              <span className="hidden sm:inline">
                {liveData ? "Datos en vivo" : "Datos simulados"} ·{" "}
              </span>
              {formatUpdatedAt(status.ultima_actualizacion)}
            </p>
          )}
        </div>

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
            horizonte={prediccion?.horizonte ?? null}
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
      /* 44px en touch (recomendación de accesibilidad), 40px desde sm. */
      className={`grid h-11 w-11 place-items-center rounded-full border border-border bg-card/90 shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:w-10 ${
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
  horizonte,
  onClose,
}: {
  cell: RiskCell;
  anchor: { x: number; y: number };
  bounds: { w: number; h: number };
  sheetMode: boolean;
  /** Si hay proyección activa, a cuántos días. null = situación actual. */
  horizonte: number | null;
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
          ? // bottom-24 y no bottom-3: deja libre el botón flotante del asistente
            // y la atribución de OSM/Esri, que van abajo.
            "absolute bottom-24 left-3 right-3 z-[900] rounded-2xl border border-border bg-popover p-3.5 shadow-2xl"
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
          {horizonte === null ? "Riesgo: " : `Riesgo proyectado (+${horizonte}d): `}
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
        {/* GET /status no informa la fecha del último reporte: se omite la fila
            en lugar de mostrar un valor inventado. */}
        {cell.lastReportAt !== "" && <Row label="Último reporte">{cell.lastReportAt}</Row>}
        {/* En proyección la lluvia es la prevista, no la que ya cayó. */}
        {horizonte === null ? (
          <Row label="Lluvia reciente">
            {cell.recentRain ? (
              <span className="font-semibold" style={{ color: RISK_COLORS.medio }}>
                Sí, hace {cell.rainHoursAgo} h
              </span>
            ) : (
              "No"
            )}
          </Row>
        ) : (
          <Row label="Lluvia prevista">
            {cell.recentRain ? (
              <span className="font-semibold" style={{ color: RISK_COLORS.medio }}>
                Sí, en la ventana de cría
              </span>
            ) : (
              "Escasa"
            )}
          </Row>
        )}
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
