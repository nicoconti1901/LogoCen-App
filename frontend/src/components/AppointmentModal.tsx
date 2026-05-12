import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAppointment,
  deleteAppointment,
  fetchAppointments,
  fetchPatients,
  fetchSpecialist,
  fetchSpecialists,
  updateAppointment,
} from "../api/endpoints";
import { getAppointmentDateStr, getEndTimeStr, getStartTimeStr } from "../lib/appointmentDisplay";
import { formatPersonDisplayLastFirst, formatPersonDisplayLastFirstUpper, normalizePersonNameField } from "../lib/personName";
import { useAuth } from "../contexts/AuthContext";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Appointment, AppointmentPaymentMethod, AppointmentStatus } from "../types";
import { appointmentDebtAmountArs, appointmentHasDebt } from "../lib/appointmentDebt";
import { appointmentBlocksScheduleSlot } from "../lib/appointmentScheduling";

type Props = {
  open: boolean;
  onClose: () => void;
  initialStart?: Date;
  initialEnd?: Date;
  appointment?: Appointment | null;
  /** Admin viendo la agenda de un especialista: el turno queda asignado a ese profesional. */
  fixedSpecialistId?: string;
  onSaved: () => void;
};

const statuses: AppointmentStatus[] = [
  "RESERVED",
  "RESERVADO",
  "ATTENDED",
  "AUSENTE_CON_AVISO",
  "AUSENTE_SIN_AVISO",
];

function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTimeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WORKDAY_START = "08:00";
const WORKDAY_END = "20:00";
const SHORT_FREE_RANGE_MINUTES = 30;
const CONSULTORIOS_BASE = [
  "Consultorio 1",
  "Consultorio 2",
  "Consultorio 3",
  "Consultorio 4",
  "Consultorio 5",
];

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

const statusLabel: Record<AppointmentStatus, string> = {
  RESERVED: "Agendado",
  RESERVADO: "Reservado",
  ATTENDED: "Finalizado",
  AUSENTE_CON_AVISO: "Ausente con aviso",
  AUSENTE_SIN_AVISO: "Ausente sin aviso",
};
const paymentMethods: AppointmentPaymentMethod[] = [
  "TRANSFER_TO_LOGOCEN",
  "TRANSFER_TO_SPECIALIST",
  "CASH_TO_LOGOCEN",
];
const paymentMethodLabel: Record<AppointmentPaymentMethod, string> = {
  TRANSFER_TO_LOGOCEN: "Transferencia a LogoCen",
  TRANSFER_TO_SPECIALIST: "Transferencia al especialista",
  CASH_TO_LOGOCEN: "Efectivo a LogoCen",
};
const labelClass = "block text-sm font-medium text-slate-700";
const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200/70";

function formatArsAmount(value: string | null): string | null {
  if (!value) return null;
  const normalized = Number(value.replace(",", "."));
  if (!Number.isFinite(normalized)) return null;
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(normalized);
  return `$${formatted}`;
}

