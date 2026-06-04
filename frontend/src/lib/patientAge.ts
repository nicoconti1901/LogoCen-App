/** Edad en años completos a partir de una fecha ISO (AAAA-MM-DD). */
export function computeAgeFromBirthDate(birthDate: string | null | undefined): number | null {
  const iso = birthDate?.trim().slice(0, 10);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function formatPatientAgeLegend(birthDate: string | null | undefined): string | null {
  const age = computeAgeFromBirthDate(birthDate);
  if (age == null) return null;
  return `Edad: ${age} año${age === 1 ? "" : "s"} (según la fecha de nacimiento, al día de hoy).`;
}
