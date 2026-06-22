export type FixedSeriesScheduleConflict = {
  date: string;
  reasons: ("consultorio" | "specialist")[];
};

export function formatFixedSeriesConflictDate(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function describeFixedSeriesConflictReasons(reasons: FixedSeriesScheduleConflict["reasons"]): string {
  return reasons
    .map((r) => (r === "consultorio" ? "consultorio ocupado" : "especialista ocupado"))
    .join(" · ");
}

type Props = {
  open: boolean;
  conflicts: FixedSeriesScheduleConflict[];
  busy?: boolean;
  onSkipDays: () => void;
  onTruncateBefore: () => void;
  onCancel: () => void;
};

const btnBase =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition active:translate-y-px disabled:pointer-events-none disabled:opacity-50 sm:w-auto";

export function FixedSeriesConflictDialog({
  open,
  conflicts,
  busy = false,
  onSkipDays,
  onTruncateBefore,
  onCancel,
}: Props) {
  if (!open) return null;

  const firstDate = conflicts[0]?.date;
  const truncateHint = firstDate
    ? `La serie finalizará en el último turno semanal anterior al ${formatFixedSeriesConflictDate(firstDate)}.`
    : "";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-3 sm:p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fixed-conflict-title"
      >
        <div className="border-b border-slate-100 bg-gradient-to-b from-amber-50 to-white px-5 pb-4 pt-5 sm:px-6">
          <h3 id="fixed-conflict-title" className="text-base font-semibold text-slate-900 sm:text-lg">
            Hay días con conflicto de agenda
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            En {conflicts.length} fecha{conflicts.length === 1 ? "" : "s"} el consultorio o el especialista ya
            están ocupados en ese horario. Elegí cómo continuar:
          </p>
        </div>

        <ul className="max-h-48 overflow-y-auto border-b border-slate-100 px-5 py-3 text-sm text-slate-700 sm:px-6">
          {conflicts.map((c) => (
            <li key={c.date} className="border-b border-slate-100 py-2 last:border-0">
              <span className="font-medium capitalize">{formatFixedSeriesConflictDate(c.date)}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {describeFixedSeriesConflictReasons(c.reasons)}
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-3 px-5 py-4 sm:px-6">
          <button type="button" className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`} onClick={onSkipDays} disabled={busy}>
            Crear la serie omitiendo esos días
          </button>
          <button
            type="button"
            className={`${btnBase} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            onClick={onTruncateBefore}
            disabled={busy}
          >
            Terminar la serie antes del primer conflicto
          </button>
          {truncateHint ? <p className="text-xs leading-relaxed text-slate-500">{truncateHint}</p> : null}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
          <button
            type="button"
            className={`${btnBase} border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100`}
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
