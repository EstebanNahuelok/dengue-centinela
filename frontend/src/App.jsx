import { useState } from 'react';
import HeatMap from './components/HeatMap.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import { postRecalcular } from './services/api.js';

export default function App() {
  const [zonaSeleccionada, setZonaSeleccionada] = useState(null);
  const [recalculando, setRecalculando] = useState(false);

  async function handleRecalcular() {
    setRecalculando(true);
    try {
      await postRecalcular();
      window.location.reload(); // simple para el MVP: recarga y trae el /status nuevo
    } catch (err) {
      console.error('Error en /recalcular:', err);
      setRecalculando(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-900 text-white">
      <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <h1 className="text-xl font-bold">Dengue Centinela — Salta Capital</h1>
        <button
          onClick={handleRecalcular}
          disabled={recalculando}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
        >
          {recalculando ? 'Recalculando...' : 'Recalcular riesgo'}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <HeatMap onSelectZona={setZonaSeleccionada} />
        </div>
        <DetailPanel zona={zonaSeleccionada} />
      </div>
    </div>
  );
}
