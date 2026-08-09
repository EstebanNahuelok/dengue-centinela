import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Brain,
  CloudRain,
  Hexagon,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Siren,
  Stethoscope,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CentinelaIcon } from "@/components/brand/Logo";
import { useAppState } from "@/lib/store";
import { riskLevel, ZONES } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dengue Centinela — Vigilancia comunitaria de dengue en Salta" },
      {
        name: "description",
        content:
          "Reportá síntomas o criaderos y mirá el mapa de riesgo por hexágonos en tiempo real para tu zona de Salta.",
      },
      { property: "og:title", content: "Dengue Centinela — Vigilancia comunitaria de dengue" },
      {
        property: "og:description",
        content: "Reportes vecinales + datos climáticos = mapa de riesgo y alertas tempranas.",
      },
    ],
  }),
  component: Home,
});

const STEPS = [
  {
    n: "01",
    title: "Reportá",
    body: "Vecinos informan síntomas o agua estancada con foto, por WhatsApp o desde la web. Toma menos de un minuto.",
  },
  {
    n: "02",
    title: "Cruzamos con el clima",
    body: "Un agente combina cada reporte con lluvia reciente y temperatura para estimar el riesgo real de criaderos.",
  },
  {
    n: "03",
    title: "Mapa de calor",
    body: "El riesgo se calcula sobre una grilla de hexágonos H3, no por barrio: precisión de cuadra, no de mancha.",
  },
  {
    n: "04",
    title: "Alerta temprana",
    body: "Cuando una zona supera el umbral, se notifica automáticamente al municipio y a los vecinos cercanos.",
  },
] as const;

// Los cuatro agentes son los que corren de verdad en el backend
// (backend/src/agents/). El color de cada uno sigue la escala de riesgo, así
// la paleta no introduce tonos nuevos.
const AGENTES = [
  {
    icon: MessageCircle,
    tone: "text-risk-low",
    ring: "border-risk-low/40 bg-risk-low/10",
    name: "Conversacional",
    body: "Lleva la entrevista por WhatsApp paso a paso: fiebre, síntomas asociados, barrio. Los signos de alarma se detectan de forma determinista, sin depender del modelo.",
  },
  {
    icon: Brain,
    tone: "text-risk-mid",
    ring: "border-risk-mid/40 bg-risk-mid/10",
    name: "Clasificador",
    body: "Aplica el criterio del protocolo sanitario: fiebre como compuerta más el conteo de síntomas asociados, para decidir sospecha alta, media o no relevante.",
  },
  {
    icon: CloudRain,
    tone: "text-risk-high",
    ring: "border-risk-high/40 bg-risk-high/10",
    name: "Recalculador",
    body: "Cruza los reportes de los últimos 7 días con la lluvia acumulada de la zona y actualiza el score de riesgo de 0 a 100 que pinta el mapa.",
  },
  {
    icon: Stethoscope,
    tone: "text-risk-critical",
    ring: "border-risk-critical/40 bg-risk-critical/10",
    name: "Recomendador",
    body: "Devuelve medidas de alivio no farmacológicas y siempre deriva a un centro de salud. Por diseño nunca nombra un medicamento.",
  },
] as const;

const CANALES = [
  {
    icon: MessageCircle,
    title: "Por WhatsApp",
    body: "El canal principal. No hay que instalar ni registrarse: se escribe al bot y la entrevista guiada hace el resto. Funciona en cualquier celular.",
    tag: "Sin app, sin registro",
  },
  {
    icon: MonitorSmartphone,
    title: "Desde la web",
    body: "El formulario web suma foto del criadero y ubicación exacta. Ideal para promotores de salud que cargan varios focos en una recorrida.",
    tag: "Con foto y ubicación",
  },
] as const;

const FAQ = [
  {
    q: "¿Necesito instalar una app para reportar?",
    a: "No. El canal principal es WhatsApp: le escribís al bot y te va guiando con preguntas cortas. La web es una alternativa si querés adjuntar una foto del criadero.",
  },
  {
    q: "¿Queda expuesto mi número de teléfono?",
    a: "No. El número no se guarda en texto plano: se almacena solamente su hash, que sirve para agrupar reportes del mismo origen sin poder reconstruir el número.",
  },
  {
    q: "¿El sistema da un diagnóstico o receta medicamentos?",
    a: "Nunca. No diagnostica y tiene una prohibición dura de mencionar medicamentos, ni por nombre ni por categoría. Solo sugiere medidas de confort (hidratación, reposo, ambiente fresco) y siempre recomienda ir a un centro de salud.",
  },
  {
    q: "¿Qué pasa si describo un signo de alarma?",
    a: "Ese caso corta el cuestionario al instante y responde con la derivación urgente a hospital o al 911. Esa detección no depende de un modelo de lenguaje: es una regla fija, para que nunca falle por una caída de red.",
  },
  {
    q: "¿De dónde sale el dato de clima?",
    a: "De Open-Meteo, con la lluvia acumulada de los últimos 7 días en las coordenadas de cada zona. El clima empuja el score pero no lo satura solo: sin reportes vecinales no hay alerta.",
  },
] as const;

