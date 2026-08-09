import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { getStatus, type StatusZona } from "@/lib/api";
import { preguntarAlAsistente, type MensajeChat } from "@/lib/asistente";

/** Atajos para que en la demo no haya que tipear. */
const SUGERENCIAS = [
  "¿Cómo elimino criaderos en casa?",
  "¿Qué barrio está peor ahora?",
  "¿Por qué la lluvia aumenta el riesgo?",
];

/** Resumen compacto del mapa para que el modelo pueda hablar de barrios reales. */
function armarContexto(zonas: StatusZona[]) {
  if (zonas.length === 0) return "";
  const filas = [...zonas]
    .sort((a, b) => b.score - a.score)
    .map(
      (z) =>
        `- ${z.barrio}: score ${z.score}/100, ${z.reportes_7d} reportes en 7 días, factor climático ${z.factor_clima}`,
    );
  return `Riesgo por barrio en Salta capital, de mayor a menor:\n${filas.join("\n")}`;
}

export function AsistenteBar() {
  const isMobile = useIsMobile();
  const [abierto, setAbierto] = useState(false);
  const [pregunta, setPregunta] = useState("");
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextoRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autoscroll al último mensaje.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, cargando]);

  /** El contexto del mapa se pide una sola vez, la primera vez que se usa. */
  const obtenerContexto = useCallback(async () => {
    if (contextoRef.current !== null) return contextoRef.current;
    try {
      const status = await getStatus();
      contextoRef.current = armarContexto(status.zonas);
    } catch {
      // Sin datos del mapa el asistente igual sirve para prevención.
      contextoRef.current = "";
    }
    return contextoRef.current;
  }, []);

  const enviar = useCallback(
    async (texto: string) => {
      const limpio = texto.trim();
      if (limpio.length === 0 || cargando) return;

      setError(null);
      setPregunta("");
      setAbierto(true);
      const historial = mensajes.slice(-6);
      setMensajes((prev) => [...prev, { rol: "user", texto: limpio }]);
      setCargando(true);

      try {
        const contexto = await obtenerContexto();
        const respuesta = await preguntarAlAsistente({
          data: { pregunta: limpio, historial, contexto },
        });

        if (respuesta.ok) {
          setMensajes((prev) => [...prev, { rol: "assistant", texto: respuesta.texto }]);
        } else {
          setError(respuesta.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo consultar al asistente.");
      } finally {
        setCargando(false);
      }
    },
    [cargando, mensajes, obtenerContexto],
  );

  const hayConversacion = mensajes.length > 0 || cargando || error !== null;
  const panelAbierto = abierto && hayConversacion;

  // En celular la barra taparia el mapa y su card inferior, asi que arranca
  // colapsada como boton y se despliega como hoja.
  if (isMobile && !abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el asistente de dengue"
        aria-expanded={false}
        className="fixed bottom-4 right-4 z-[1000] grid h-12 w-12 place-items-center rounded-full border border-border bg-primary text-primary-foreground shadow-2xl transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div
      className={`pointer-events-none fixed z-[1000] flex flex-col gap-2 ${
        isMobile
          ? "inset-x-0 bottom-0 w-full p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "bottom-4 right-4 w-[min(24rem,calc(100vw-2rem))]"
      }`}
    >
      {panelAbierto && (
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Asistente de dengue
            </p>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setMensajes([]);
                setError(null);
              }}
              aria-label="Cerrar y borrar la conversación"
              className="-mr-1.5 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className="max-h-[min(24rem,50vh)] space-y-2.5 overflow-y-auto px-3.5 py-3"
            aria-live="polite"
            aria-busy={cargando}
          >
            {mensajes.map((m, i) => (
              <div
                key={`${m.rol}-${i}`}
                className={m.rol === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.rol === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {m.texto}
                </p>
              </div>
            ))}

            {cargando && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Pensando…
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sugerencias: solo antes del primer mensaje, para arrancar rápido. */}
      {!hayConversacion && abierto && (
        <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void enviar(s)}
              className="rounded-full border border-border bg-card/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(pregunta);
        }}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur"
      >
        {isMobile ? (
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              setMensajes([]);
              setError(null);
            }}
            aria-label="Cerrar el asistente"
            className="-ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        )}
        <label htmlFor="asistente-input" className="sr-only">
          Preguntale al asistente de dengue
        </label>
        <input
          id="asistente-input"
          ref={inputRef}
          type="text"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onFocus={() => setAbierto(true)}
          maxLength={500}
          placeholder="Preguntale sobre dengue…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={cargando || pregunta.trim().length === 0}
          aria-label="Enviar pregunta"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        >
          {cargando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </form>
    </div>
  );
}
