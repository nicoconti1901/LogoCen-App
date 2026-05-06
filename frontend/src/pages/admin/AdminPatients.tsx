import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPatientClinicalHistory,
  createPatient,
  deletePatientClinicalHistory,
  deletePatient,
  fetchAppointments,
  fetchPatientClinicalHistory,
  fetchPatients,
  fetchSpecialists,
  updateAppointment,
  updatePatientClinicalHistory,
  updatePatient,
} from "../../api/endpoints";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAuth } from "../../contexts/AuthContext";
import type { Appointment, AppointmentStatus, ClinicalHistoryEntry, Patient, Specialist } from "../../types";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  documentId: "",
  birthDate: "",
  notes: "",
  specialistId: "",
};

function fullName(s: Pick<Specialist, "firstName" | "lastName">) {
  return `${s.lastName}, ${s.firstName}`;
}

function patientNameUpper(lastName: string, firstName: string): string {
  return `${lastName}, ${firstName}`.toUpperCase();
}

function appointmentHasDebt(
  paymentMethod: Appointment["paymentMethod"],
  status: AppointmentStatus,
  paymentCompleted: boolean
): boolean {
  if (paymentCompleted) return false;
  return paymentMethod === null || status === "NO_SHOW";
}

const paymentMethodLabel: Record<Exclude<Appointment["paymentMethod"], null>, string> = {
  TRANSFER_TO_LOGOCEN: "Transferencia a LogoCen",
  TRANSFER_TO_SPECIALIST: "Transferencia al especialista",
  CASH_TO_LOGOCEN: "Efectivo a LogoCen",
};

