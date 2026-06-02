import type { Appointment, AppointmentStatus, Patient } from "../types";
import { appointmentDebtAmountArs, appointmentHasDebt } from "../lib/appointmentDebt";
import { formatPersonDisplayLastFirst, formatPersonDisplayLastFirstUpper, normalizePersonNameField } from "../lib/personName";

const statusLabel: Record<AppointmentStatus, string> = {
  RESERVED: "Agendado",
  CONFIRMADO: "Confirmado",
  RESERVADO: "Reservado",
  ATTENDED: "Finalizado",
  AUSENTE_CON_AVISO: "Ausente c/ aviso",
  AUSENTE_SIN_AVISO: "Ausente s/ aviso",
};

const statusTone: Record<AppointmentStatus, string> = {
  RESERVED: "bg-slate-100 text-slate-700 ring-slate-200",
  CONFIRMADO: "bg-blue-50 text-blue-900 ring-blue-200/80",
  RESERVADO: "bg-indigo-50 text-indigo-900 ring-indigo-200/80",
  ATTENDED: "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
  AUSENTE_CON_AVISO: "bg-amber-50 text-amber-900 ring-amber-200/80",
  AUSENTE_SIN_AVISO: "bg-rose-50 text-rose-900 ring-rose-200/80",
};

function patientInitials(p: Pick<Patient, "firstName" | "lastName">): string {
  const a = normalizePersonNameField(p.firstName).charAt(0);
  const b = normalizePersonNameField(p.lastName).charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function formatAppointmentDate(iso: string): { line: string; weekday: string } {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return {
    line: d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }),
    weekday: d.toLocaleDateString("es-AR", { weekday: "short" }),
  };
}

function formatTimeRange(start: string, end: string): string {
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  return `${s} – ${e}`;
}

function formatMoney(amount: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)}`;
}

const RECENT_LIMIT = 6;

export type PatientAppointmentHistoryModalProps = {
  patient: Patient | null;
  appointments: Appointment[];
  totalCount: number;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
  isLoading: boolean;
  onClose: () => void;
};

export function PatientAppointmentHistoryModal({
  patient,
  appointments,
  totalCount,
  showAll,
  onShowAllChange,
  isLoading,
  onClose,
}: PatientAppointmentHistoryModalProps) {
  if (!patient) return null;

  const name = formatPersonDisplayLastFirstUpper(patient.lastName, patient.firstName);
  const hasMoreThanRecent = totalCount > RECENT_LIMIT;
  const countLabel = isLoading
    ? "Cargando…"
    : showAll
      ? `${totalCount} turno${totalCount === 1 ? "" : "s"}`
      : hasMoreThanRecent
        ? `${appointments.length} de ${totalCount} turnos`
        : `${totalCount} turno${totalCount === 1 ? "" : "s"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-appointment-history-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-brand-50/40 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-900 ring-2 ring-brand-200/80"
              aria-hidden
            >
              {patientInitials(patient)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Historial de turnos</p>
              <h2 id="patient-appointment-history-title" className="truncate text-lg font-semibold tracking-tight text-slate-900">
                {name}
              </h2>
              <p className="mt-0.5 text-sm tabular-nums text-slate-500">{countLabel}</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              {!isLoading && hasMoreThanRecent && (
                <button
                  type="button"
                  className="hidden rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 sm:inline-flex sm:items-center"
                  onClick={() => onShowAllChange(!showAll)}
                >
                  {showAll ? "Ver recientes" : "Mostrar todos"}
                </button>
              )}
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                onClick={onClose}
                aria-label="Cerrar"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
          {!isLoading && hasMoreThanRecent && (
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-brand-200 bg-brand-50 py-2 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 sm:hidden"
              onClick={() => onShowAllChange(!showAll)}
            >
              {showAll ? "Ver solo los 6 más recientes" : "Mostrar todos"}
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex animate-pulse gap-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                  <div className="h-10 w-20 rounded-lg bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-48 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <CalendarIcon className="h-7 w-7" />
              </span>
              <p className="mt-4 text-base font-semibold text-slate-800">Sin turnos registrados</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-left text-sm">
                  <colgroup>
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "32%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead className="border-b border-slate-200 bg-slate-50/95 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-3 py-3">Horario</th>
                      <th className="px-3 py-3">Profesional</th>
                      <th className="px-3 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appointments.map((a, index) => (
                      <AppointmentHistoryRow key={a.id} appointment={a} index={index} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6">
          <button
            type="button"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto sm:min-w-[120px] sm:px-6"
            onClick={onClose}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function AppointmentHistoryRow({ appointment: a, index }: { appointment: Appointment; index: number }) {
  const date = formatAppointmentDate(a.appointmentDate);
  const specialistName = formatPersonDisplayLastFirst(a.specialist.lastName, a.specialist.firstName);
  const hasDebt = appointmentHasDebt(a);
  const debt = appointmentDebtAmountArs(a);

  return (
    <tr className={`transition-colors hover:bg-slate-50/80 ${index % 2 === 1 ? "bg-slate-50/40" : "bg-white"}`}>
      <td className="px-4 py-3.5 align-middle">
        <p className="font-semibold tabular-nums text-slate-900">{date.line}</p>
        <p className="text-xs capitalize text-slate-500">{date.weekday}</p>
      </td>
      <td className="px-3 py-3.5 align-middle">
        <span className="font-medium tabular-nums text-slate-800">{formatTimeRange(a.startTime, a.endTime)}</span>
        {a.consultorio ? (
          <p className="mt-0.5 truncate text-xs text-slate-500" title={a.consultorio}>
            {a.consultorio}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3.5 align-middle">
        <p className="truncate font-medium text-slate-800" title={specialistName}>
          {specialistName}
        </p>
        <p className="truncate text-xs text-slate-500">{a.specialist.specialty}</p>
      </td>
      <td className="px-3 py-3.5 align-middle">
        <span
          className={`inline-flex max-w-full rounded-md px-2 py-0.5 text-[11px] font-semibold leading-snug ring-1 ${statusTone[a.status]}`}
        >
          {statusLabel[a.status]}
        </span>
      </td>
      <td className="px-4 py-3.5 align-middle text-right">
        {hasDebt ? (
          <div className="inline-flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Pendiente</span>
            <span className="text-xs font-bold tabular-nums text-amber-950">{formatMoney(debt)}</span>
          </div>
        ) : a.paymentCompleted ? (
          <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
            Pagado
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
