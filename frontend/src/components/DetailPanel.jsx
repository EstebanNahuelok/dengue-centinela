export default function DetailPanel({ zona }) {
  return (
    <aside className="w-80 shrink-0 border-l border-slate-700 bg-slate-800 p-6">
      <h2 className="mb-4 text-lg font-semibold">Detalle de zona</h2>

      {!zona && <p className="text-sm text-slate-400">Tocá un barrio en el mapa para ver el detalle.</p>}

      {zona && (
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-400">Barrio</dt>
            <dd className="text-base font-medium">{zona.barrio}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Score de riesgo</dt>
            <dd className="text-base font-medium">{zona.score} / 100</dd>
          </div>
          <div>
            <dt className="text-slate-400">Reportes (últimos 7 días)</dt>
            <dd className="text-base font-medium">{zona.reportes_7d}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Factor climático</dt>
            <dd className="text-base font-medium capitalize">{zona.factor_clima}</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
