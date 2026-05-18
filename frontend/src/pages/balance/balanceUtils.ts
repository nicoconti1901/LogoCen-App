export type RangePreset = "day" | "week" | "month" | "year" | "custom";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateToIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return e;
}

export function parseMoney(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(v: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v)}`;
}

export function getRangeFromPreset(
  preset: RangePreset,
  anchorDate: string,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  if (preset === "day") return { from: anchorDate, to: anchorDate };
  if (preset === "week") return { from: dateToIsoLocal(startOfWeek(anchor)), to: dateToIsoLocal(endOfWeek(anchor)) };
  if (preset === "month") {
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: dateToIsoLocal(s), to: dateToIsoLocal(e) };
  }
  if (preset === "year") {
    const s = new Date(anchor.getFullYear(), 0, 1);
    const e = new Date(anchor.getFullYear(), 11, 31);
    return { from: dateToIsoLocal(s), to: dateToIsoLocal(e) };
  }
  return { from: customFrom, to: customTo };
}
