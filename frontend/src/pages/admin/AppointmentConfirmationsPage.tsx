import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppointments, fetchSpecialists } from "../../api/endpoints";
import { AppointmentModal } from "../../components/AppointmentModal";
import { useAuth } from "../../contexts/AuthContext";
import { getAppointmentDateStr } from "../../lib/appointmentDisplay";
import {
  formatPatientConfirmedAt,
  patientConfirmationSourceLabel,
} from "../../lib/appointmentConfirmation";
import { formatPersonDisplayLastFirst } from "../../lib/personName";
import type { Appointment } from "../../types";

type FilterTab = "pending" | "confirmed";

function dateToIsoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return dateToIsoLocal(d);
}

function formatDayHeading(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const statusShort: Record<Appointment["status"], string> = {
  RESERVED: "Agendado",
  CONFIRMADO: "Confirmado",
  RESERVADO: "Reservado",
  ATTENDED: "Finalizado",
  AUSENTE_CON_AVISO: "Ausente c/ aviso",
  AUSENTE_SIN_AVISO: "Ausente s/ aviso",
};

export function AppointmentConfirmationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = dateToIsoLocal(new Date());

  const [filter, setFilter] = useState<FilterTab>("pending");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDaysIso(today, 13));
  const [specialistId, setSpecialistId] = useState("");
  const [modalAppointment, setModalAppointment] = useState<Appointment | null>(null);

  if (user?.role !== "ADMIN") {
    return <Navigate to="/agenda" replace />;
  }

  const specialistsQ = useQuery({
    queryKey: ["specialists"],
    queryFn: () => fetchSpecialists(true),
  });

  const appointmentsQ = useQuery({
    queryKey: ["appointment-confirmations", from, to, filter, specialistId],
    queryFn: () =>
      fetchAppointments({
        from,
        to,
        confirmation: filter,
        ...(specialistId ? { specialistId } : {}),
      }),
  });

  const statsQ = useQuery({
    queryKey: ["appointment-confirmations-stats", from, to, specialistId],
    queryFn: async () => {
      const [pending, confirmed] = await Promise.all([
        fetchAppointments({
          from,
          to,
          confirmation: "pending",
          ...(specialistId ? { specialistId } : {}),
        }),
        fetchAppointments({
          from,
          to,
          confirmation: "confirmed",
          ...(specialistId ? { specialistId } : {}),
        }),
      ]);
      return { pending: pending.length, confirmed: confirmed.length };
    },
  });

  const pendingTodayQ = useQuery({
    queryKey: ["appointment-confirmations-today", specialistId],
    queryFn: () =>
      fetchAppointments({
        from: today,
        to: today,
        confirmation: "pending",
        ...(specialistId ? { specialistId } : {}),
      }),
  });

  const rows = appointmentsQ.data ?? [];
  const specialists = specialistsQ.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of rows) {
      const key = getAppointmentDateStr(a);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const invalidateLists = async () => {
    await qc.invalidateQueries({ queryKey: ["appointment-confirmations"] });
    await qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  return (
    <div className="admin-medical-page-bg admin-medical-page-fullbleed min-h-[calc(100vh-4.5rem)] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-800">Recordatorios WhatsApp (Meta Business)</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Confirmación de turnos</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Los turnos en estado <strong>Agendado</strong> aún no fueron confirmados. El paciente puede confirmar con
              el botón del WhatsApp (24 h antes, o de inmediato si el turno es en menos de 24 h). También podés cambiar el
              estado a <strong>Confirmado</strong> desde el turno.
            </p>
          </div>
          <Link
            to="/agenda"
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-sky-200 bg-white px-5 py-2.5 text-sm font-semibold text-sky-800 shadow-sm hover:bg-sky-50"
          >
            Ir a agenda
          </Link>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Agendados hoy</p>
            <p className="mt-1 text-3xl font-bold text-amber-950">{pendingTodayQ.data?.length ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Agendados en el rango</p>
            <p className="mt-1 text-3xl font-bold text-amber-700">{statsQ.data?.pending ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Confirmados en el rango</p>
            <p className="mt-1 text-3xl font-bold text-emerald-950">{statsQ.data?.confirmed ?? "-"}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "pending" as const, label: "Agendados" },
                  { id: "confirmed" as const, label: "Confirmados" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filter === tab.id
                      ? "bg-sky-600 text-white shadow-md"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Desde</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Hasta</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Especialista</span>
                <select
                  className="min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={specialistId}
                  onChange={(e) => setSpecialistId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {specialists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatPersonDisplayLastFirst(s.lastName, s.firstName)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {appointmentsQ.isLoading ? (
            <p className="mt-6 text-sm text-slate-500">Cargando turnos...</p>
          ) : grouped.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
              {filter === "pending"
                ? "No hay turnos agendados en este periodo."
                : "No hay turnos confirmados en este periodo."}
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {grouped.map(([day, dayRows]) => (
                <div key={day}>
                  <h2 className="mb-2 text-sm font-semibold capitalize text-slate-800">{formatDayHeading(day)}</h2>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Horario</th>
                          <th className="px-4 py-3">Paciente</th>
                          <th className="px-4 py-3">Telefono</th>
                          <th className="px-4 py-3">Especialista</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3 text-right">Accion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dayRows.map((a) => {
                          const source = patientConfirmationSourceLabel(a.patientConfirmationSource);
                          const at = formatPatientConfirmedAt(a.patientConfirmedAt);
                          return (
                            <tr key={a.id} className="bg-white hover:bg-slate-50/80">
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                                {a.startTime}-{a.endTime}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-900">
                                  {formatPersonDisplayLastFirst(a.patient.lastName, a.patient.firstName)}
                                </p>
                                <p className="text-xs text-slate-500">{a.consultorio}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-700">{a.patient.phone?.trim() || "-"}</td>
                              <td className="px-4 py-3 text-slate-700">
                                {formatPersonDisplayLastFirst(a.specialist.lastName, a.specialist.firstName)}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-800">{statusShort[a.status]}</p>
                                {a.status === "CONFIRMADO" && at && (
                                  <p className="mt-0.5 text-[11px] text-slate-500">
                                    {at}
                                    {source ? ` · ${source}` : ""}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setModalAppointment(a)}
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                                >
                                  Cambiar estado
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AppointmentModal
        open={modalAppointment != null}
        onClose={() => setModalAppointment(null)}
        appointment={modalAppointment}
        onSaved={async () => {
          setModalAppointment(null);
          await invalidateLists();
        }}
      />
    </div>
  );
}