function Home() {
  const { hexes, reports, alerts } = useAppState();
  const activos = hexes.reduce((a, h) => a + h.reports, 0) + reports.length;
  const enAlerta = hexes.filter((h) => riskLevel(h.score) === "alto").length;

  return (
    <div>
      {/* ---------------------------------------------------------------- *
       * Hero
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-risk-low" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-risk-low" />
              </span>
              Monitoreo activo · Salta capital
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Vigilancia comunitaria de dengue, cuadra por cuadra
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Los reportes de los vecinos, cruzados con datos climáticos, se convierten en un mapa
              de riesgo en tiempo real y en alertas tempranas para el municipio.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/reportar"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Reportar
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/mapa"
                className="rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Ver el mapa
              </Link>
            </div>
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-3">
              {[
                { k: "Reportes activos", v: activos },
                { k: "Hexágonos en alerta", v: enAlerta },
                { k: "Zonas monitoreadas", v: ZONES.length },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-border bg-card p-3">
                  <dt className="text-xs text-muted-foreground">{s.k}</dt>
                  <dd className="mt-1 text-2xl font-bold text-foreground">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 sm:p-10">
              <CentinelaIcon className="mx-auto h-40 w-auto text-foreground sm:h-52" />
              <div className="risk-scale mt-8 h-2 w-full rounded-full" />
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>Bajo</span>
                <span>Moderado</span>
                <span>Medio</span>
                <span>Alto</span>
              </div>
              <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                El color siempre codifica severidad, nunca decoración.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Por qué existe
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-foreground">
                El brote se ve cuando ya es tarde
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                La vigilancia tradicional depende de que el caso llegue al sistema de salud, se
                confirme por laboratorio y recién después se cargue. Para cuando la mancha aparece
                en un informe, el mosquito ya circuló semanas por el barrio.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Los vecinos, en cambio, ven el balde con agua el mismo día. Centinela convierte esa
                observación cotidiana en señal epidemiológica temprana.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Siren,
                  tone: "text-risk-critical",
                  title: "Detección tardía",
                  body: "El circuito de confirmación por laboratorio agrega semanas al aviso.",
                },
                {
                  icon: Hexagon,
                  tone: "text-risk-high",
                  title: "Grano muy grueso",
                  body: "Un promedio por barrio esconde la cuadra donde está el foco real.",
                },
                {
                  icon: Bell,
                  tone: "text-risk-low",
                  title: "Aviso que no vuelve",
                  body: "El vecino reporta y nunca sabe si su aviso sirvió para algo.",
                },
              ].map((c) => (
                <article key={c.title} className="rounded-2xl border border-border bg-card p-5">
                  <c.icon className={`h-5 w-5 ${c.tone}`} aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Cómo funciona
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl font-bold text-foreground">Cómo funciona</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Del mensaje de WhatsApp al hexágono pintado en el mapa, en cuatro pasos.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <article key={s.n} className="rounded-2xl border border-border bg-card p-5">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">Escala de riesgo</p>
            <div className="risk-scale mt-3 h-2 w-full rounded-full" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Riesgo bajo</span>
              <span>Medio</span>
              <span>Alto</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Canales de reporte
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl font-bold text-foreground">Dos formas de reportar</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            La barrera de entrada tenía que ser cero: quien ve el criadero no necesariamente tiene
            lugar en el teléfono para otra app.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {CANALES.map((c) => (
              <article
                key={c.title}
                className="flex flex-col rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10">
                    <c.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold text-foreground">{c.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                <span className="mt-4 inline-flex w-fit items-center rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                  {c.tag}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Los cuatro agentes
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl font-bold text-foreground">Cuatro agentes, una cadena</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Cada agente hace una sola cosa y le pasa el resultado al siguiente. Todos tienen un
            respaldo determinista: si el modelo falla o tarda, el flujo sigue funcionando.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AGENTES.map((a, i) => (
              <article key={a.name} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${a.ring}`}
                  >
                    <a.icon className={`h-5 w-5 ${a.tone}`} aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground">{a.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Seguridad médica
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <div className="rounded-2xl border border-risk-low/40 bg-risk-low/5 p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-risk-low/40 bg-risk-low/10">
                <ShieldCheck className="h-6 w-6 text-risk-low" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-foreground">
                  Un bot de salud que sabe callarse
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  En dengue, la aspirina y los antiinflamatorios están contraindicados por riesgo de
                  sangrado, y cualquier otra opción exige una dosis que depende de edad, peso y
                  antecedentes. Un chatbot no puede evaluar eso.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Por eso el agente que responde tiene prohibido nombrar medicamentos, y un segundo
                  filtro revisa cada respuesta antes de enviarla. Si algo se cuela, se descarta y
                  sale un texto seguro escrito de antemano.
                </p>
                <ul className="mt-5 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {[
                    "Solo medidas de confort: hidratación, reposo, ambiente fresco",
                    "Nunca un diagnóstico: hablamos de síntomas compatibles",
                    "Siempre deriva a un centro de salud, no como letra chica",
                    "Los signos de alarma derivan al instante, sin pasar por el modelo",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-risk-low"
                        aria-hidden="true"
                      />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Preguntas frecuentes
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-2xl font-bold text-foreground">Preguntas frecuentes</h2>
          <Accordion type="single" collapsible className="mt-4">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-border">
                <AccordionTrigger className="text-foreground hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ---------------------------------------------------------------- *
       * Cierre. pb extra: la barra del asistente flota abajo a la derecha.
       * ---------------------------------------------------------------- */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-14 pb-24 sm:pb-14">
          <div className="rounded-3xl border border-border bg-card p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              Un balde con agua es un dato
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Si ves agua estancada en tu cuadra o tenés síntomas, el reporte toma menos de un
              minuto y actualiza el mapa de tu zona al instante.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                to="/reportar"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Hacer un reporte
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/panel"
                className="rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Panel del municipio
              </Link>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              {alerts.length} alertas emitidas · {ZONES.length} zonas monitoreadas en Salta capital
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
