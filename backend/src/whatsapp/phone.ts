/**
 * Normaliza teléfonos argentinos a E.164 para WhatsApp (+549...).
 * Acepta: 11 1234-5678, 011 15 1234 5678, +54 9 11 1234 5678, etc.
 */
export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("54")) {
    // ya incluye país
  } else if (digits.startsWith("0")) {
    digits = `54${digits.slice(1)}`;
  } else if (digits.length === 10 || digits.length === 11) {
    // móvil/local AR sin 54
    if (digits.length === 11 && digits.startsWith("15")) {
      digits = `54${digits.slice(2)}`;
    } else if (digits.length === 10) {
      digits = `549${digits}`;
    } else {
      digits = `54${digits}`;
    }
  } else {
    digits = `54${digits}`;
  }

  // Móviles: 54 + 9 + área (sin 0) + número
  if (digits.startsWith("54") && !digits.startsWith("549") && digits.length >= 12) {
    const afterCountry = digits.slice(2);
    if (afterCountry.startsWith("11") || afterCountry.startsWith("15")) {
      digits = `549${afterCountry.replace(/^15/, "")}`;
    }
  }

  if (digits.length < 12 || digits.length > 15) return null;
  return `+${digits}`;
}
