/**
 * Misma lógica que backend/src/whatsapp/phone.ts (E.164 AR para Meta WhatsApp).
 */
export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("54")) {
    if (!digits.startsWith("549") && digits.length >= 12) {
      digits = `549${digits.slice(2)}`;
    }
  } else if (digits.startsWith("0")) {
    digits = `54${digits.slice(1)}`;
  } else if (digits.length === 10 || digits.length === 11) {
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

  if (digits.startsWith("549") && digits.length >= 12) {
    const afterMobile = digits.slice(3);
    if (afterMobile.startsWith("15")) {
      digits = `549${afterMobile.slice(2)}`;
    }
  }

  if (digits.length < 12 || digits.length > 15) return null;
  return `+${digits}`;
}
