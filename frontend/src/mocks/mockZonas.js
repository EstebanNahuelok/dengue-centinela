// Mismo shape que devuelve el backend en GET /status. Leito puede laburar
// contra esto sin depender de que el backend real este levantado.
export const mockZonas = {
  zonas: [
    { barrio: 'Centro', lat: -24.7859, lng: -65.4117, score: 72, reportes_7d: 8, factor_clima: 'alto' },
    { barrio: 'Tres Cerritos', lat: -24.7691, lng: -65.389, score: 45, reportes_7d: 3, factor_clima: 'medio' },
    { barrio: 'Grand Bourg', lat: -24.7975, lng: -65.4302, score: 30, reportes_7d: 2, factor_clima: 'bajo' },
    { barrio: 'Castañares', lat: -24.7642, lng: -65.4425, score: 58, reportes_7d: 5, factor_clima: 'medio' },
    { barrio: 'Villa Soledad', lat: -24.8103, lng: -65.402, score: 20, reportes_7d: 1, factor_clima: 'bajo' },
    { barrio: 'San Remo', lat: -24.7735, lng: -65.4485, score: 65, reportes_7d: 6, factor_clima: 'alto' },
    { barrio: 'Limache', lat: -24.755, lng: -65.418, score: 38, reportes_7d: 2, factor_clima: 'medio' },
    { barrio: 'Solidaridad', lat: -24.805, lng: -65.455, score: 12, reportes_7d: 0, factor_clima: 'bajo' },
    { barrio: 'Santa Lucía', lat: -24.758, lng: -65.431, score: 50, reportes_7d: 4, factor_clima: 'medio' },
    { barrio: 'Villa Mitre', lat: -24.792, lng: -65.418, score: 80, reportes_7d: 9, factor_clima: 'alto' },
  ],
  ultima_actualizacion: new Date().toISOString(),
};
