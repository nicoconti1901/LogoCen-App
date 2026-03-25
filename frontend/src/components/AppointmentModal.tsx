import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAppointment,
  deleteAppointment,
  fetchOffices,
  fetchPatients,
  fetchSpecialists,
  updateAppointment,
} from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import type { Appointment, AppointmentStatus } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  initialStart?: Date;
  initialEnd?: Date;
  appointment?: Appointment | null;
  onSaved: () => void;
};

const statuses: AppointmentStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentModal({
  open,
  onClose,
  initialStart,
  initialEnd,
  appointment,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const mySpecialistId = user?.specialistId ?? "";

  const qc = useQueryClient();
  const patientsQ = useQuery({ queryKey: ["patients"], queryFn: () => fetchPatients(), enabled: open });
  const specialistsQ = useQuery({
    queryKey: ["specialists"],
    queryFn: () => fetchSpecialists(false),
    enabled: open && isAdmin,
  });
  const officesQ = useQuery({ queryKey: ["offices"], queryFn: fetchOffices, enabled: open });

  const [patientId, setPatientId] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("SCHEDULED");
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(appointment);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (appointment) {
      setPatientId(appointment.patientId);
      setSpecialistId(appointment.specialistId);
      setOfficeId(appointment.officeId ?? "");
      setStartStr(toLocalInput(new Date(appointment.startAt)));
      setEndStr(toLocalInput(new Date(appointment.endAt)));
      setNotes(appointment.notes ?? "");
      setStatus(appointment.status);
      setClinicalHistory(appointment.clinicalHistory ?? "");
    } else {
      const s = initialStart ?? new Date();
      const e = initialEnd ?? new Date(s.getTime() + 30 * 60 * 1000);
      setPatientId("");
      setSpecialistId(isAdmin ? "" : mySpecialistId);
      setOfficeId("");
      setStartStr(toLocalInput(s));
      setEndStr(toLocalInput(e));
      setNotes("");
      setStatus("SCHEDULED");
      setClinicalHistory("");
    }
  }, [open, appointment, initialStart, initialEnd, isAdmin, mySpecialistId]);

  const createMut = useMutation({
    mutationFn: () =>
      createAppointment({
        patientId,
        specialistId: isAdmin ? specialistId : mySpecialistId,
        officeId: officeId || null,
        startAt: new Date(startStr).toISOString(),
        endAt: new Date(endStr).toISOString(),
        notes: notes || null,
        status,
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
        specialistId: isAdmin ? specialistId : undefined,
        officeId: officeId || null,
        startAt: new Date(startStr).toISOString(),
        endAt: new Date(endStr).toISOString(),
        notes: notes || null,
        status,
        clinicalHistory: clinicalHistory || null,
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
  const offices = officesQ.data ?? [];

  const canSubmit = useMemo(() => {
    if (!patientId || !startStr || !endStr) return false;
    if (isAdmin && !specialistId) return false;
    if (!isAdmin && !mySpecialistId) return false;
    return true;
  }, [patientId, startStr, endStr, isAdmin, specialistId, mySpecialistId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
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
            <label className="block text-sm font-medium text-slate-700">Paciente</label>
            <select
              required
              disabled={!isAdmin && isEdit}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} — {p.email}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Especialista</label>
              <select
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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

          {!isAdmin && (
            <p className="text-sm text-slate-600">
              Especialista: <strong>{user?.specialist?.lastName}</strong>
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700">Consultorio (opcional)</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
            >
              <option value="">—</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.number ? ` (${o.number})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Inicio</label>
              <input
                type="datetime-local"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Fin</label>
              <input
                type="datetime-local"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Estado</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s === "SCHEDULED" ? "Programada" : s === "COMPLETED" ? "Completada" : "Cancelada"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Notas</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Historial clínico (completado por el especialista)
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                rows={5}
                value={clinicalHistory}
                onChange={(e) => setClinicalHistory(e.target.value)}
                placeholder="Evolución, diagnóstico, indicaciones…"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={!canSubmit || createMut.isPending || updateMut.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isEdit ? "Guardar" : "Crear"}
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("¿Eliminar esta cita?")) deleteMut.mutate();
                }}
                disabled={deleteMut.isPending}
                className="rounded-lg border border-red-200 px-4 py-2 text-red-700 hover:bg-red-50"
              >
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
