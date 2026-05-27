const LETTER = /\p{L}/u;
const LOCALE = "es-AR";

/** True si hay al menos una letra y todas las letras están en mayúsculas (p. ej. MARÍA, LÓPEZ). */
export function isPersonNameStyledAllCaps(value: string): boolean {
  const t = value.trim();
  let hasLetter = false;
  for (const ch of t) {
    if (!LETTER.test(ch)) continue;
    hasLetter = true;
    if (ch !== ch.toLocaleUpperCase(LOCALE)) return false;
  }
  return hasLetter;
}

/**
 * Normaliza un nombre o apellido: si ya está todo en mayúsculas se deja igual;
 * si no, primera letra de cada palabra en mayúscula y el resto en minúsculas.
 */
export function normalizePersonNameField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (isPersonNameStyledAllCaps(trimmed)) return trimmed;

  return trimmed
    .split(/\s+/u)
    .map((word) => {
      if (!word) return word;
      const first = word.charAt(0).toLocaleUpperCase(LOCALE);
      const rest = word.slice(1).toLocaleLowerCase(LOCALE);
      return first + rest;
    })
    .join(" ");
}
