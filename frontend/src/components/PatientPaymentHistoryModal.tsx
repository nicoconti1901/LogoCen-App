import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppointments, updateAppointment, updateFixedAppointmentOccurrence } from "../api/endpoints";
import { getFixedOccurrenceDate, getFixedSeriesId, isFixedSeriesAppointment } from "../lib/fixedAppointment";
import { useAuth } from "../contexts/AuthContext";
import type { Appointment, AppointmentStatus, Patient } from "../types";
import { appointmentHasDebt, appointmentDebtAmountArs, appointmentImputadoPagadoArs, appointmentReferenciaHonorarioArs } from "../lib/appointmentDebt";
import {
  formatAppointmentPaymentLabel,
  formatAppointmentPaymentTableLabel,
  hasCombinedPayment,
  PAYMENT_METHOD_TABLE_LABELS,
} from "../lib/paymentMethodDisplay";
import {
  DIRECTORY_ACTIONS_BAR,
  DIRECTORY_ACTIONS_CELL,
  DIRECTORY_CELL_CARD,
  DIRECTORY_TABLE_HEAD,
  DIRECTORY_TABLE_HEAD_ROW,
  DIRECTORY_TABLE_ROW_HOVER,
  DIRECTORY_TABLE_TD,
  DIRECTORY_TABLE_TH,
  DIRECTORY_TABLE_WRAPPER,
  directoryRowAccent,
  directoryRowBg,
} from "../lib/directoryTableStyles";
import { formatPersonDisplayLastFirstUpper } from "../lib/personName";

