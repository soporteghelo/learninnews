/** Código de país por defecto para los celulares de perfil (Perú). */
const WHATSAPP_COUNTRY_CODE = '51';

/**
 * Arma el enlace wa.me para escribirle a un usuario. Los perfiles guardan el
 * celular en 9 dígitos (formato móvil peruano), así que le anteponemos el
 * código de país; si el número ya vino con código (10+ dígitos) se respeta.
 * Devuelve null cuando no hay un número utilizable, para poder ocultar el botón.
 */
export function buildWhatsAppLink(celular: string | undefined, mensaje: string): string | null {
  const digits = String(celular || '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  const numero = digits.length === 9 ? `${WHATSAPP_COUNTRY_CODE}${digits}` : digits;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
