import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { getStatus } from '../services/api.js';

const CENTRO_SALTA = [-24.7859, -65.4117];

function colorPorScore(score) {
  if (score >= 70) return '#ef4444'; // rojo
  if (score >= 40) return '#f59e0b'; // amarillo
  return '#22c55e'; // verde
}

export default function HeatMap({ onSelectZona }) {
  const [zonas, setZonas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getStatus()
      .then((data) => setZonas(data.zonas))
      .catch((err) => console.error('Error cargando /status:', err))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="relative h-full w-full">
      {cargando && (
        <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded bg-slate-800 px-3 py-1 text-sm text-white">
          Cargando zonas...
        </div>
      )}
      <MapContainer center={CENTRO_SALTA} zoom={13} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {zonas.map((zona) => (
          <CircleMarker
            key={zona.barrio}
            center={[zona.lat, zona.lng]}
            radius={10 + zona.score / 5}
            pathOptions={{
              color: colorPorScore(zona.score),
              fillColor: colorPorScore(zona.score),
              fillOpacity: 0.6,
            }}
            eventHandlers={{ click: () => onSelectZona(zona) }}
          >
            <Popup>
              <strong>{zona.barrio}</strong>
              <br />
              Score: {zona.score}
              <br />
              Reportes (7d): {zona.reportes_7d}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
