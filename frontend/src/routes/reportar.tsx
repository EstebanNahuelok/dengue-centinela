import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HexMap } from "@/components/HexMap";
import { RiskBadge } from "@/components/RiskBadge";
import { SYMPTOMS, riskLevel, type Hex, type Report } from "@/lib/mock-data";
import { addReport, useAppState } from "@/lib/store";

export const Route = createFileRoute("/reportar")({
  head: () => ({
    meta: [
      { title: "Reportar síntomas o criaderos — Dengue Centinela" },
      {
        name: "description",
        content:
          "Cargá en un minuto un reporte de síntomas o de agua estancada y ayudá a anticipar brotes de dengue en tu barrio.",
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

type Tipo = Report["type"];

function ReportarPage() {
  const { hexes } = useAppState();
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState<Tipo>("criadero");
  const [hex, setHex] = useState<Hex | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [photo, setPhoto] = useState(false);
  const [resultado, setResultado] = useState<{ zone: string; score: number } | null>(null);

  const toggle = (s: string) =>
    setSymptoms((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const enviar = () => {
    if (!hex) return;
    // POST /reports  (multipart/form-data con la foto y la geolocalización)
    const { hex: updated } = addReport({
      type: tipo,
      zone: hex.zone,
      hexId: hex.id,
      symptoms,
      photo,
    });
    if (updated) setResultado({ zone: updated.zone, score: updated.score });
    setStep(5);
  };

  if (step === 5 && resultado) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-risk-low/40 bg-risk-low/15 text-2xl text-risk-low">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">Reporte enviado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gracias. Tu reporte ya se sumó al mapa de {resultado.zone}.
          </p>
          <div className="mt-5 rounded-xl border border-border bg-secondary p-4">
            <p className="text-xs text-muted-foreground">Nuevo nivel de riesgo de la zona</p>
            <div className="mt-2 flex items-center justify-center">
              <RiskBadge score={resultado.score} />
            </div>
            {riskLevel(resultado.score) === "alto" && (
              <p className="mt-3 text-xs text-risk-critical">
                Umbral superado: se notificó al municipio y a los vecinos cercanos.
              </p>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Esto no es un diagnóstico médico. Si tenés síntomas, consultá al sistema de salud.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/mapa"
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Ver el mapa
            </Link>
            <Link
              to="/panel"
              className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground"
            >
              Ver panel del municipio
            </Link>
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
          <h2 className="text-sm font-semibold text-foreground">¿Dónde?</h2>
          <p className="text-xs text-muted-foreground">
            Tocá un hexágono para ubicar el reporte, o usá tu ubicación.
          </p>
          <button
            onClick={() => setHex(hexes[22] ?? hexes[0] ?? null)}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground"
          >
            Usar mi ubicación
          </button>
          <div className="h-56 overflow-hidden rounded-xl border border-border bg-card">
            <HexMap hexes={hexes} selectedId={hex ? hex.id : null} onSelect={setHex} />
          </div>
          {hex && (
            <p className="text-xs text-muted-foreground">
              Seleccionado: <span className="text-foreground">{hex.zone}</span> · H3 {hex.h3}
            </p>
          )}
          <NavButtons
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            disabled={!hex}
          />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          {needsSymptoms && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Síntomas</h2>
              <div className="grid gap-2">
                {SYMPTOMS.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground"
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
              {/* Mock: la foto no se procesa. Iría en el multipart de POST /reports */}
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
                <span className="text-xs text-muted-foreground">JPG o PNG, hasta 5 MB</span>
              </label>
            </>
          )}
          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Confirmá el reporte</h2>
          <dl className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            <Row k="Tipo" v={tipo} />
            <Row k="Zona" v={hex?.zone ?? "-"} />
            {symptoms.length > 0 && <Row k="Síntomas" v={symptoms.join(", ")} />}
            {needsPhoto && <Row k="Foto" v={photo ? "Adjunta" : "Sin foto"} />}
          </dl>
          <p className="rounded-xl border border-risk-high/40 bg-risk-high/10 p-3 text-xs text-risk-high">
            Esto no es un diagnóstico médico. Si tenés síntomas, consultá al sistema de salud.
          </p>
          <NavButtons onBack={() => setStep(3)} onNext={enviar} nextLabel="Enviar reporte" />
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
