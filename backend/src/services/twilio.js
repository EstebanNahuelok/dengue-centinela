import twilioLib from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

export const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilioLib(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// Responde dentro del mismo webhook via TwiML (no consume credito de envio aparte).
export function twimlRespuesta(texto) {
  const { MessagingResponse } = twilioLib.twiml;
  const twiml = new MessagingResponse();
  twiml.message(texto);
  return twiml.toString();
}
