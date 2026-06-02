/**
 * Normaliza teléfonos argentinos a E.164 para WhatsApp (+549...).
 * Acepta: 11 1234-5678, 011 15 1234 5678, +54 9 11 1234 5678, etc.
 */
export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("54")) {
    // 54 + móvil AR debe llevar 9: 549XXXXXXXX...
    if (!digits.startsWith("549") && digits.length >= 12) {
      digits = `549${digits.slice(2)}`;
    }
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

  // Móviles CABA / 15: 54 + 11... o 54 + 15...
  if (digits.startsWith("549") && digits.length >= 12) {
    const afterMobile = digits.slice(3);
    if (afterMobile.startsWith("15")) {
      digits = `549${afterMobile.slice(2)}`;
    }
  }

  if (digits.length < 12 || digits.length > 15) return null;
  return `+${digits}`;
}

/**
 * Formato `to` para la Cloud API de Meta con móviles argentinos.
 * En modo prueba Meta hace match exacto: 54 + área + 15 + abonado (sin el 9).
 * Ej: +5492914021589 → 54291154021589
 */
export function formatPhoneForMetaWhatsapp(e164: string | null | undefined): string | null {
  if (!e164) return null;
  let digits = e164.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("549")) {
    const local = digits.slice(3);
    if (local.length >= 10) {
      const areaLen = local.startsWith("11") ? 2 : 3;
      const area = local.slice(0, areaLen);
      const subscriber = local.slice(areaLen);
      return `54${area}15${subscriber}`;
    }
  }

  return digits;
}

/** Compará teléfono guardado con wa_id / from del webhook de Meta. */
export function whatsappPhonesMatch(
  stored: string | null | undefined,
  waFrom: string | null | undefined
): boolean {
  if (!stored?.trim() || !waFrom?.trim()) return false;
  const from = waFrom.replace(/\D/g, "");
  if (!from) return false;

  const candidates = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (!value) return;
    const digits = value.replace(/\D/g, "");
    if (digits) candidates.add(digits);
  };

  push(stored);
  const e164 = normalizePhoneToE164(stored);
  push(e164);
  push(formatPhoneForMetaWhatsapp(e164));

  if (candidates.has(from)) return true;

  const localFrom = from.startsWith("549") ? from.slice(3) : from.startsWith("54") ? from.slice(2) : from;
  for (const candidate of candidates) {
    const local = candidate.startsWith("549")
      ? candidate.slice(3)
      : candidate.startsWith("54")
        ? candidate.slice(2)
        : candidate;
    if (local.slice(-10) === localFrom.slice(-10)) return true;
  }
  return false;
}

/** Dígitos E.164 sin «+» para sufijo de URL `https://wa.me/...` (botón de plantilla). */
export function clinicWaMeUrlSuffix(raw: string | null | undefined): string | null {
  const e164 = normalizePhoneToE164(raw);
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  return digits || null;
}

/** Enlace wa.me al WhatsApp del centro (consultas), sin el +. */
export function buildClinicWaMeLink(raw: string | null | undefined): string | null {
  const suffix = clinicWaMeUrlSuffix(raw);
  if (!suffix) return null;
  return `https://wa.me/${suffix}`;
}

/** Texto visible del contacto del centro para mensajes y plantillas. */
export function formatClinicContactDisplay(raw: string | null | undefined): string | null {
  const e164 = normalizePhoneToE164(raw);
  if (!e164) return raw?.trim() || null;
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("549") && digits.length >= 12) {
    const local = digits.slice(3);
    const area = local.slice(0, 2);
    const rest = local.slice(2);
    return `+54 9 ${area} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return e164;
}
