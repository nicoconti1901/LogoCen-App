import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAppointments, fetchSpecialists } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { AppointmentModal } from "../components/AppointmentModal";
import type { Appointment } from "../types";

export function AppointmentsListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [today, setToday] = useState(false);
  const [upcoming, setUpcoming] = useState(false);
  const [specialistId, setSpecialistId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const specialistsQ = useQuery({
    queryKey: ["specialists"],
    queryFn: () => fetchSpecialists(false),
    enabled: isAdmin,
  });

  const params = useMemo(() => {
    const p: Record<string, string | boolean> = {};
    if (today) p.today = true;
    if (upcoming) p.upcoming = true;
    if (isAdmin && specialistId) p.specialistId = specialistId;
    return p;
  }, [today, upcoming, isAdmin, specialistId]);

  const { data = [], refetch, isLoading } = useQuery({
    queryKey: ["appointments", "list", params],
    queryFn: () => fetchAppointments(params),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Citas</h1>
          <p className="text-slate-600">Filtros y acceso rápido a detalle.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setModalOpen(true);
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Nueva cita
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} />
          Solo hoy
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} />
          Próximas
        </label>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Especialista:</span>
            <select
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              value={specialistId}
              onChange={(e) => setSpecialistId(e.target.value)}
            >
              <option value="">Todos</option>
              {(specialistsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName}, {s.firstName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Inicio</th>
              <th className="px-4 py-3">Paciente</th>
              {isAdmin && <th className="px-4 py-3">Especialista</th>}
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Consultorio</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading &&
              data.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => {
                    setSelected(a);
                    setModalOpen(true);
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(a.startAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {a.patient.lastName}, {a.patient.firstName}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {a.specialist.lastName}, {a.specialist.firstName}
                    </td>
                  )}
                  <td className="px-4 py-3">{a.status}</td>
                  <td className="px-4 py-3">{a.office?.name ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!isLoading && data.length === 0 && (
          <p className="px-4 py-8 text-center text-slate-500">No hay citas con estos filtros.</p>
        )}
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelected(null);
        }}
        appointment={selected}
        onSaved={() => void refetch()}
      />
    </div>
  );
}
