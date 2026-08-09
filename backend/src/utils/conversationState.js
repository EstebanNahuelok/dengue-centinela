// Estado en memoria de la entrevista guiada por WhatsApp (en que paso esta
// cada telefono, que respondio hasta ahora). Alcanza para el hackathon — si
// el server se reinicia se pierde, y no funciona con mas de una instancia
// del backend corriendo a la vez. No persistimos nada sensible.
const pendientes = new Map();

export function getPendiente(telefono) {
  return pendientes.get(telefono);
}

export function setPendiente(telefono, data) {
  pendientes.set(telefono, data);
}

export function clearPendiente(telefono) {
  pendientes.delete(telefono);
}
