import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAppointment,
  deleteAppointment,
  fetchAppointments,
  fetchPatients,
  fetchSpecialists,
  updateAppointment,
} from "../api/endpoints";
import { getAppointmentDateStr, getEndTimeStr, getStartTimeStr } from "../lib/appointmentDisplay";
import { useAuth } from "../contexts/AuthContext";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Appointment, AppointmentPaymentMethod, AppointmentStatus } from "../types";

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

const statuses: AppointmentStatus[] = ["RESERVED", "ATTENDED", "CANCELLED", "NO_SHOW"];

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
  RESERVED: "RESERVADO",
  ATTENDED: "FINALIZADO",
  CANCELLED: "CANCELÓ",
  NO_SHOW: "NO ASISTIÓ",
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

function patientNameUpper(lastName: string, firstName: string): string {
  return `${lastName}, ${firstName}`.toUpperCase();
}

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

  const isEdit = Boolean(appointment);
  const consultorioDayQ = useQuery({
    queryKey: ["appointments", "consultorio-day", dateStr],
    queryFn: () =>
      fetchAppointments({
        from: dateStr,
        to: dateStr,
      }),
    enabled: open && Boolean(dateStr),
  });

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
          a.status !== "CANCELLED" &&
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
              a.status !== "CANCELLED" &&
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

  const selectedSpecialist = isAdmin && !fixedSpecialistId
    ? specialists.find((s) => s.id === effectiveSpecialistId) ?? null
    : null;

  useEffect(() => {
    if (!patientId || patients.length === 0) return;
    const existsInFilteredList = patients.some((p) => p.id === patientId);
    if (!existsInFilteredList) setPatientId("");
  }, [patientId, patients]);

  const canSubmit = useMemo(() => {
    if (!patientId || !consultorio.trim() || !dateStr || !startTimeStr || !endTimeStr) return false;
    if (paymentCompleted && !paymentDateStr) return false;
    if (isAdmin && !effectiveSpecialistId) return false;
    if (!isAdmin && !mySpecialistId) return false;
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
  ]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/12 p-2 backdrop-blur-[1px] sm:items-center sm:p-4">
      <div
        className="appointment-modal-card h-full w-full max-w-xl overflow-y-auto rounded-2xl p-6 shadow-xl sm:h-auto sm:max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? "Editar cita" : "Nueva cita"}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
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
                  {patientNameUpper(p.lastName, p.firstName)} — {p.email}
                </option>
              ))}
            </select>
          </div>

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
                    {s.lastName}, {s.firstName} — {s.specialty}
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
              Especialista: <strong>{user?.specialist?.lastName}</strong>
            </p>
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
              onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </div>
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
          {selectedSpecialist && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-slate-700">
              <p>
                Valor consulta:{" "}
                <strong>
                  {formatArsAmount(selectedSpecialist.consultationFee) ?? "No configurado"}
                </strong>
              </p>
              <p>
                Alias transferencia:{" "}
                <strong>{selectedSpecialist.transferAlias || "No configurado"}</strong>
              </p>
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

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={!canSubmit || createMut.isPending || updateMut.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {isEdit ? "Guardar" : "Crear"}
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteMut.isPending}
                className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-2 text-red-700 hover:bg-red-100"
              >
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-slate-700 hover:bg-white"
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
