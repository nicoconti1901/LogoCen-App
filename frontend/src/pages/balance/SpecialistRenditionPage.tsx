import { useMemo, useState, useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAppointments,
  fetchConsultorioRentMonths,
  fetchSpecialist,
  updateAppointment,
  updateFixedAppointmentOccurrence,
  updateSpecialist,
} from "../../api/endpoints";
import { getFixedOccurrenceDate, getFixedSeriesId, isFixedSeriesAppointment } from "../../lib/fixedAppointment";
import { useAuth } from "../../contexts/AuthContext";
import {
  appointmentDebtAmountArs,
  appointmentHasDebt,
  appointmentImputadoPagadoArs,
} from "../../lib/appointmentDebt";
import { formatPersonDisplayLastFirst } from "../../lib/personName";
import type { Appointment, AppointmentPaymentMethod } from "../../types";
import {
  dateToIsoLocal,
  formatMoney,
  getRangeFromPreset,
  parseMoney,
} from "./balanceUtils";

const paymentMethodLabel: Record<AppointmentPaymentMethod, string> = {
  TRANSFER_TO_LOGOCEN: "Transferencia a LogoCen",
  TRANSFER_TO_SPECIALIST: "Transferencia al especialista",
  CASH_TO_LOGOCEN: "Efectivo a LogoCen",
};

const statusLabel: Record<Appointment["status"], string> = {
  RESERVED: "Reservado",
  RESERVADO: "Reservado (pago parcial)",
  ATTENDED: "Finalizado",
  AUSENTE_CON_AVISO: "Ausente con aviso",
  AUSENTE_SIN_AVISO: "Ausente sin aviso",
};

type RenditionPreset = "day" | "week" | "month";

function getRenditionRange(preset: RenditionPreset, anchorDate: string): { from: string; to: string } {
  return getRangeFromPreset(preset, anchorDate, anchorDate, anchorDate);
}

function isPendingSpecialistSettlement(a: Appointment): boolean {
  return (
    a.paymentCompleted &&
    a.paymentMethod === "TRANSFER_TO_SPECIALIST" &&
    (a.specialistSettledAt == null || a.specialistSettledAt === "")
  );
}

async function markSpecialistSettled(a: Appointment, settledAt: string): Promise<void> {
  if (isFixedSeriesAppointment(a)) {
    const seriesId = getFixedSeriesId(a);
    if (!seriesId) throw new Error("Turno fijo inválido");
    await updateFixedAppointmentOccurrence(seriesId, {
      date: getFixedOccurrenceDate(a),
      specialistSettledAt: settledAt,
    });
    return;
  }
  await updateAppointment(a.id, { specialistSettledAt: settledAt });
}

