/**
 * Asistente de dengue con Groq.
 *
 * IMPORTANTE: esto es una server function de TanStack Start. El handler corre
 * SOLO en el servidor, así que GROQ_API_KEY nunca viaja al navegador. Por eso la
 * variable va SIN prefijo VITE_ en frontend/.env.local: si tuviera el prefijo,
 * Vite la meteria en el bundle del cliente y quedaria publica.
 *
 * Usa la API REST de Groq con fetch en vez del paquete groq-sdk para no agregar
 * dependencias nuevas al frontend.
 */
import { createServerFn } from "@tanstack/react-start";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Mismo modelo que usa el backend en src/services/groq.js. */
const MODEL = "llama-3.1-8b-instant";

const MAX_PREGUNTA = 500;
const MAX_CONTEXTO = 1500;
/** Cuantos turnos previos mandamos, para no inflar el prompt. */
const MAX_HISTORIAL = 6;

export interface MensajeChat {
  rol: "user" | "assistant";
  texto: string;
}

export type RespuestaAsistente = { ok: true; texto: string } | { ok: false; error: string };

interface EntradaAsistente {
  pregunta: string;
  historial: MensajeChat[];
  contexto: string;
}

const SYSTEM_PROMPT = `Sos el asistente de Dengue Centinela, una app de vigilancia comunitaria de dengue en Salta capital, Argentina.

Podés ayudar con:
- Prevención del dengue: descacharrado, eliminar agua estancada, tapar tanques, cambiar el agua de floreros y bebederos, repelente, mosquiteros.
- Interpretar el mapa de riesgo de la app: el score va de 0 a 100 por barrio, y se calcula con los reportes vecinales de los últimos 7 días más el factor climático (la lluvia reciente aumenta el riesgo porque deja criaderos).
- Explicar cómo reportar un caso o un criadero desde la app.

Reglas que tenés que cumplir siempre:
- Contestá en español rioplatense, claro y breve: 2 a 4 oraciones. Usá lista corta solo si te piden pasos.
- NO diagnostiques ni recomiendes medicación. Si la persona describe síntomas (fiebre, dolor de cabeza, dolor detrás de los ojos, dolor muscular o de articulaciones, manchas en la piel), decile que consulte al centro de salud más cercano o llame al 107, y aclarale que no tome aspirina ni ibuprofeno sin indicación médica.
- Si te preguntan por un barrio puntual, usá únicamente los datos del contexto. Si ese barrio no aparece, decí que no tenés datos de esa zona.
- No inventes números ni nombres de barrios. Si el dato no está en el contexto, no lo afirmes.
- Si la pregunta no tiene relación con dengue, salud pública o esta app, decilo en una oración y ofrecé ayudar con dengue.`;

function limpiarMensaje(value: unknown): MensajeChat | null {
  const m = (value ?? {}) as Record<string, unknown>;
  const rol = m["rol"] === "assistant" ? "assistant" : m["rol"] === "user" ? "user" : null;
  const texto = String(m["texto"] ?? "").trim();
  if (!rol || !texto) return null;
  return { rol, texto: texto.slice(0, MAX_PREGUNTA) };
}

export const preguntarAlAsistente = createServerFn({ method: "POST" })
  .validator((data: unknown): EntradaAsistente => {
    const d = (data ?? {}) as Record<string, unknown>;

    const pregunta = String(d["pregunta"] ?? "")
      .trim()
      .slice(0, MAX_PREGUNTA);
    if (pregunta.length === 0) throw new Error("La pregunta viene vacía.");

    const crudo = Array.isArray(d["historial"]) ? d["historial"] : [];
    const historial = crudo
      .slice(-MAX_HISTORIAL)
      .map(limpiarMensaje)
      .filter((m): m is MensajeChat => m !== null);

    return {
      pregunta,
      historial,
      contexto: String(d["contexto"] ?? "").slice(0, MAX_CONTEXTO),
    };
  })
  .handler(async ({ data }): Promise<RespuestaAsistente> => {
    // Notacion de corchetes por noPropertyAccessFromIndexSignature del tsconfig.
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) {
      return {
        ok: false,
        error:
          "Falta GROQ_API_KEY en frontend/.env.local (sin prefijo VITE_). Reiniciá el dev server después de agregarla.",
      };
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(data.contexto
        ? [{ role: "system", content: `Datos actuales del mapa:\n${data.contexto}` }]
        : []),
      ...data.historial.map((m) => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: m.texto,
      })),
      { role: "user", content: data.pregunta },
    ];

    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        // No filtramos el body de Groq al cliente: puede traer detalles de la cuenta.
        console.error(`Groq respondió ${res.status}: ${await res.text()}`);
        const detalle =
          res.status === 401
            ? "la GROQ_API_KEY es inválida o expiró"
            : res.status === 429
              ? "se alcanzó el límite de pedidos de Groq, probá en unos segundos"
              : `Groq respondió ${res.status}`;
        return { ok: false, error: `No pude consultar al asistente: ${detalle}.` };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const texto = json.choices?.[0]?.message?.content?.trim();
      if (!texto) return { ok: false, error: "El asistente devolvió una respuesta vacía." };

      return { ok: true, texto };
    } catch (error) {
      console.error("Fallo la consulta a Groq:", error);
      const esTimeout = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        error: esTimeout
          ? "El asistente tardó demasiado en responder. Probá de nuevo."
          : "No se pudo conectar con Groq. Revisá la conexión.",
      };
    }
  });
