import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BARRIOS, barrioMasCercano } from "@/lib/barrios";
import {
  contarPendientes,
  enviarReporte,
  sincronizarPendientes,
  type ReportePayload,
  type ResultadoEnvio,
} from "@/lib/offline-queue";

export const Route = createFileRoute("/reportar")({
  head: () => ({
    meta: [
      { title: "Reportar síntomas o criaderos — Dengue Centinela" },
      {
        name: "description",
        content:
          "Cargá en un minuto un reporte de síntomas o de agua estancada y ayudá a anticipar brotes de dengue en tu barrio. Funciona sin señal.",
      },
      { property: "og:title", content: "Reportar síntomas o criaderos de dengue" },
      {
        property: "og:description",
        content: "Formulario vecinal rápido: tipo de reporte, ubicación y confirmación.",
      },
    ],
  }),
  component: ReportarPage,
});

type Tipo = "sintomas" | "criadero" | "ambos";

/**
 * Los 6 síntomas asociados del criterio del Ministerio de Salud. La fiebre va
 * aparte porque es la compuerta del Agente 2: sin fiebre, el caso nunca es
 * sospecha (ver backend/src/agents/agente2_clasificador.js).
 */
const SINTOMAS_ASOCIADOS = [
  "dolor de cabeza intenso",
  "dolor detrás de los ojos",
  "dolores musculares o articulares",
  "náuseas o vómitos",
  "sarpullido",
  "cansancio extremo",
] as const;

/**
 * Mismo formato estructurado que arma el webhook de WhatsApp
 * (backend/src/routes/whatsapp.js#descripcionParaSintomas). El Agente 2 está
 * validado contra esta forma exacta, así que no conviene inventar otra.
 */
function descripcionSintomas(fiebre: boolean, sintomas: string[], detalle: string): string {
  const lista = sintomas.length > 0 ? sintomas.join(", ") : "ninguno";
  const propio = detalle.trim() || "(sin detalle adicional)";
  return (
    `Fiebre: ${fiebre ? "sí" : "no"}. Síntomas asociados mencionados: ${lista}. ` +
    `Mensaje original del usuario: "${propio}"`
  );
}

function descripcionCriadero(detalle: string, conFoto: boolean): string {
  const base = detalle.trim() || "Agua estancada reportada por un vecino";
  // La foto no se sube (el backend no almacena imágenes), pero dejamos
  // constancia de que el vecino vio algo concreto como para fotografiarlo.
  return conFoto ? `${base} (el vecino adjuntó una foto)` : base;
}

/** Id anónimo y estable por dispositivo: el backend lo hashea, nunca lo guarda en crudo. */
function obtenerClienteId(): string {
  const CLAVE = "dengue-centinela:cliente-id";
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return guardado;
    const nuevo = crypto.randomUUID();
    localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    return "anonimo";
  }
}