function formatMoney(amount: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)}`;
}

const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  RESERVED: "Agendado",
  CONFIRMADO: "Confirmado",
  RESERVADO: "Reservado",
  ATTENDED: "FINALIZADO",
  AUSENTE_CON_AVISO: "Ausente c/ aviso",
  AUSENTE_SIN_AVISO: "Ausente s/ aviso",
};

type Props = {
  patientId: string | null;
  /** Si ya se conoce el paciente (p. ej. desde la lista de Pacientes), mejora el título mientras carga. */
  patientHint?: Patient | null;
  onClose: () => void;
};

export function PatientPaymentHistoryModal({ patientId, patientHint, onClose }: Props) {
  const open = Boolean(patientId);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const qc = useQueryClient();
  const [paymentMethodByAppointmentId, setPaymentMethodByAppointmentId] = useState<
    Record<string, Exclude<Appointment["paymentMethod"], null>>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: paymentHistory = [], isLoading: isLoadingPaymentHistory } = useQuery({
    queryKey: ["appointments", "patient-payment-history", patientId],
    queryFn: async () => {
      const appointments = await fetchAppointments({ patientId: patientId! });
      return appointments.slice().sort((a, b) => {
        const aKey = `${a.appointmentDate} ${a.startTime}`;
        const bKey = `${b.appointmentDate} ${b.startTime}`;
        return bKey.localeCompare(aKey);
      });
    },
    enabled: open,
  });

  const patientForTitle = patientHint ?? paymentHistory[0]?.patient ?? null;

  const paymentHistorySummary = useMemo(() => {
    const total = paymentHistory.length;
    const debtRows = paymentHistory.filter((a) => appointmentHasDebt(a));
    const debtAmount = debtRows.reduce((acc, a) => acc + appointmentDebtAmountArs(a), 0);
    const paidRegistered = paymentHistory.reduce((acc, a) => acc + appointmentImputadoPagadoArs(a), 0);
    return { total, debtCount: debtRows.length, hasDebt: debtRows.length > 0, debtAmount, paidRegistered };
  }, [paymentHistory]);

  const markDebtPaidMut = useMutation({
    mutationFn: (a: Appointment) => {
      const payload = {
        paymentCompleted: true,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: paymentMethodByAppointmentId[a.id] ?? a.paymentMethod ?? "CASH_TO_LOGOCEN",
      };
      if (isFixedSeriesAppointment(a)) {
        const seriesId = getFixedSeriesId(a);
        if (!seriesId) throw new Error("Turno fijo inválido");
        return updateFixedAppointmentOccurrence(seriesId, {
          date: getFixedOccurrenceDate(a),
          ...payload,
        });
      }
      return updateAppointment(a.id, payload);
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      await qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "response" in err
            ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "No se pudo registrar el pago")
            : "No se pudo registrar el pago";
      setActionError(msg);
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[min(1536px,calc(100vw-0.75rem))] flex-col overflow-hidden rounded-2xl border border-sky-200/90 bg-white shadow-xl ring-1 ring-slate-900/5 sm:max-w-[min(1536px,calc(100vw-1rem))]">
        <div className="shrink-0 border-b border-sky-200/80 bg-gradient-to-r from-sky-50/80 to-white px-4 py-4 sm:px-6">
          <div className="mb-4 flex flex-col gap-3 sm:mb-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Pagos:{" "}
                {patientForTitle ? (
                  formatPersonDisplayLastFirstUpper(patientForTitle.lastName, patientForTitle.firstName)
                ) : (
                  <span className="text-slate-500">Cargando…</span>
                )}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Turnos totales: {paymentHistorySummary.total} · Con pagos pendientes: {paymentHistorySummary.debtCount}{" "}
                · Monto pendiente: {formatMoney(paymentHistorySummary.debtAmount)} · Abonado registrado:{" "}
                {formatMoney(paymentHistorySummary.paidRegistered)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span
                className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold ring-1 ${
                  paymentHistorySummary.hasDebt
                    ? "bg-amber-50 text-amber-800 ring-amber-200/80"
                    : "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
                }`}
              >
                {paymentHistorySummary.hasDebt ? "Con pagos pendientes" : "Sin pagos pendientes"}
              </span>
              <button
                type="button"
                className="whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          {actionError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {actionError}
            </p>
          )}
          {isLoadingPaymentHistory && <p className="text-sm text-slate-600">Cargando historial de pagos…</p>}
          {!isLoadingPaymentHistory && paymentHistory.length === 0 && (
            <p className="text-sm text-slate-600">Este paciente todavía no tiene turnos.</p>
          )}
          {!isLoadingPaymentHistory && paymentHistory.length > 0 && (
            <div className={DIRECTORY_TABLE_WRAPPER}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm table-auto">
                  <thead className={DIRECTORY_TABLE_HEAD}>
                    <tr className={DIRECTORY_TABLE_HEAD_ROW}>
                      <th className={`${DIRECTORY_TABLE_TH} pl-4`}>Fecha</th>
                      <th className={DIRECTORY_TABLE_TH}>Hora</th>
                      <th className={DIRECTORY_TABLE_TH}>Estado turno</th>
                      <th className={DIRECTORY_TABLE_TH}>Forma pago</th>
                      <th className={DIRECTORY_TABLE_TH}>Pago hecho</th>
                      <th className={`${DIRECTORY_TABLE_TH} whitespace-nowrap`}>Estado pago</th>
                      <th className={`${DIRECTORY_TABLE_TH} text-right`}>Honorario</th>
                      <th className={`${DIRECTORY_TABLE_TH} text-right`}>Abonado</th>
                      <th className={`${DIRECTORY_TABLE_TH} text-right`}>Pendiente</th>
                      <th className={`${DIRECTORY_TABLE_TH} pr-4 text-right`}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((a, index) => {
                      const hasDebt = appointmentHasDebt(a);
                      const refFee = appointmentReferenciaHonorarioArs(a);
                      const abonado = appointmentImputadoPagadoArs(a);
                      const pendiente = appointmentDebtAmountArs(a);
                      const paymentLabel = formatAppointmentPaymentTableLabel(a.paymentMethod, a.paymentSplits);
                      return (
                        <tr key={a.id} className={`${DIRECTORY_TABLE_ROW_HOVER} ${directoryRowBg(index, hasDebt)}`}>
                          <td
                            className={`${DIRECTORY_TABLE_TD} border-l-4 pl-3 font-medium tabular-nums text-slate-800 ${directoryRowAccent(a.id, hasDebt)}`}
                          >
                            {a.appointmentDate.slice(0, 10)}
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} whitespace-nowrap tabular-nums text-slate-700`}>
                            {a.startTime}–{a.endTime}
                          </td>
                          <td className={DIRECTORY_TABLE_TD}>
                            <div className={DIRECTORY_CELL_CARD}>
                              <p className="truncate text-sm font-medium text-slate-800" title={appointmentStatusLabel[a.status]}>
                                {isFixedSeriesAppointment(a)
                                  ? `Fijo · ${appointmentStatusLabel[a.status]}`
                                  : appointmentStatusLabel[a.status]}
                              </p>
                            </div>
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} max-w-[14rem]`}>
                            <div className={DIRECTORY_CELL_CARD} title={formatAppointmentPaymentLabel(a.paymentMethod, a.paymentSplits)}>
                              <p className="truncate text-sm text-slate-800">{paymentLabel}</p>
                            </div>
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} whitespace-nowrap`}>
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
                                a.paymentCompleted
                                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
                                  : "bg-slate-100 text-slate-600 ring-slate-200/80"
                              }`}
                            >
                              {a.paymentCompleted ? "Sí" : "No"}
                            </span>
                          </td>
                          <td className={DIRECTORY_TABLE_TD}>
                            <span
                              className={`inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ${
                                hasDebt
                                  ? "bg-amber-50 text-amber-800 ring-amber-200/80"
                                  : "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
                              }`}
                            >
                              {hasDebt ? "Pago pendiente" : "Pago al día"}
                            </span>
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} text-right tabular-nums text-slate-800`}>
                            {refFee > 0 ? formatMoney(refFee) : "—"}
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} text-right font-semibold tabular-nums text-emerald-800`}>
                            {abonado > 0 ? formatMoney(abonado) : "—"}
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} text-right font-semibold tabular-nums text-amber-950`}>
                            {hasDebt ? (pendiente > 0 ? formatMoney(pendiente) : "A definir") : "—"}
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} ${DIRECTORY_ACTIONS_CELL} pr-4`}>
                            {hasDebt ? (
                              isAdmin ? (
                                <div className={`${DIRECTORY_ACTIONS_BAR} !flex-nowrap`}>
                                  <select
                                    className="w-[168px] shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm"
                                    value={
                                      paymentMethodByAppointmentId[a.id] ??
                                      a.paymentMethod ??
                                      (hasCombinedPayment(a.paymentSplits)
                                        ? a.paymentSplits![0]!.method
                                        : "CASH_TO_LOGOCEN")
                                    }
                                    onChange={(e) =>
                                      setPaymentMethodByAppointmentId((prev) => ({
                                        ...prev,
                                        [a.id]: e.target.value as Exclude<Appointment["paymentMethod"], null>,
                                      }))
                                    }
                                  >
                                    {Object.entries(PAYMENT_METHOD_TABLE_LABELS).map(([method, label]) => (
                                      <option key={method} value={method}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={markDebtPaidMut.isPending}
                                    className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-emerald-800/20 hover:bg-emerald-700 disabled:opacity-50"
                                    onClick={() => markDebtPaidMut.mutate(a)}
                                  >
                                    Marcar pagado
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-slate-500">Solo administración</span>
                              )
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