export function SpecialistRenditionPage() {
  const { specialistId: specialistIdParam } = useParams<{ specialistId: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = dateToIsoLocal(new Date());

  if (!user || (user.role !== "ADMIN" && user.role !== "SPECIALIST")) {
    return <Navigate to="/agenda" replace />;
  }

  const isAdmin = user.role === "ADMIN";

  if (!isAdmin && specialistIdParam) {
    return <Navigate to="/balance/mi-rendicion" replace />;
  }

  const targetSpecialistId = isAdmin ? specialistIdParam : user.specialistId ?? undefined;

  if (isAdmin && !specialistIdParam) {
    return <Navigate to="/balance/especialistas" replace />;
  }
  if (!isAdmin && !user.specialistId) {
    return <Navigate to="/agenda" replace />;
  }

  const [preset, setPreset] = useState<RenditionPreset>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [rentDraft, setRentDraft] = useState("");
  const [settleError, setSettleError] = useState<string | null>(null);

  const range = useMemo(() => getRenditionRange(preset, anchorDate), [preset, anchorDate]);
  const monthRef = anchorDate.slice(0, 7);

  const specialistQ = useQuery({
    queryKey: ["specialist", targetSpecialistId],
    queryFn: () => fetchSpecialist(targetSpecialistId!),
    enabled: Boolean(targetSpecialistId),
  });

  useEffect(() => {
    const v = specialistQ.data?.monthlyConsultorioRent;
    if (v != null && v !== "") setRentDraft(String(v));
    else setRentDraft("");
  }, [specialistQ.data?.monthlyConsultorioRent]);

  const rentMonthQ = useQuery({
    queryKey: ["consultorio-rent-months", monthRef, targetSpecialistId],
    queryFn: () =>
      fetchConsultorioRentMonths({
        month: monthRef,
        ...(isAdmin && targetSpecialistId ? { specialistId: targetSpecialistId } : {}),
      }),
    enabled: Boolean(targetSpecialistId),
  });

  const appointmentsQ = useQuery({
    queryKey: ["balance-rendition", targetSpecialistId, range.from, range.to],
    queryFn: () =>
      fetchAppointments({
        from: range.from,
        to: range.to,
        ...(isAdmin && targetSpecialistId ? { specialistId: targetSpecialistId } : {}),
      }),
    enabled: Boolean(targetSpecialistId),
  });

  const settleMut = useMutation({
    mutationFn: async (appointments: Appointment[]) => {
      const now = new Date().toISOString();
      await Promise.all(appointments.map((a) => markSpecialistSettled(a, now)));
    },
    onMutate: () => setSettleError(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      await qc.invalidateQueries({ queryKey: ["balance-rendition"] });
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "")
          : err instanceof Error
            ? err.message
            : "";
      setSettleError(msg || "No se pudo marcar la rendición. Reintentá.");
    },
  });

  const saveRentMut = useMutation({
    mutationFn: () =>
      updateSpecialist(targetSpecialistId!, {
        monthlyConsultorioRent: rentDraft.trim() === "" ? null : rentDraft.trim(),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialist", targetSpecialistId] });
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      await qc.invalidateQueries({ queryKey: ["consultorio-rent-months"] });
    },
  });

  const stats = useMemo(() => {
    const list = appointmentsQ.data ?? [];
    const attended = list.filter((a) => a.status === "ATTENDED");
    const uniquePatients = new Set(attended.map((a) => a.patientId)).size;
    let honorariosCobrados = 0;
    let deudasTotal = 0;
    let conDeuda = 0;
    const byMethod: Record<string, number> = {};
    const pendingSettlement: Appointment[] = [];

    for (const a of list) {
      honorariosCobrados += appointmentImputadoPagadoArs(a);
      const d = appointmentDebtAmountArs(a);
      if (d > 0) deudasTotal += d;
      if (appointmentHasDebt(a)) conDeuda += 1;
      if (a.paymentCompleted && a.paymentMethod) {
        byMethod[a.paymentMethod] = (byMethod[a.paymentMethod] ?? 0) + parseMoney(a.specialist.consultationFee);
      }
      if (isPendingSpecialistSettlement(a)) {
        pendingSettlement.push(a);
      }
    }

    const pendingAmount = pendingSettlement.reduce(
      (acc, a) => acc + parseMoney(a.specialist.consultationFee),
      0
    );

    return {
      totalTurnos: list.length,
      attendedCount: attended.length,
      uniquePatientsAttended: uniquePatients,
      honorariosCobrados,
      deudasTotal,
      conDeuda,
      byMethod,
      pendingSettlement,
      pendingAmount,
    };
  }, [appointmentsQ.data]);

  const specialistName = specialistQ.data
    ? formatPersonDisplayLastFirst(specialistQ.data.lastName, specialistQ.data.firstName)
    : "…";

  const monthlyRentEffective = parseMoney(rentMonthQ.data?.rows[0]?.amount);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {isAdmin ? `Rendición — ${specialistName}` : "Mi rendición"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Resumen del período: pacientes atendidos (turnos finalizados), montos registrados y deudas pendientes de
          pacientes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                preset === p ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {p === "day" ? "Día" : p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <label className="mt-3 block max-w-xs text-sm">
          <span className="font-medium text-slate-600">Fecha de referencia</span>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Período: {range.from} al {range.to}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pacientes únicos atendidos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.uniquePatientsAttended}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.attendedCount} turnos con estado Finalizado</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Turnos en el período</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.totalTurnos}</p>
          <p className="mt-1 text-xs text-slate-500">Todos los estados</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-800">Honorarios cobrados (registrado)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{formatMoney(stats.honorariosCobrados)}</p>
          <p className="mt-1 text-xs text-emerald-800">Suma de lo imputado como abonado en el período</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-800">Deudas pendientes (pacientes)</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{formatMoney(stats.deudasTotal)}</p>
          <p className="mt-1 text-xs text-amber-800">{stats.conDeuda} turno/s con saldo o pago pendiente</p>
        </article>
        <article className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-sky-800">Alquiler consultorio (mes {monthRef})</p>
          <p className="mt-1 text-2xl font-bold text-sky-950">{formatMoney(monthlyRentEffective)}</p>
          <p className="mt-1 text-xs text-sky-800">
            Monto del mes {monthRef} (se arma solo: copia el mes anterior o el valor base del especialista).
          </p>
        </article>
        {stats.pendingAmount > 0 ? (
          <article className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-violet-800">Pendiente de rendición (transferencia)</p>
            <p className="mt-1 text-2xl font-bold text-violet-950">{formatMoney(stats.pendingAmount)}</p>
            <p className="mt-1 text-xs text-violet-800">
              Turnos pagados al especialista vía transferencia aún no marcados como rendidos por administración
            </p>
          </article>
        ) : null}
      </section>

      {isAdmin && targetSpecialistId && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Valor base de alquiler (plantilla)</h3>
          <p className="mt-1 text-sm text-slate-600">
            Se usa para el primer mes y cuando no hay mes anterior registrado; los meses siguientes replican el monto
            del mes previo automáticamente.
          </p>
          <div className="mt-3 flex max-w-md flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[140px] text-sm">
              <span className="text-slate-600">Monto (ARS)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={rentDraft}
                onChange={(e) => setRentDraft(e.target.value)}
                disabled={saveRentMut.isPending}
              />
            </label>
            <button
              type="button"
              disabled={saveRentMut.isPending || specialistQ.isLoading}
              onClick={() => saveRentMut.mutate()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
          {saveRentMut.isError && (
            <p className="mt-2 text-sm text-rose-600">No se pudo guardar. Reintentá.</p>
          )}
        </section>
      )}

      {settleError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {settleError}
        </p>
      )}

      {stats.pendingSettlement.length > 0 && isAdmin && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Marcar rendición a especialista</h3>
          <p className="mt-1 text-sm text-slate-600">
            Turnos con pago completado y transferencia directa al especialista: pendientes de confirmar rendición.
          </p>
          <div className="mt-3 space-y-2">
            {stats.pendingSettlement.map((a) => {
              const patient = formatPersonDisplayLastFirst(a.patient.lastName, a.patient.firstName);
              const amount = parseMoney(a.specialist.consultationFee);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{patient}</p>
                    <p className="text-xs text-slate-500">{a.appointmentDate.slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatMoney(amount)}</span>
                    <button
                      type="button"
                      disabled={settleMut.isPending}
                      className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      onClick={() => settleMut.mutate([a])}
                    >
                      Rendido
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              disabled={settleMut.isPending}
              className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => settleMut.mutate(stats.pendingSettlement)}
            >
              Marcar todos como rendidos
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Montos por método de cobro</h3>
        <p className="text-sm text-slate-600">Solo turnos con pago realizado, honorario de referencia del turno.</p>
        <ul className="mt-3 space-y-1 text-sm">
          {(Object.keys(paymentMethodLabel) as AppointmentPaymentMethod[]).map((m) => (
            <li key={m} className="flex justify-between gap-2 border-b border-slate-100 py-1">
              <span>{paymentMethodLabel[m]}</span>
              <span className="font-semibold">{formatMoney(stats.byMethod[m] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Detalle de turnos</h3>
        {appointmentsQ.isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Cargando turnos…</p>
        ) : (appointmentsQ.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No hay turnos en este período.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Paciente</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Honorario</th>
                  <th className="py-2 pr-3">Abonado</th>
                  <th className="py-2 pr-3">Deuda</th>
                  <th className="py-2">Pago</th>
                </tr>
              </thead>
              <tbody>
                {(appointmentsQ.data ?? []).map((a) => {
                  const patient = formatPersonDisplayLastFirst(a.patient.lastName, a.patient.firstName);
                  const fee = parseMoney(a.specialist.consultationFee);
                  const paid = appointmentImputadoPagadoArs(a);
                  const debt = appointmentDebtAmountArs(a);
                  return (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 whitespace-nowrap">{a.appointmentDate.slice(0, 10)}</td>
                      <td className="py-2 pr-3">{patient}</td>
                      <td className="py-2 pr-3">{statusLabel[a.status]}</td>
                      <td className="py-2 pr-3">{formatMoney(fee)}</td>
                      <td className="py-2 pr-3">{formatMoney(paid)}</td>
                      <td className="py-2 pr-3">{debt > 0 ? formatMoney(debt) : "—"}</td>
                      <td className="py-2">
                        {a.paymentCompleted ? "Sí" : "No"}
                        {a.paymentMethod ? (
                          <span className="block text-xs text-slate-500">{paymentMethodLabel[a.paymentMethod]}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