function parseMoney(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)}`;
}

const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  RESERVED: "RESERVADO",
  ATTENDED: "FINALIZADO",
  CANCELLED: "CANCELÓ",
  NO_SHOW: "NO ASISTIÓ",
};

export function AdminPatientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [specialistFilter, setSpecialistFilter] = useState("");
  const [debtFilter, setDebtFilter] = useState<"all" | "debt" | "no_debt">("all");
  const [showForm, setShowForm] = useState(false);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [paymentHistoryPatient, setPaymentHistoryPatient] = useState<Patient | null>(null);
  const [clinicalHistoryPatient, setClinicalHistoryPatient] = useState<Patient | null>(null);
  const [clinicalDate, setClinicalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clinicalDiagnosis, setClinicalDiagnosis] = useState("");
  const [paymentMethodByAppointmentId, setPaymentMethodByAppointmentId] = useState<
    Record<string, Exclude<Appointment["paymentMethod"], null>>
  >({});
  const [editingClinicalEntryId, setEditingClinicalEntryId] = useState<string | null>(null);
  const [editingClinicalDate, setEditingClinicalDate] = useState("");
  const [editingClinicalDiagnosis, setEditingClinicalDiagnosis] = useState("");
  const [pendingDeletePatientId, setPendingDeletePatientId] = useState<string | null>(null);
  const [pendingDeleteClinicalEntryId, setPendingDeleteClinicalEntryId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["patients", search, specialistFilter],
    queryFn: () => fetchPatients(search || undefined, specialistFilter || undefined),
  });
  const { data: specialists = [] } = useQuery({
    queryKey: ["specialists", "for-patients"],
    queryFn: () => fetchSpecialists(),
    enabled: isAdmin,
  });
  const { data: debtIndexAppointments = [], isLoading: isLoadingDebtIndex } = useQuery({
    queryKey: ["appointments", "patients-debt-index", specialistFilter, isAdmin ? "ADMIN" : user?.specialistId],
    queryFn: () =>
      fetchAppointments({
        ...(isAdmin
          ? specialistFilter
            ? { specialistId: specialistFilter }
            : {}
          : user?.specialistId
            ? { specialistId: user.specialistId }
            : {}),
      }),
  });
  const debtPatientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of debtIndexAppointments) {
      if (appointmentHasDebt(a.paymentMethod, a.status, a.paymentCompleted)) ids.add(a.patientId);
    }
    return ids;
  }, [debtIndexAppointments]);
  const debtAmountByPatientId = useMemo(() => {
    const amountMap = new Map<string, number>();
    for (const a of debtIndexAppointments) {
      if (!appointmentHasDebt(a.paymentMethod, a.status, a.paymentCompleted)) continue;
      const current = amountMap.get(a.patientId) ?? 0;
      amountMap.set(a.patientId, current + parseMoney(a.specialist.consultationFee));
    }
    return amountMap;
  }, [debtIndexAppointments]);
  const filteredPatients = useMemo(() => {
    if (debtFilter === "all") return data;
    return data.filter((p) => {
      const hasDebt = debtPatientIds.has(p.id);
      return debtFilter === "debt" ? hasDebt : !hasDebt;
    });
  }, [data, debtFilter, debtPatientIds]);

  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { data: appointmentHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["appointments", "patient-history", historyPatient?.id],
    queryFn: async () => {
      const appointments = await fetchAppointments({ patientId: historyPatient!.id });
      return appointments
        .slice()
        .sort((a, b) => {
          const aKey = `${a.appointmentDate} ${a.startTime}`;
          const bKey = `${b.appointmentDate} ${b.startTime}`;
          return bKey.localeCompare(aKey);
        })
        .slice(0, 6);
    },
    enabled: Boolean(historyPatient),
  });
  const { data: paymentHistory = [], isLoading: isLoadingPaymentHistory } = useQuery({
    queryKey: ["appointments", "patient-payment-history", paymentHistoryPatient?.id],
    queryFn: async () => {
      const appointments = await fetchAppointments({ patientId: paymentHistoryPatient!.id });
      return appointments.slice().sort((a, b) => {
        const aKey = `${a.appointmentDate} ${a.startTime}`;
        const bKey = `${b.appointmentDate} ${b.startTime}`;
        return bKey.localeCompare(aKey);
      });
    },
    enabled: Boolean(paymentHistoryPatient),
  });
  const paymentHistorySummary = useMemo(() => {
    const total = paymentHistory.length;
    const debtRows = paymentHistory.filter((a) => appointmentHasDebt(a.paymentMethod, a.status, a.paymentCompleted));
    const debtAmount = debtRows.reduce((acc, a) => acc + parseMoney(a.specialist.consultationFee), 0);
    return { total, debtCount: debtRows.length, hasDebt: debtRows.length > 0, debtAmount };
  }, [paymentHistory]);
  const { data: clinicalHistory = [], isLoading: isLoadingClinicalHistory } = useQuery({
    queryKey: ["patients", "clinical-history", clinicalHistoryPatient?.id],
    queryFn: () => fetchPatientClinicalHistory(clinicalHistoryPatient!.id),
    enabled: Boolean(clinicalHistoryPatient),
  });

  const createClinicalHistoryMut = useMutation({
    mutationFn: () =>
      createPatientClinicalHistory(clinicalHistoryPatient!.id, {
        recordDate: clinicalDate,
        diagnosis: clinicalDiagnosis,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients", "clinical-history", clinicalHistoryPatient?.id] });
      setClinicalDiagnosis("");
      setClinicalDate(new Date().toISOString().slice(0, 10));
    },
  });
  const updateClinicalHistoryMut = useMutation({
    mutationFn: (args: { entryId: string; recordDate: string; diagnosis: string }) =>
      updatePatientClinicalHistory(clinicalHistoryPatient!.id, args.entryId, {
        recordDate: args.recordDate,
        diagnosis: args.diagnosis,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients", "clinical-history", clinicalHistoryPatient?.id] });
      setEditingClinicalEntryId(null);
      setEditingClinicalDate("");
      setEditingClinicalDiagnosis("");
    },
  });
  const deleteClinicalHistoryMut = useMutation({
    mutationFn: (entryId: string) => deletePatientClinicalHistory(clinicalHistoryPatient!.id, entryId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients", "clinical-history", clinicalHistoryPatient?.id] });
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      createPatient({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
        documentId: form.documentId || null,
        birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null,
        notes: form.notes || null,
        specialistId: form.specialistId || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients"] });
      setForm(emptyForm);
      setShowForm(false);
    },
  });

  function startEdit(p: Patient) {
    setEditing(p);
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone ?? "",
      documentId: p.documentId ?? "",
      birthDate: p.birthDate ? p.birthDate.slice(0, 10) : "",
      notes: p.notes ?? "",
      specialistId: p.specialistId ?? "",
    });
    setShowForm(true);
  }

  const updateMut = useMutation({
    mutationFn: () =>
      updatePatient(editing!.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
        documentId: form.documentId || null,
        birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null,
        notes: form.notes || null,
        specialistId: form.specialistId || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients"] });
      setEditing(null);
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePatient(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  useEffect(() => {
    const patientIdFromQuery = searchParams.get("paymentPatientId");
    if (!patientIdFromQuery) {
      if (paymentHistoryPatient) setPaymentHistoryPatient(null);
      return;
    }
    if (paymentHistoryPatient?.id === patientIdFromQuery) return;
    const target = data.find((p) => p.id === patientIdFromQuery);
    if (target) {
      setPaymentHistoryPatient(target);
      return;
    }
    if (!isLoading) {
      const next = new URLSearchParams(searchParams);
      next.delete("paymentPatientId");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, data, isLoading, paymentHistoryPatient, setSearchParams]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pacientes</h1>
        <p className="text-slate-600">Los pacientes no tienen cuenta; solo datos de contacto.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Buscar…"
          className="max-w-md flex-1 rounded-lg border border-slate-300 px-3 py-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isAdmin && (
          <select
            className="min-w-64 rounded-lg border border-slate-300 px-3 py-2"
            value={specialistFilter}
            onChange={(e) => setSpecialistFilter(e.target.value)}
          >
            <option value="">Todos los especialistas</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)} - {s.specialty}
              </option>
            ))}
          </select>
        )}
        <select
          className="min-w-52 rounded-lg border border-slate-300 px-3 py-2"
          value={debtFilter}
          onChange={(e) => setDebtFilter(e.target.value as "all" | "debt" | "no_debt")}
        >
          <option value="all">Todos</option>
          <option value="debt">Solo con pagos pendientes</option>
          <option value="no_debt">Solo sin pagos pendientes</option>
        </select>
        <button
          type="button"
          className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setShowForm(true);
          }}
        >
          Agregar paciente
        </button>
      </div>
      {isLoadingDebtIndex && (
        <p className="text-xs text-slate-500">Actualizando estado de pagos de pacientes…</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sky-100 text-slate-700">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Especialista asignado</th>
              <th className="px-4 py-3">Deuda</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading &&
              filteredPatients.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {patientNameUpper(p.lastName, p.firstName)}
                  </td>
                  <td className="px-4 py-3">{p.email}</td>
                  <td className="px-4 py-3">{p.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {p.specialist ? `${p.specialist.lastName}, ${p.specialist.firstName}` : "Sin asignar"}
                  </td>
                  <td className="px-4 py-3">
                    {debtPatientIds.has(p.id) ? (
                      <div className="flex flex-col gap-1">
                        <span className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          Con deuda
                        </span>
                        <span className="text-xs font-semibold text-amber-900">
                          {formatMoney(debtAmountByPatientId.get(p.id) ?? 0)}
                        </span>
                      </div>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Sin deuda
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                        onClick={() => setHistoryPatient(p)}
                        title="Ver historial de turnos"
                      >
                        <span aria-hidden>🕘</span>
                        Turnos
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                        onClick={() => {
                          setPaymentHistoryPatient(p);
                          const next = new URLSearchParams(searchParams);
                          next.set("paymentPatientId", p.id);
                          setSearchParams(next, { replace: true });
                        }}
                        title="Ver estado de pagos"
                      >
                        <span aria-hidden>💳</span>
                        Pagos
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                        onClick={() => setClinicalHistoryPatient(p)}
                        title="Ver historia clínica"
                      >
                        <span aria-hidden>🩺</span>
                        Historia clínica
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                            onClick={() => startEdit(p)}
                            title="Editar paciente"
                          >
                            <span aria-hidden>✏️</span>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                            onClick={() => setPendingDeletePatientId(p.id)}
                            title="Eliminar paciente"
                          >
                            <span aria-hidden>🗑️</span>
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && filteredPatients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No hay pacientes para el filtro seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <h2 className="font-medium text-slate-800">{editing ? "Editar" : "Nuevo"} paciente</h2>
              </div>
              <div>
                <label className="text-sm text-slate-600">Nombre</label>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Apellido</label>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Correo</label>
                <input
                  required
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Teléfono</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Documento</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.documentId}
                  onChange={(e) => setForm((f) => ({ ...f, documentId: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Fecha de nacimiento</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-sm text-slate-600">Especialista</label>
                  <select
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={form.specialistId}
                    onChange={(e) => setForm((f) => ({ ...f, specialistId: e.target.value }))}
                  >
                    <option value="">Seleccionar especialista</option>
                    {specialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fullName(s)} - {s.specialty}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="text-sm text-slate-600">Notas</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {editing ? "Guardar" : "Crear"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium text-slate-800">
                Historial de turnos: {patientNameUpper(historyPatient.lastName, historyPatient.firstName)}
              </h2>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => setHistoryPatient(null)}
              >
                Cerrar
              </button>
            </div>
            {isLoadingHistory && <p className="text-sm text-slate-600">Cargando historial…</p>}
            {!isLoadingHistory && appointmentHistory.length === 0 && (
              <p className="text-sm text-slate-600">Este paciente todavía no tiene turnos.</p>
            )}
            {!isLoadingHistory && appointmentHistory.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-sky-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Especialista</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointmentHistory.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{a.appointmentDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          {a.startTime} - {a.endTime}
                        </td>
                        <td className="px-3 py-2">{a.specialist.lastName}, {a.specialist.firstName}</td>
                        <td className="px-3 py-2">{appointmentStatusLabel[a.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {paymentHistoryPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-medium text-slate-800">
                  Pagos: {patientNameUpper(paymentHistoryPatient.lastName, paymentHistoryPatient.firstName)}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Turnos totales: {paymentHistorySummary.total} · Con pagos pendientes: {paymentHistorySummary.debtCount} · Monto pendiente:{" "}
                  {formatMoney(paymentHistorySummary.debtAmount)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    paymentHistorySummary.hasDebt ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {paymentHistorySummary.hasDebt ? "Con pagos pendientes" : "Sin pagos pendientes"}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete("paymentPatientId");
                    setSearchParams(next, { replace: true });
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
            {isLoadingPaymentHistory && <p className="text-sm text-slate-600">Cargando historial de pagos…</p>}
            {!isLoadingPaymentHistory && paymentHistory.length === 0 && (
              <p className="text-sm text-slate-600">Este paciente todavía no tiene turnos.</p>
            )}
            {!isLoadingPaymentHistory && paymentHistory.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-sky-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Estado turno</th>
                      <th className="px-3 py-2">Forma de pago</th>
                      <th className="px-3 py-2">Pago realizado</th>
                      <th className="px-3 py-2">Estado pago</th>
                      <th className="px-3 py-2">Monto pendiente</th>
                      <th className="px-3 py-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((a) => {
                      const hasDebt = appointmentHasDebt(a.paymentMethod, a.status, a.paymentCompleted);
                      return (
                        <tr key={a.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{a.appointmentDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            {a.startTime} - {a.endTime}
                          </td>
                          <td className="px-3 py-2">{appointmentStatusLabel[a.status]}</td>
                          <td className="px-3 py-2">
                            {a.paymentMethod === "TRANSFER_TO_LOGOCEN"
                              ? "Transferencia a LogoCen"
                              : a.paymentMethod === "TRANSFER_TO_SPECIALIST"
                                ? "Transferencia al especialista"
                                : a.paymentMethod === "CASH_TO_LOGOCEN"
                                  ? "Efectivo a LogoCen"
                                  : "Sin definir"}
                          </td>
                          <td className="px-3 py-2">{a.paymentCompleted ? "Sí" : "No"}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                hasDebt ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {hasDebt ? "Pago pendiente" : "Pago al día"}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            {hasDebt ? formatMoney(parseMoney(a.specialist.consultationFee)) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {hasDebt ? (
                              <div className="flex items-center gap-2">
                                <select
                                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                                  value={paymentMethodByAppointmentId[a.id] ?? a.paymentMethod ?? "CASH_TO_LOGOCEN"}
                                  onChange={(e) =>
                                    setPaymentMethodByAppointmentId((prev) => ({
                                      ...prev,
                                      [a.id]: e.target.value as Exclude<Appointment["paymentMethod"], null>,
                                    }))
                                  }
                                >
                                  {Object.entries(paymentMethodLabel).map(([method, label]) => (
                                    <option key={method} value={method}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={markDebtPaidMut.isPending}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                  onClick={() => markDebtPaidMut.mutate(a)}
                                >
                                  Marcar pagado
                                </button>
                              </div>
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
      )}
      {clinicalHistoryPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium text-slate-800">
                Historia clínica: {patientNameUpper(clinicalHistoryPatient.lastName, clinicalHistoryPatient.firstName)}
              </h2>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => setClinicalHistoryPatient(null)}
              >
                Cerrar
              </button>
            </div>

            <form
              className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[180px_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!clinicalDiagnosis.trim()) return;
                createClinicalHistoryMut.mutate();
              }}
            >
              <div>
                <label className="text-sm text-slate-600">Fecha</label>
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={clinicalDate}
                  onChange={(e) => setClinicalDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Diagnóstico</label>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Ej: Lumbalgia aguda. Reposo y control en 7 días."
                  value={clinicalDiagnosis}
                  onChange={(e) => setClinicalDiagnosis(e.target.value)}
                />
              </div>
              <div className="self-end">
                <button
                  type="submit"
                  disabled={createClinicalHistoryMut.isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Agregar diagnóstico
                </button>
              </div>
            </form>

            {isLoadingClinicalHistory && <p className="text-sm text-slate-600">Cargando historia clínica…</p>}
            {!isLoadingClinicalHistory && clinicalHistory.length === 0 && (
              <p className="text-sm text-slate-600">Todavía no hay diagnósticos cargados.</p>
            )}
            {!isLoadingClinicalHistory && clinicalHistory.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-sky-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Diagnóstico</th>
                      <th className="px-3 py-2">Especialista</th>
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicalHistory.map((entry: ClinicalHistoryEntry) => (
                      <tr key={entry.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2">
                          {editingClinicalEntryId === entry.id ? (
                            <input
                              type="date"
                              className="w-full rounded-lg border border-slate-300 px-2 py-1"
                              value={editingClinicalDate}
                              onChange={(e) => setEditingClinicalDate(e.target.value)}
                            />
                          ) : (
                            entry.recordDate.slice(0, 10)
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingClinicalEntryId === entry.id ? (
                            <textarea
                              className="w-full rounded-lg border border-slate-300 px-2 py-1"
                              rows={2}
                              value={editingClinicalDiagnosis}
                              onChange={(e) => setEditingClinicalDiagnosis(e.target.value)}
                            />
                          ) : (
                            entry.diagnosis
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {entry.specialist
                            ? `${entry.specialist.lastName}, ${entry.specialist.firstName}`
                            : "No informado"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {editingClinicalEntryId === entry.id ? (
                              <>
                                <button
                                  type="button"
                                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
                                  disabled={updateClinicalHistoryMut.isPending}
                                  onClick={() => {
                                    if (!editingClinicalDiagnosis.trim()) return;
                                    updateClinicalHistoryMut.mutate({
                                      entryId: entry.id,
                                      recordDate: editingClinicalDate,
                                      diagnosis: editingClinicalDiagnosis,
                                    });
                                  }}
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                                  onClick={() => {
                                    setEditingClinicalEntryId(null);
                                    setEditingClinicalDate("");
                                    setEditingClinicalDiagnosis("");
                                  }}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100"
                                  onClick={() => {
                                    setEditingClinicalEntryId(entry.id);
                                    setEditingClinicalDate(entry.recordDate.slice(0, 10));
                                    setEditingClinicalDiagnosis(entry.diagnosis);
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100"
                                  disabled={deleteClinicalHistoryMut.isPending}
                                  onClick={() => setPendingDeleteClinicalEntryId(entry.id)}
                                >
                                  Eliminar
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingDeletePatientId)}
        title="Eliminar paciente"
        message="Esta acción eliminará el paciente de forma permanente."
        confirmLabel="Eliminar"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setPendingDeletePatientId(null)}
        onConfirm={() => {
          if (!pendingDeletePatientId) return;
          deleteMut.mutate(pendingDeletePatientId);
          setPendingDeletePatientId(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteClinicalEntryId)}
        title="Eliminar diagnóstico"
        message="Esta acción eliminará el diagnóstico de la historia clínica."
        confirmLabel="Eliminar"
        tone="danger"
        busy={deleteClinicalHistoryMut.isPending}
        onCancel={() => setPendingDeleteClinicalEntryId(null)}
        onConfirm={() => {
          if (!pendingDeleteClinicalEntryId) return;
          deleteClinicalHistoryMut.mutate(pendingDeleteClinicalEntryId);
          setPendingDeleteClinicalEntryId(null);
        }}
      />
    </div>
  );
}