/** Monto estrictamente positivo desde texto (coma o punto decimal). */
function parsePositiveMoneyInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function AppointmentModal({
  open,
  onClose,
  initialStart,
  initialEnd,
  appointment,
  fixedSpecialistId,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const mySpecialistId = user?.specialistId ?? "";

  const [patientId, setPatientId] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [consultorio, setConsultorio] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("RESERVED");
  const [reservationDepositStr, setReservationDepositStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<AppointmentPaymentMethod | "">("");
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentDateStr, setPaymentDateStr] = useState("");
  const [medicalRecord, setMedicalRecord] = useState("");
  const [reasonForVisit, setReasonForVisit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const effectiveSpecialistId = fixedSpecialistId ?? (isAdmin ? specialistId : mySpecialistId);

  const qc = useQueryClient();
  const patientsQ = useQuery({
    queryKey: ["patients", "by-specialist", effectiveSpecialistId || "all"],
    queryFn: () => fetchPatients(undefined, effectiveSpecialistId || undefined),
    enabled: open,
  });
  const specialistsQ = useQuery({
    queryKey: ["specialists"],
    queryFn: () => fetchSpecialists(false),
    enabled: open && isAdmin,
  });

  const specialistForFeesQ = useQuery({
    queryKey: ["specialist", "appointment-modal-fees", effectiveSpecialistId],
    queryFn: () => fetchSpecialist(effectiveSpecialistId!),
    enabled: open && Boolean(effectiveSpecialistId),
  });

  const isEdit = Boolean(appointment);
  /** Especialistas: alta y baja de turnos; no modificación de datos de citas existentes. */
  const specialistEditingForbidden = !isAdmin && isEdit;
  const consultorioDayQ = useQuery({
    queryKey: ["appointments", "consultorio-day", dateStr],
    queryFn: () =>
      fetchAppointments({
        from: dateStr,
        to: dateStr,
      }),
    enabled: open && Boolean(dateStr),
  });

  const patientPastApptsQ = useQuery({
    queryKey: ["appointments", "patient-debt-banner", patientId],
    queryFn: () => fetchAppointments({ patientId }),
    enabled: open && Boolean(patientId),
  });

  const specialistApptsForDebtLabelsQ = useQuery({
    queryKey: ["appointments", "modal-patient-debt-labels", effectiveSpecialistId],
    queryFn: () => fetchAppointments({ specialistId: effectiveSpecialistId! }),
    enabled: open && Boolean(effectiveSpecialistId),
  });

  const patientIdsWithDebtFromAgenda = useMemo(() => {
    const s = new Set<string>();
    for (const a of specialistApptsForDebtLabelsQ.data ?? []) {
      if (a.id === appointment?.id) continue;
      if (appointmentHasDebt(a)) s.add(a.patientId);
    }
    return s;
  }, [specialistApptsForDebtLabelsQ.data, appointment?.id]);

  const patientDebtBanner = useMemo(() => {
    const rows = patientPastApptsQ.data ?? [];
    let total = 0;
    let any = false;
    for (const a of rows) {
      if (a.id === appointment?.id) continue;
      if (appointmentHasDebt(a)) {
        any = true;
        total += appointmentDebtAmountArs(a);
      }
    }
    return { any, total };
  }, [patientPastApptsQ.data, appointment?.id]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (appointment) {
      setPatientId(appointment.patientId);
      setSpecialistId(appointment.specialistId);
      setConsultorio(appointment.consultorio ?? "");
      setDateStr(getAppointmentDateStr(appointment));
      setStartTimeStr(getStartTimeStr(appointment));
      setEndTimeStr(getEndTimeStr(appointment));
      setStatus(appointment.status);
      setPaymentMethod(appointment.paymentMethod ?? "");
      setPaymentCompleted(appointment.paymentCompleted ?? false);
      setPaymentDateStr(appointment.paymentDate ?? "");
      setMedicalRecord(appointment.medicalRecord ?? "");
      setReasonForVisit(appointment.reasonForVisit ?? "");
      const dep = appointment.reservationDepositAmount;
      setReservationDepositStr(
        dep != null && String(dep).trim() !== "" ? String(dep).replace(",", ".") : ""
      );
    } else {
      const s = initialStart ?? new Date();
      const e = initialEnd ?? new Date(s.getTime() + 30 * 60 * 1000);
      setPatientId("");
      setSpecialistId(
        fixedSpecialistId ? fixedSpecialistId : isAdmin ? "" : mySpecialistId
      );
      setConsultorio("");
      setDateStr(localDateStr(s));
      setStartTimeStr(localTimeStr(s));
      setEndTimeStr(localTimeStr(e));
      setStatus("RESERVED");
      setPaymentMethod("");
      setPaymentCompleted(false);
      setPaymentDateStr(localDateStr(s));
      setMedicalRecord("");
      setReasonForVisit("");
      setReservationDepositStr("");
    }
  }, [open, appointment, initialStart, initialEnd, isAdmin, mySpecialistId, fixedSpecialistId]);

  const createMut = useMutation({
    mutationFn: () =>
      createAppointment({
        patientId,
        specialistId: isAdmin ? (fixedSpecialistId ?? specialistId) : mySpecialistId,
        consultorio,
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        status,
        reservationDepositAmount:
          status === "RESERVADO" ? parsePositiveMoneyInput(reservationDepositStr) : null,
        paymentMethod: paymentMethod || null,
        paymentCompleted,
        paymentDate: paymentCompleted ? paymentDateStr : null,
        medicalRecord: medicalRecord || null,
        reasonForVisit: reasonForVisit || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      onSaved();
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setError(msg ?? "No se pudo crear la cita");
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateAppointment(appointment!.id, {
        patientId: isAdmin ? patientId : undefined,
        specialistId: isAdmin ? (fixedSpecialistId ?? specialistId) : undefined,
        consultorio,
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        status,
        reservationDepositAmount:
          status === "RESERVADO" ? parsePositiveMoneyInput(reservationDepositStr) : null,
        paymentMethod: paymentMethod || null,
        paymentCompleted,
        paymentDate: paymentCompleted ? paymentDateStr : null,
        medicalRecord: medicalRecord || null,
        reasonForVisit: reasonForVisit || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      onSaved();
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setError(msg ?? "No se pudo guardar");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAppointment(appointment!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      onSaved();
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setError(msg ?? "No se pudo eliminar");
    },
  });

  const patients = patientsQ.data ?? [];
  const specialists = specialistsQ.data ?? [];
  const consultorioDayRows = consultorioDayQ.data ?? [];

  const consultorioFreeRanges = useMemo(() => {
    const office = consultorio.trim().toLowerCase();
    if (!office || !dateStr) return [] as Array<{ label: string; minutes: number }>;

    const startMin = hhmmToMinutes(WORKDAY_START);
    const endMin = hhmmToMinutes(WORKDAY_END);

    const occupied = consultorioDayRows
      .filter(
        (a) =>
          a.id !== appointment?.id &&
          appointmentBlocksScheduleSlot(a) &&
          a.consultorio.trim().toLowerCase() === office
      )
      .map((a) => ({
        start: hhmmToMinutes(a.startTime),
        end: hhmmToMinutes(a.endTime),
      }))
      .filter((r) => r.end > r.start)
      .sort((a, b) => a.start - b.start)
      .reduce<Array<{ start: number; end: number }>>((acc, cur) => {
        const last = acc[acc.length - 1];
        if (!last || cur.start > last.end) {
          acc.push({ ...cur });
        } else if (cur.end > last.end) {
          last.end = cur.end;
        }
        return acc;
      }, []);

    const free: Array<{ label: string; minutes: number }> = [];
    let cursor = startMin;
    for (const r of occupied) {
      const rs = Math.max(startMin, r.start);
      const re = Math.min(endMin, r.end);
      if (rs > cursor) {
        free.push({
          label: `${minutesToHHmm(cursor)}-${minutesToHHmm(rs)}`,
          minutes: rs - cursor,
        });
      }
      cursor = Math.max(cursor, re);
    }
    if (cursor < endMin) {
      free.push({
        label: `${minutesToHHmm(cursor)}-${minutesToHHmm(endMin)}`,
        minutes: endMin - cursor,
      });
    }
    if (free.length === 0) free.push({ label: "Sin huecos", minutes: 0 });
    return free;
  }, [consultorio, dateStr, consultorioDayRows, appointment?.id]);

  const consultorioOptions = useMemo(() => {
    const selectedStart = startTimeStr ? hhmmToMinutes(startTimeStr) : NaN;
    const selectedEnd = endTimeStr ? hhmmToMinutes(endTimeStr) : NaN;
    const hasSelectedRange =
      Number.isFinite(selectedStart) && Number.isFinite(selectedEnd) && selectedEnd > selectedStart;

    const offices = Array.from(
      new Set([
        ...CONSULTORIOS_BASE,
        ...consultorioDayRows.map((a) => a.consultorio.trim()).filter(Boolean),
      ])
    );

    return offices
      .map((office) => {
        const occupiedRanges = consultorioDayRows
          .filter(
            (a) =>
              a.id !== appointment?.id &&
              appointmentBlocksScheduleSlot(a) &&
              a.consultorio.trim().toLowerCase() === office.toLowerCase()
          )
          .map((a) => ({ start: hhmmToMinutes(a.startTime), end: hhmmToMinutes(a.endTime) }))
          .filter((r) => r.end > r.start);

        const occupiedInSelected =
          hasSelectedRange &&
          occupiedRanges.some((r) => rangesOverlap(selectedStart, selectedEnd, r.start, r.end));

        const status = hasSelectedRange
          ? occupiedInSelected
            ? "Ocupado en ese horario"
            : "Disponible en ese horario"
          : occupiedRanges.length > 0
            ? "Con turnos ese día"
            : "Libre ese día";

        return {
          office,
          occupiedInSelected,
          status,
        };
      })
      .sort((a, b) => a.office.localeCompare(b.office));
  }, [consultorioDayRows, appointment?.id, startTimeStr, endTimeStr]);

  useEffect(() => {
    if (!patientId || patients.length === 0) return;
    const existsInFilteredList = patients.some((p) => p.id === patientId);
    if (!existsInFilteredList) setPatientId("");
  }, [patientId, patients]);

  const canSubmit = useMemo(() => {
    if (specialistEditingForbidden) return false;
    if (!patientId || !dateStr || !startTimeStr || !endTimeStr) return false;
    if (status !== "AUSENTE_CON_AVISO" && !consultorio.trim()) return false;
    if (paymentCompleted && !paymentDateStr) return false;
    if (isAdmin && !effectiveSpecialistId) return false;
    if (!isAdmin && !mySpecialistId) return false;
    if (status === "RESERVADO") {
      const dep = parsePositiveMoneyInput(reservationDepositStr);
      if (dep == null) return false;
      const feeRaw = specialistForFeesQ.data?.consultationFee;
      if (feeRaw != null && String(feeRaw).trim() !== "") {
        const fee = Number(String(feeRaw).replace(",", "."));
        if (Number.isFinite(fee) && fee > 0 && dep > fee) return false;
      }
    }
    return true;
  }, [
    patientId,
    consultorio,
    dateStr,
    startTimeStr,
    endTimeStr,
    paymentCompleted,
    paymentDateStr,
    isAdmin,
    effectiveSpecialistId,
    mySpecialistId,
    specialistEditingForbidden,
    status,
    reservationDepositStr,
    specialistForFeesQ.data?.consultationFee,
  ]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (specialistEditingForbidden) return;
    setError(null);
    if (!canSubmit) return;
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40 p-2 backdrop-blur-[1px] sm:items-center sm:p-4">
      <div
        className="h-full w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-6 shadow-xl ring-1 ring-slate-900/5 sm:h-auto sm:max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {specialistEditingForbidden ? "Detalle del turno" : isEdit ? "Editar cita" : "Nueva cita"}
          </h2>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 active:translate-y-px"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          {specialistEditingForbidden && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              No podés modificar los datos de un turno ya cargado. Si necesitás cambios, contactá a un administrador.
              Podés eliminar este turno con el botón inferior.
            </p>
          )}
          <fieldset
            disabled={specialistEditingForbidden}
            className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-75"
          >
          <div>
            <label className={labelClass}>Paciente</label>
            <select
              required
              disabled={!isAdmin && isEdit}
              className={fieldClass}
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPersonDisplayLastFirstUpper(p.lastName, p.firstName)} — {p.email}
                  {patientIdsWithDebtFromAgenda.has(p.id) ? " — con deuda" : ""}
                </option>
              ))}
            </select>
          </div>

          {patientId && patientDebtBanner.any && (
            <div
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              role="status"
            >
              <p className="font-semibold">Este paciente tiene deuda por turnos previos</p>
              <p className="mt-0.5 text-xs leading-snug">
                {patientDebtBanner.total > 0 ? (
                  <>
                    Total estimado pendiente:{" "}
                    <strong>{formatArsAmount(String(patientDebtBanner.total))}</strong> (según honorarios cargados).
                  </>
                ) : (
                  <>
                    Hay turnos marcados con saldo pendiente; cargá el honorario del profesional en esos turnos para ver
                    montos exactos.
                  </>
                )}
              </p>
            </div>
          )}

          {isAdmin && !fixedSpecialistId && (
            <div>
              <label className={labelClass}>Especialista</label>
              <select
                required
                className={fieldClass}
                value={specialistId}
                onChange={(e) => setSpecialistId(e.target.value)}
              >
                <option value="">Seleccione…</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatPersonDisplayLastFirst(s.lastName, s.firstName)} — {s.specialty}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && fixedSpecialistId && (
            <p className="text-sm text-slate-600">
              Especialista fijo para esta vista de agenda.
            </p>
          )}
          {!isAdmin && (
            <p className="text-sm text-slate-600">
              Especialista: <strong>{normalizePersonNameField(user?.specialist?.lastName ?? "")}</strong>
            </p>
          )}

          {effectiveSpecialistId && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold text-sky-900">Valor de la consulta y cobro</p>
              {specialistForFeesQ.isLoading ? (
                <p className="mt-1 text-slate-600">Cargando honorario y alias…</p>
              ) : (
                <>
                  <p className="mt-1">
                    Monto de referencia:{" "}
                    <strong>
                      {formatArsAmount(specialistForFeesQ.data?.consultationFee ?? null) ?? "Sin honorario cargado"}
                    </strong>
                  </p>
                  <p className="mt-1">
                    Alias para transferencias:{" "}
                    <strong>{specialistForFeesQ.data?.transferAlias?.trim() || "Sin alias cargado"}</strong>
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Fecha</label>
            <input
              type="date"
              required
              className={fieldClass}
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>

          {status === "AUSENTE_CON_AVISO" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">Inasistencia con aviso</p>
              <p className="mt-1 text-xs text-amber-900">
                No se asigna consultorio. Se imputa al paciente el <strong>50%</strong> del honorario de referencia
                (salvo «Pago realizado» en Sí).
              </p>
            </div>
          ) : (
          <div>
            <label className={labelClass}>Consultorio</label>
            <select
              required
              className={fieldClass}
              value={consultorio}
              onChange={(e) => setConsultorio(e.target.value)}
            >
              <option value="">Seleccione consultorio…</option>
              {consultorioOptions.map((o) => (
                <option key={o.office} value={o.office} disabled={o.occupiedInSelected}>
                  {o.office} — {o.status}
                </option>
              ))}
            </select>
            {consultorio.trim() && dateStr && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-700">
                  Disponibilidad en {consultorio.trim()} ({dateStr})
                </p>
                {consultorioDayQ.isLoading ? (
                  <p className="mt-1 text-xs text-slate-500">Calculando rangos libres…</p>
                ) : (
                  <div className="mt-1">
                    <p className="text-xs text-slate-600">Libres:</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {consultorioFreeRanges.map((r, i) => {
                        const isNone = r.label === "Sin huecos";
                        const isShort = !isNone && r.minutes < SHORT_FREE_RANGE_MINUTES;
                        const cls = isNone
                          ? "bg-slate-200 text-slate-700"
                          : isShort
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800";
                        return (
                          <span key={`${r.label}-${i}`} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
                            {r.label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Verde: hueco util (&gt;= {SHORT_FREE_RANGE_MINUTES} min) · Amarillo: hueco corto.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Hora inicio</label>
              <input
                type="time"
                required
                className={fieldClass}
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Hora fin</label>
              <input
                type="time"
                required
                className={fieldClass}
                value={endTimeStr}
                onChange={(e) => setEndTimeStr(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Estado</label>
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => {
                const v = e.target.value as AppointmentStatus;
                setStatus(v);
                if (v !== "RESERVADO") setReservationDepositStr("");
                if (v === "AUSENTE_CON_AVISO") setConsultorio("");
              }}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </div>
          {status === "AUSENTE_SIN_AVISO" && (
            <p className="mt-1 text-xs text-rose-800">
              Inasistencia sin aviso: se imputa el <strong>100%</strong> del honorario de referencia mientras «Pago
              realizado» sea No.
            </p>
          )}
          {status === "RESERVADO" && (
            <div>
              <label className={labelClass}>Monto del anticipo / seña (ARS)</label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="Ej. 5000 o 5000,50"
                className={fieldClass}
                value={reservationDepositStr}
                onChange={(e) => setReservationDepositStr(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-600">
                {(() => {
                  const dep = parsePositiveMoneyInput(reservationDepositStr);
                  const feeRaw = specialistForFeesQ.data?.consultationFee;
                  const fee =
                    feeRaw != null && String(feeRaw).trim() !== ""
                      ? Number(String(feeRaw).replace(",", "."))
                      : null;
                  if (reservationDepositStr.trim() === "" || dep == null) {
                    return "Ingresá el monto abonado como reserva (mayor a cero).";
                  }
                  if (fee == null || !Number.isFinite(fee) || fee <= 0) {
                    return "Anticipo registrado. Si el profesional tiene honorario cargado, se mostrará cuánto falta pagar.";
                  }
                  if (dep > fee) {
                    return "El anticipo no puede ser mayor al valor de la consulta.";
                  }
                  const rest = Math.max(0, fee - dep);
                  return `Honorario de referencia ${formatArsAmount(String(feeRaw))}: falta pagar ${formatArsAmount(String(rest))} al momento de la consulta (si no hay otros cargos).`;
                })()}
              </p>
            </div>
          )}
          <div>
            <label className={labelClass}>Forma de pago</label>
            <select
              className={fieldClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as AppointmentPaymentMethod | "")}
            >
              <option value="">Sin definir</option>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabel[method]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Pago realizado</label>
            <select
              className={fieldClass}
              value={paymentCompleted ? "YES" : "NO"}
              onChange={(e) => {
                const isPaid = e.target.value === "YES";
                setPaymentCompleted(isPaid);
                if (!isPaid) setPaymentDateStr("");
                else if (!paymentDateStr) setPaymentDateStr(dateStr || localDateStr(new Date()));
              }}
            >
              <option value="NO">No</option>
              <option value="YES">Sí</option>
            </select>
            {status === "RESERVADO" && (
              <p className="mt-1 text-xs text-slate-600">
                La seña indicada se contabiliza como ya abonada sobre el honorario. <strong>No</strong> en «Pago
                realizado» indica que sigue pendiente el saldo a pagar en la consulta, no que la seña no se haya
                cobrado.
              </p>
            )}
          </div>
          {paymentCompleted && (
            <div>
              <label className={labelClass}>Fecha de pago</label>
              <input
                type="date"
                required
                className={fieldClass}
                value={paymentDateStr}
                onChange={(e) => setPaymentDateStr(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Motivo de consulta</label>
            <textarea
              className={`${fieldClass} resize-y`}
              rows={2}
              value={reasonForVisit}
              onChange={(e) => setReasonForVisit(e.target.value)}
            />
          </div>

          {isEdit && (
            <div>
              <label className={labelClass}>Historial / registro médico</label>
              <textarea
                className={`${fieldClass} resize-y font-mono text-sm`}
                rows={5}
                value={medicalRecord}
                onChange={(e) => setMedicalRecord(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          </fieldset>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {!specialistEditingForbidden && (
              <button
                type="submit"
                disabled={!canSubmit || createMut.isPending || updateMut.isPending}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-brand-900/20 transition hover:bg-brand-800 active:translate-y-px active:bg-brand-900 active:shadow-sm disabled:opacity-50"
              >
                {isEdit ? "Guardar" : "Crear"}
              </button>
            )}
            {isEdit && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteMut.isPending}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-rose-400 bg-rose-50 px-4 py-2 text-sm font-bold tracking-tight text-rose-900 shadow-sm ring-1 ring-rose-900/10 transition hover:border-rose-500 hover:bg-rose-100 active:translate-y-px"
              >
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 active:translate-y-px"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar cita"
        message="Esta acción eliminará la cita de forma permanente."
        confirmLabel="Eliminar"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteMut.mutate();
          setShowDeleteConfirm(false);
        }}
      />
    </div>
  );
}
