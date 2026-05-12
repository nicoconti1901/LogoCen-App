type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const btnCancel =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 active:translate-y-px active:bg-slate-200 disabled:pointer-events-none disabled:opacity-50";

const btnConfirmDefault =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-brand-900/20 transition hover:bg-brand-800 active:translate-y-px active:bg-brand-900 active:shadow-sm disabled:pointer-events-none disabled:opacity-50";

const btnConfirmDanger =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-red-900/25 transition hover:bg-red-800 active:translate-y-px active:bg-red-900 active:shadow-sm disabled:pointer-events-none disabled:opacity-50";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 pb-4 pt-5 sm:px-6">
          <h3 id="confirm-dialog-title" className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            {title}
          </h3>
        </div>
        <div className="px-5 py-4 sm:px-6">
          <p className="text-sm leading-relaxed text-slate-600">{message}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:gap-3 sm:px-6">
          <button type="button" className={btnCancel} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? btnConfirmDanger : btnConfirmDefault}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
