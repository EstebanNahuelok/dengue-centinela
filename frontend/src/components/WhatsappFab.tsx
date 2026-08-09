/**
 * Botón flotante a WhatsApp: siempre visible, en la esquina opuesta a la
 * barra del asistente (@/components/AsistenteBar) para que no se pisen.
 *
 * El texto viene precargado con "join <sandbox>" para resolver en un solo
 * tap el paso de unirse al Sandbox de Twilio, que si no hay que escribirlo
 * a mano — ver README para el código vigente si el sandbox cambia.
 */
const NUMERO_SANDBOX = "14155238886";
const TEXTO_PRECARGADO = "join taste-page";

const WHATSAPP_HREF = `https://wa.me/${NUMERO_SANDBOX}?text=${encodeURIComponent(TEXTO_PRECARGADO)}`;

export function WhatsappFab() {
  return (
    <a
      href={WHATSAPP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      title="Consultar por WhatsApp"
      aria-label="Consultar por WhatsApp"
      className="fixed bottom-4 left-4 z-[1000] grid h-12 w-12 place-items-center rounded-full bg-[#25D366] text-white shadow-2xl transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38c1.46.8 3.1 1.22 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm0 1.67c2.21 0 4.28.86 5.84 2.42a8.23 8.23 0 0 1 2.42 5.83c0 4.55-3.71 8.25-8.26 8.25a8.27 8.27 0 0 1-4.21-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.55 3.71-8.26 8.26-8.26Zm-4.5 4.31c-.16 0-.42.06-.64.31-.22.25-.85.83-.85 2.02s.87 2.34 1 2.5c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.47-.29-.25-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.25-.63.79-.78.95-.14.16-.28.18-.53.06-.25-.12-1.06-.39-2.01-1.24-.74-.66-1.25-1.47-1.4-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.28.37-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42h-.47Z" />
      </svg>
    </a>
  );
}
