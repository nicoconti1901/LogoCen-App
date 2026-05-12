import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppointments, updateAppointment } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import type { Appointment, AppointmentStatus, Patient } from "../types";
import { appointmentHasDebt, appointmentDebtAmountArs, appointmentImputadoPagadoArs, appointmentReferenciaHonorarioArs } from "../lib/appointmentDebt";
import { formatPersonDisplayLastFirstUpper } from "../lib/personName";

const paymentMethodLabel: Record<Exclude<Appointment["paymentMethod"], null>, string> = {
  TRANSFER_TO_LOGOCEN: "Transferencia a LogoCen",
  TRANSFER_TO_SPECIALIST: "Transferencia al especialista",
  CASH_TO_LOGOCEN: "Efectivo a LogoCen",
};

/** Etiquetas cortas para la tabla (menos scroll horizontal). */
const paymentMethodTableLabel: Record<Exclude<Appointment["paymentMethod"], null>, string> = {
  TRANSFER_TO_LOGOCEN: "Transf. LogoCen",
  TRANSFER_TO_SPECIALIST: "Transf. especialista",
  CASH_TO_LOGOCEN: "Efectivo LogoCen",
};

function formatMoney(amount: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)}`;
}

const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  RESERVED: "Agendado",
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
    mutationFn: (a: Appointment) =>
      updateAppointment(a.id, {
        paymentCompleted: true,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: paymentMethodByAppointmentId[a.id] ?? a.paymentMethod ?? "CASH_TO_LOGOCEN",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      await qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[min(1536px,calc(100vw-0.75rem))] flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5 sm:max-w-[min(1536px,calc(100vw-1rem))]">
        <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="mb-4 flex flex-col gap-3 sm:mb-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium text-slate-800">
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
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                  paymentHistorySummary.hasDebt ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {paymentHistorySummary.hasDebt ? "Con pagos pendientes" : "Sin pagos pendientes"}
              </span>
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          {isLoadingPaymentHistory && <p className="text-sm text-slate-600">Cargando historial de pagos…</p>}
          {!isLoadingPaymentHistory && paymentHistory.length === 0 && (
            <p className="text-sm text-slate-600">Este paciente todavía no tiene turnos.</p>
          )}
          {!isLoadingPaymentHistory && paymentHistory.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-sm table-auto">
                <thead className="bg-sky-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Fecha</th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Hora</th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Estado turno</th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Forma pago</th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Pago hecho</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">
                      Estado pago
                    </th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Honorario</th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Abonado</th>
                    <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">Pendiente</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-3">
                      Acción
                    </th>
                  </tr>
                </thead>
              <tbody>
                {paymentHistory.map((a) => {
                  const hasDebt = appointmentHasDebt(a);
                  const refFee = appointmentReferenciaHonorarioArs(a);
                  const abonado = appointmentImputadoPagadoArs(a);
                  const pendiente = appointmentDebtAmountArs(a);
                  return (
                    <tr
                      key={a.id}
                      className={`border-t border-slate-100 ${hasDebt ? "bg-amber-50" : "bg-white"}`}
                    >
                      <td className="truncate px-2 py-2 sm:px-3">{a.appointmentDate.slice(0, 10)}</td>
                      <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                        {a.startTime}–{a.endTime}
                      </td>
                      <td className="truncate px-2 py-2 sm:px-3" title={appointmentStatusLabel[a.status]}>
                        {appointmentStatusLabel[a.status]}
                      </td>
                      <td className="truncate px-2 py-2 sm:px-3" title={a.paymentMethod ? paymentMethodLabel[a.paymentMethod] : ""}>
                        {a.paymentMethod
                          ? paymentMethodTableLabel[a.paymentMethod]
                          : "Sin definir"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 sm:px-3">{a.paymentCompleted ? "Sí" : "No"}</td>
                      <td className="whitespace-nowrap px-2 py-2 sm:px-3 align-middle">
                        <span
                          className={`inline-flex max-w-full whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                            hasDebt ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {hasDebt ? "Pago pendiente" : "Pago al día"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-800 sm:px-3">{refFee > 0 ? formatMoney(refFee) : "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-semibold text-emerald-800 sm:px-3">
                        {abonado > 0 ? formatMoney(abonado) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-semibold text-amber-900 sm:px-3">
                        {hasDebt ? (pendiente > 0 ? formatMoney(pendiente) : "A definir") : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 align-middle sm:px-3">
                        {hasDebt ? (
                          isAdmin ? (
                            <div className="inline-flex max-w-none flex-nowrap items-center gap-2">
                              <select
                                className="w-[168px] shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                                value={paymentMethodByAppointmentId[a.id] ?? a.paymentMethod ?? "CASH_TO_LOGOCEN"}
                                onChange={(e) =>
                                  setPaymentMethodByAppointmentId((prev) => ({
                                    ...prev,
                                    [a.id]: e.target.value as Exclude<Appointment["paymentMethod"], null>,
                                  }))
                                }
                              >
                                {Object.entries(paymentMethodTableLabel).map(([method, label]) => (
                                  <option key={method} value={method}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={markDebtPaidMut.isPending}
                                className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:px-3"
                                onClick={() => markDebtPaidMut.mutate(a)}
                              >
                                Marcar pagado
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Solo administración</span>
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
          )}
        </div>
      </div>
    </div>
  );
}
