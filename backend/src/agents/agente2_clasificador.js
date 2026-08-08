const SINTOMAS = [
  'fiebre',
  'dolor de cabeza',
  'dolor muscular',
  'dolor articular',
  'sarpullido',
  'nauseas',
  'náuseas',
  'vomito',
  'vómito',
  'dolor detras de los ojos',
  'dolor detrás de los ojos',
];

// TODO(Mauro): reglas mas finas / prompt a Groq si da el tiempo. Por ahora:
// fiebre + 2 sintomas asociados = sospecha_alta (regla pedida en la spec).
export function clasificarReporte({ tipo, descripcion = '' }) {
  const textoLower = descripcion.toLowerCase();

  if (tipo === 'criadero') {
    const grave = ['mucho', 'varios', 'hace dias', 'hace días', 'estancada'].some((p) =>
      textoLower.includes(p)
    );
    return grave ? 'sospecha_alta' : 'sospecha_media';
  }

  const tieneFiebre = textoLower.includes('fiebre');
  const cantidadSintomas = SINTOMAS.filter((s) => textoLower.includes(s)).length;

  if (tieneFiebre && cantidadSintomas >= 2) return 'sospecha_alta';
  if (tieneFiebre || cantidadSintomas >= 1) return 'sospecha_media';
  return 'no_relevante';
}
