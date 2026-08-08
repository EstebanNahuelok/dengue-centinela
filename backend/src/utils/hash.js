import crypto from 'node:crypto';

const SALT = process.env.HASH_SALT || 'dengue-centinela-dev-salt';

// Nunca guardamos el numero de telefono en crudo, solo este hash.
export function hashPhone(phoneNumber) {
  return crypto.createHash('sha256').update(`${SALT}:${phoneNumber}`).digest('hex');
}
