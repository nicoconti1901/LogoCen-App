/** Estilos compartidos: lista de pacientes, historial de pagos, historia clínica. */

export const DIRECTORY_TABLE_WRAPPER =
  "overflow-hidden rounded-2xl border border-sky-200/90 bg-white shadow-[0_12px_40px_-24px_rgba(3,105,161,0.35)] ring-1 ring-slate-900/5";

export const DIRECTORY_TABLE_TH =
  "border-r border-sky-200/80 px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-sky-900/80 last:border-r-0 sm:px-4 sm:py-3.5";

export const DIRECTORY_TABLE_HEAD =
  "bg-gradient-to-r from-sky-100 via-sky-50 to-white shadow-sm";

export const DIRECTORY_TABLE_HEAD_ROW = "border-b-2 border-sky-200";

export const DIRECTORY_TABLE_TD =
  "border-r border-slate-300/70 px-3 py-3 align-middle last:border-r-0 sm:px-4 sm:py-3.5";

export function directoryRowBg(index: number, hasDebt = false): string {
  if (hasDebt) {
    return index % 2 === 0 ? "bg-amber-50" : "bg-amber-100/35";
  }
  return index % 2 === 0 ? "bg-white" : "bg-slate-50";
}

const ROW_ACCENTS = [
  "border-l-sky-500",
  "border-l-indigo-500",
  "border-l-teal-500",
  "border-l-violet-500",
] as const;

export function directoryRowAccent(id: string, hasDebt = false): string {
  if (hasDebt) return "border-l-amber-500";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ROW_ACCENTS[h % ROW_ACCENTS.length]!;
}

export const DIRECTORY_TABLE_ROW_HOVER =
  "group border-b border-slate-200/90 transition-[background-color,box-shadow] hover:bg-sky-100/50 hover:shadow-[inset_0_0_0_1px_rgba(14,165,233,0.15)]";

export const DIRECTORY_CELL_CARD =
  "min-w-0 rounded-lg bg-white/60 px-2 py-1.5 ring-1 ring-slate-200/50";

export const DIRECTORY_ACTIONS_CELL = "bg-slate-100/40";

export const DIRECTORY_ACTIONS_BAR =
  "flex flex-wrap items-center justify-end gap-1 rounded-xl bg-white/80 p-1 ring-1 ring-slate-200/60";