function ReportarPage() {
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState<Tipo>("criadero");
  const [barrio, setBarrio] = useState<string | null>(null);
  const [fiebre, setFiebre] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [detalle, setDetalle] = useState("");
  const [photo, setPhoto] = useState(false);

  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);
  const [ubicando, setUbicando] = useState(false);

  const refrescarPendientes = useCallback(() => {
    contarPendientes()
      .then(setPendientes)
      .catch(() => setPendientes(0));
  }, []);

  // El service worker se registra desde acá (y no en __root.tsx) para que la
  // capacidad offline sea autocontenida en la pantalla que la necesita.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("No se pudo registrar el service worker:", err);
      });
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refrescarPendientes();

    // Fallback obligatorio: Background Sync no existe en Safari/iOS, así que
    // sin este listener esos usuarios se quedarían con el reporte trabado.
    const alVolverLaRed = () => {
      setOnline(true);
      sincronizarPendientes()
        .then(({ enviados }) => {
          if (enviados > 0) {
            setAvisoSync(
              `Se ${enviados === 1 ? "envió el reporte que estaba" : `enviaron los ${enviados} reportes que estaban`} en espera.`,
            );
          }
          refrescarPendientes();
        })
        .catch(() => refrescarPendientes());
    };
    const alPerderLaRed = () => setOnline(false);

    window.addEventListener("online", alVolverLaRed);
    window.addEventListener("offline", alPerderLaRed);

    // El service worker avisa cuando vació la cola por Background Sync.
    const alMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === "reportes-sincronizados") {
        setAvisoSync(`Se sincronizaron ${e.data.enviados} reporte(s) en espera.`);
        refrescarPendientes();
      }
    };
    navigator.serviceWorker?.addEventListener("message", alMensaje);

    return () => {
      window.removeEventListener("online", alVolverLaRed);
      window.removeEventListener("offline", alPerderLaRed);
      navigator.serviceWorker?.removeEventListener("message", alMensaje);
    };
  }, [refrescarPendientes]);

  const toggle = (s: string) =>
    setSymptoms((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const usarMiUbicacion = () => {
    if (!("geolocation" in navigator)) return;
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBarrio(barrioMasCercano(pos.coords.latitude, pos.coords.longitude).nombre);
        setUbicando(false);
      },
      () => setUbicando(false),
      { timeout: 8000 },
    );
  };

  const enviar = async () => {
    if (!barrio || enviando) return;
    setEnviando(true);
    setResultado(null);
    setAvisoSync(null);

    const clienteId = obtenerClienteId();

    // "Ambos" no existe en el backend (el enum es sintoma | criadero), así que
    // se manda como dos reportes reales en vez de perder la mitad del dato.
    const payloads: ReportePayload[] = [];
    if (tipo === "sintomas" || tipo === "ambos") {
      payloads.push({
        tipo: "sintoma",
        barrio,
        descripcion: descripcionSintomas(fiebre, symptoms, detalle),
        clienteId,
      });
    }
    if (tipo === "criadero" || tipo === "ambos") {
      payloads.push({
        tipo: "criadero",
        barrio,
        descripcion: descripcionCriadero(detalle, photo),
        clienteId,
      });
    }

    const resultados = await Promise.all(payloads.map(enviarReporte));

    // Si alguno quedó en cola, el mensaje honesto es "quedó pendiente".
    const error = resultados.find((r) => r.estado === "error");
    const encolado = resultados.find((r) => r.estado === "encolado");
    setResultado(error ?? encolado ?? resultados[0] ?? { estado: "encolado" });

    setEnviando(false);
    refrescarPendientes();
    setStep(5);
  };

  /* ---------------------------------------------------------------- *
   * Paso 5: resultado
   * ---------------------------------------------------------------- */
  if (step === 5 && resultado) {
    const encolado = resultado.estado === "encolado";
    const fallo = resultado.estado === "error";

    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border text-2xl ${
              fallo
                ? "border-risk-critical/40 bg-risk-critical/15 text-risk-critical"
                : encolado
                  ? "border-risk-high/40 bg-risk-high/15 text-risk-high"
                  : "border-risk-low/40 bg-risk-low/15 text-risk-low"
            }`}
          >
            {fallo ? "!" : encolado ? "⏱" : "✓"}
          </div>

          <h1 className="mt-4 text-xl font-bold text-foreground">
            {fallo ? "No se pudo enviar" : encolado ? "Guardado sin conexión" : "Reporte enviado"}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {fallo
              ? resultado.mensaje
              : encolado
                ? "No hay señal ahora mismo, pero tu reporte quedó guardado en el celular y se va a enviar solo apenas vuelva la conexión. No hace falta que lo cargues de nuevo."
                : `Gracias. Tu reporte ya se sumó al mapa de ${barrio}.`}
          </p>

          {!fallo && !encolado && resultado.clasificacion && (
            <div className="mt-5 rounded-xl border border-border bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Clasificación automática</p>
              <p className="mt-1 text-sm font-semibold capitalize text-foreground">
                {resultado.clasificacion.replace("_", " ")}
              </p>
            </div>
          )}

          {encolado && pendientes > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {pendientes} reporte{pendientes === 1 ? "" : "s"} en espera de envío.
            </p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Esto no es un diagnóstico médico. Si tenés síntomas, consultá al centro de salud más
            cercano o llamá al 107.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/mapa"
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Ver el mapa
            </Link>
            <button
              onClick={() => {
                setStep(1);
                setResultado(null);
                setDetalle("");
                setSymptoms([]);
                setFiebre(false);
                setPhoto(false);
              }}
              className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground"
            >
              Cargar otro reporte
            </button>
          </div>
        </div>
      </div>
    );
  }

  const needsSymptoms = tipo === "sintomas" || tipo === "ambos";
  const needsPhoto = tipo === "criadero" || tipo === "ambos";

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Nuevo reporte</h1>
        <div className="mt-3 flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>
      </div>

      {!online && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-risk-high/40 bg-risk-high/10 p-3 text-xs text-risk-high"
        >
          Sin conexión. Cargá el reporte igual: se envía solo cuando vuelva la señal.
        </div>
      )}

      {avisoSync && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-risk-low/40 bg-risk-low/15 p-3 text-xs text-risk-low"
        >
          {avisoSync}
        </div>
      )}

      {pendientes > 0 && !avisoSync && (
        <div className="mb-4 rounded-xl border border-border bg-secondary p-3 text-xs text-muted-foreground">
          {pendientes} reporte{pendientes === 1 ? "" : "s"} en espera de envío.
        </div>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">¿Qué querés reportar?</h2>
          {(
            [
              ["sintomas", "Síntomas", "Alguien en casa tiene fiebre o malestar"],
              ["criadero", "Criadero", "Agua estancada, recipientes, cubiertas"],
              ["ambos", "Ambos", "Síntomas y agua estancada cerca"],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              onClick={() => setTipo(value)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                tipo === value ? "border-primary bg-secondary" : "border-border bg-card"
              }`}
            >
              <span className="block text-sm font-semibold text-foreground">{title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>
            </button>
          ))}
          <NavButtons onNext={() => setStep(2)} />
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">¿En qué barrio?</h2>
          <p className="text-xs text-muted-foreground">
            Elegí tu barrio, o dejá que lo detectemos por tu ubicación.
          </p>
          <button
            onClick={usarMiUbicacion}
            disabled={ubicando}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground disabled:opacity-40"
          >
            {ubicando ? "Buscando tu ubicación…" : "Usar mi ubicación"}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {BARRIOS.map((b) => (
              <button
                key={b.nombre}
                onClick={() => setBarrio(b.nombre)}
                className={`rounded-xl border p-3 text-sm font-medium transition-colors ${
                  barrio === b.nombre
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {b.nombre}
              </button>
            ))}
          </div>

          {barrio && (
            <p className="text-xs text-muted-foreground">
              Seleccionado: <span className="text-foreground">{barrio}</span>
            </p>
          )}
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} disabled={!barrio} />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          {needsSymptoms && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Síntomas</h2>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={fiebre}
                  onChange={(e) => setFiebre(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Fiebre alta (38°C o más)
              </label>
              <div className="grid gap-2">
                {SINTOMAS_ASOCIADOS.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm capitalize text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={symptoms.includes(s)}
                      onChange={() => toggle(s)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </>
          )}

          {needsPhoto && (
            <>
              <h2 className="mt-4 text-sm font-semibold text-foreground">Foto del criadero</h2>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={() => setPhoto(true)}
                />
                <span className="text-sm text-foreground">
                  {photo ? "Foto cargada ✓" : "Tocá para subir una foto"}
                </span>
                <span className="text-xs text-muted-foreground">Opcional</span>
              </label>
            </>
          )}

          <h2 className="mt-4 text-sm font-semibold text-foreground">Contanos con tus palabras</h2>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={
              needsSymptoms
                ? "Ej: tengo fiebre desde ayer y me duele mucho la cabeza"
                : "Ej: hay un neumático con agua estancada hace una semana en el baldío"
            }
            className="w-full rounded-xl border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground"
          />

          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Confirmá el reporte</h2>
          <dl className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            <Row k="Tipo" v={tipo} />
            <Row k="Barrio" v={barrio ?? "-"} />
            {needsSymptoms && <Row k="Fiebre" v={fiebre ? "Sí" : "No"} />}
            {needsSymptoms && symptoms.length > 0 && <Row k="Síntomas" v={symptoms.join(", ")} />}
            {needsPhoto && <Row k="Foto" v={photo ? "Adjunta" : "Sin foto"} />}
          </dl>
          <p className="rounded-xl border border-risk-high/40 bg-risk-high/10 p-3 text-xs text-risk-high">
            Esto no es un diagnóstico médico. Si tenés síntomas, consultá al sistema de salud.
          </p>
          <NavButtons
            onBack={() => setStep(3)}
            onNext={enviar}
            disabled={enviando}
            nextLabel={
              enviando ? "Enviando…" : online ? "Enviar reporte" : "Guardar y enviar con señal"
            }
          />
        </section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate text-right capitalize text-foreground">{v}</dd>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  disabled,
  nextLabel = "Continuar",
}: {
  onBack?: () => void;
  onNext: () => void;
  disabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-2">
      {onBack && (
        <button
          onClick={onBack}
          className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground"
        >
          Atrás
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled}
        className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {nextLabel}
      </button>
    </div>
  );
}
