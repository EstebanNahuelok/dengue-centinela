import { riskLevel, type RiskLevel } from "@/lib/mock-data";

const styles: Record<RiskLevel, string> = {
  bajo: "bg-risk-low/15 text-risk-low border-risk-low/40",
  moderado: "bg-risk-mid/15 text-risk-mid border-risk-mid/40",
  medio: "bg-risk-high/15 text-risk-high border-risk-high/40",
  alto: "bg-risk-critical/15 text-risk-critical border-risk-critical/40",
};

export function riskColor(score: number) {
  const l = riskLevel(score);
  return l === "alto"
    ? "var(--risk-critical)"
    : l === "medio"
      ? "var(--risk-high)"
      : l === "moderado"
        ? "var(--risk-mid)"
        : "var(--risk-low)";
}

export function RiskBadge({
  score,
  showScore = true,
  className = "",
}: {
  score: number;
  showScore?: boolean;
  className?: string;
}) {
  const level = riskLevel(score);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${styles[level]} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level}
      {showScore && <span className="font-mono opacity-70">{score}</span>}
    </span>
  );
}
