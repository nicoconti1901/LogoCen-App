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
  updatePatientClinicalHistory,
  updatePatient,
} from "../../api/endpoints";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FormFieldError, FormFieldHint, invalidFieldClass } from "../../components/FormFieldError";
import { formatPatientAgeLegend } from "../../lib/patientAge";
import {
  HINT_PATIENT_BIRTH_DATE,
  HINT_PATIENT_DOCUMENT,
  HINT_PATIENT_EMAIL,
  HINT_PATIENT_NAME,
  HINT_PATIENT_PHONE_WHATSAPP,
  HINT_PATIENT_SPECIALIST,
} from "../../lib/fieldHints";
import { PatientAppointmentHistoryModal } from "../../components/PatientAppointmentHistoryModal";
import { PatientDirectoryList, PatientDirectoryToolbar } from "../../components/PatientDirectoryList";
import { PatientPaymentHistoryModal } from "../../components/PatientPaymentHistoryModal";
import { useAuth } from "../../contexts/AuthContext";
import type { ClinicalHistoryEntry, Patient, Specialist } from "../../types";
import { appointmentDebtAmountArs, appointmentHasDebt } from "../../lib/appointmentDebt";
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
} from "../../lib/directoryTableStyles";
import { formatPersonDisplayLastFirst, formatPersonDisplayLastFirstUpper } from "../../lib/personName";
import {
  type ClinicalHistoryFields,
  type FieldErrors,
  type PatientFormFields,
  validateClinicalHistoryForm,
  validatePatientForm,
} from "../../lib/validation";

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
  return formatPersonDisplayLastFirst(s.lastName, s.firstName);
}

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
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [clinicalHistoryPatient, setClinicalHistoryPatient] = useState<Patient | null>(null);
  const [clinicalDate, setClinicalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clinicalDiagnosis, setClinicalDiagnosis] = useState("");
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
      if (appointmentHasDebt(a)) ids.add(a.patientId);
    }
    return ids;
  }, [debtIndexAppointments]);
  const debtAmountByPatientId = useMemo(() => {
    const amountMap = new Map<string, number>();
    for (const a of debtIndexAppointments) {
      if (!appointmentHasDebt(a)) continue;
      const current = amountMap.get(a.patientId) ?? 0;
      amountMap.set(a.patientId, current + appointmentDebtAmountArs(a));
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

  const paymentPatientId = searchParams.get("paymentPatientId");
  const paymentPatientHint = useMemo(
    () => (paymentPatientId ? data.find((p) => p.id === paymentPatientId) ?? null : null),
    [data, paymentPatientId]
  );

  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<PatientFormFields>>({});
  const patientAgeLegend = useMemo(() => formatPatientAgeLegend(form.birthDate), [form.birthDate]);
  const [clinicalFieldErrors, setClinicalFieldErrors] = useState<FieldErrors<ClinicalHistoryFields>>({});
  const { data: appointmentHistoryAll = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["appointments", "patient-history", historyPatient?.id],
    queryFn: async () => {
      const appointments = await fetchAppointments({ patientId: historyPatient!.id });
      return appointments.slice().sort((a, b) => {
        const aKey = `${a.appointmentDate} ${a.startTime}`;
        const bKey = `${b.appointmentDate} ${b.startTime}`;
        return bKey.localeCompare(aKey);
      });
    },
    enabled: Boolean(historyPatient),
  });
  const appointmentHistory = useMemo(() => {
    if (historyShowAll) return appointmentHistoryAll;
    return appointmentHistoryAll.slice(0, 6);
  }, [appointmentHistoryAll, historyShowAll]);
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
        phone: form.phone.trim(),
        documentId: form.documentId || null,
        birthDate: form.birthDate || null,
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
        phone: form.phone.trim(),
        documentId: form.documentId || null,
        birthDate: form.birthDate || null,
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const validation = validatePatientForm(form, { requireSpecialist: isAdmin });
    if (!validation.ok) {
      setFieldErrors(validation.fields);
      return;
    }
    setFieldErrors({});
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  useEffect(() => {
    const id = searchParams.get("paymentPatientId");
    if (!id) return;
    if (isLoading) return;
    if (!data.some((p) => p.id === id)) {
      const next = new URLSearchParams(searchParams);
      next.delete("paymentPatientId");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, data, isLoading, setSearchParams]);

  return (
    <div className="space-y-4">
      <PatientDirectoryToolbar
        search={search}
        onSearchChange={setSearch}
        specialistFilter={specialistFilter}
        onSpecialistFilterChange={setSpecialistFilter}
        debtFilter={debtFilter}
        onDebtFilterChange={setDebtFilter}
        specialists={specialists}
        isAdmin={isAdmin}
        isLoadingDebtIndex={isLoadingDebtIndex}
        patientCount={data.length}
        filteredCount={filteredPatients.length}
        onAddPatient={() => {
          setEditing(null);
          setForm(emptyForm);
          setShowForm(true);
        }}
      />

      <PatientDirectoryList
        patients={filteredPatients}
        isLoading={isLoading}
        isAdmin={isAdmin}
        debtPatientIds={debtPatientIds}
        debtAmountByPatientId={debtAmountByPatientId}
        onOpenAppointments={(p) => {
          setHistoryShowAll(false);
          setHistoryPatient(p);
        }}
        onOpenPayments={(p) => {
          const next = new URLSearchParams(searchParams);
          next.set("paymentPatientId", p.id);
          setSearchParams(next, { replace: true });
        }}
        onOpenClinicalHistory={setClinicalHistoryPatient}
        onEdit={isAdmin ? startEdit : undefined}
        onDelete={isAdmin ? setPendingDeletePatientId : undefined}
      />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4 shadow-xl ring-1 ring-slate-900/5 sm:p-5">
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <h2 className="font-medium text-slate-800">{editing ? "Editar" : "Nuevo"} paciente</h2>
              </div>
              <div>
                <label className="text-sm text-slate-600">Nombre</label>
                <input
                  required
                  className={invalidFieldClass(Boolean(fieldErrors.firstName), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={form.firstName}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, firstName: e.target.value }));
                    if (fieldErrors.firstName) setFieldErrors((prev) => ({ ...prev, firstName: undefined }));
                  }}
                />
                <FormFieldHint>{HINT_PATIENT_NAME}</FormFieldHint>
                <FormFieldError message={fieldErrors.firstName} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Apellido</label>
                <input
                  required
                  className={invalidFieldClass(Boolean(fieldErrors.lastName), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={form.lastName}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, lastName: e.target.value }));
                    if (fieldErrors.lastName) setFieldErrors((prev) => ({ ...prev, lastName: undefined }));
                  }}
                />
                <FormFieldHint>{HINT_PATIENT_NAME}</FormFieldHint>
                <FormFieldError message={fieldErrors.lastName} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Correo</label>
                <input
                  required
                  type="email"
                  className={invalidFieldClass(Boolean(fieldErrors.email), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={form.email}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, email: e.target.value }));
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                />
                <FormFieldHint>{HINT_PATIENT_EMAIL}</FormFieldHint>
                <FormFieldError message={fieldErrors.email} />
              </div>
              <div>
                <label className="text-sm text-slate-600">
                  Celular <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Ej. 11 4021-5890 o 291 4021589"
                  maxLength={24}
                  className={invalidFieldClass(Boolean(fieldErrors.phone), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={form.phone}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, phone: e.target.value }));
                    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                />
                <FormFieldHint>{HINT_PATIENT_PHONE_WHATSAPP}</FormFieldHint>
                <FormFieldError message={fieldErrors.phone} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Documento</label>
                <input
                  placeholder="DNI o pasaporte"
                  maxLength={20}
                  className={invalidFieldClass(Boolean(fieldErrors.documentId), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={form.documentId}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, documentId: e.target.value }));
                    if (fieldErrors.documentId) setFieldErrors((prev) => ({ ...prev, documentId: undefined }));
                  }}
                />
                <FormFieldHint>{HINT_PATIENT_DOCUMENT}</FormFieldHint>
                <FormFieldError message={fieldErrors.documentId} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Fecha de nacimiento</label>
                <input
                  type="date"
                  className={invalidFieldClass(Boolean(fieldErrors.birthDate), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={form.birthDate}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, birthDate: e.target.value }));
                    if (fieldErrors.birthDate) setFieldErrors((prev) => ({ ...prev, birthDate: undefined }));
                  }}
                />
                <FormFieldHint>{HINT_PATIENT_BIRTH_DATE}</FormFieldHint>
                {patientAgeLegend ? (
                  <p className="mt-1 text-xs font-medium text-sky-800">{patientAgeLegend}</p>
                ) : null}
                <FormFieldError message={fieldErrors.birthDate} />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-sm text-slate-600">Especialista</label>
                  <select
                    required
                    className={invalidFieldClass(Boolean(fieldErrors.specialistId), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                    value={form.specialistId}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, specialistId: e.target.value }));
                      if (fieldErrors.specialistId) setFieldErrors((prev) => ({ ...prev, specialistId: undefined }));
                    }}
                  >
                    <option value="">Seleccionar especialista</option>
                    {specialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fullName(s)} - {s.specialty}
                      </option>
                    ))}
                  </select>
                  <FormFieldHint>{HINT_PATIENT_SPECIALIST}</FormFieldHint>
                  <FormFieldError message={fieldErrors.specialistId} />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="text-sm text-slate-600">Notas</label>
                <textarea
                  className={invalidFieldClass(Boolean(fieldErrors.notes), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  rows={2}
                  maxLength={2000}
                  value={form.notes}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notes: e.target.value }));
                    if (fieldErrors.notes) setFieldErrors((prev) => ({ ...prev, notes: undefined }));
                  }}
                />
                <FormFieldError message={fieldErrors.notes} />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-brand-900/20 transition hover:bg-brand-800 active:translate-y-px disabled:opacity-50"
                >
                  {editing ? "Guardar" : "Crear"}
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 active:translate-y-px"
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

      <PatientAppointmentHistoryModal
        patient={historyPatient}
        appointments={appointmentHistory}
        totalCount={appointmentHistoryAll.length}
        showAll={historyShowAll}
        onShowAllChange={setHistoryShowAll}
        isLoading={isLoadingHistory}
        onClose={() => {
          setHistoryPatient(null);
          setHistoryShowAll(false);
        }}
      />
      <PatientPaymentHistoryModal
        patientId={paymentPatientId}
        patientHint={paymentPatientHint}
        onClose={() => {
          const next = new URLSearchParams(searchParams);
          next.delete("paymentPatientId");
          setSearchParams(next, { replace: true });
        }}
      />
      {clinicalHistoryPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-sky-200/90 bg-white shadow-xl ring-1 ring-slate-900/5">
            <div className="shrink-0 border-b border-sky-200/80 bg-gradient-to-r from-emerald-50/60 via-sky-50/80 to-white px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  Historia clínica:{" "}
                  {formatPersonDisplayLastFirstUpper(clinicalHistoryPatient.lastName, clinicalHistoryPatient.firstName)}
                </h2>
                <button
                  type="button"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:translate-y-px"
                  onClick={() => setClinicalHistoryPatient(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:pb-5">
            <form
              className="mb-4 grid gap-3 rounded-xl border border-sky-200/80 bg-sky-50/40 p-3 ring-1 ring-slate-200/50 sm:grid-cols-[180px_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                const validation = validateClinicalHistoryForm({
                  recordDate: clinicalDate,
                  diagnosis: clinicalDiagnosis,
                });
                if (!validation.ok) {
                  setClinicalFieldErrors(validation.fields);
                  return;
                }
                setClinicalFieldErrors({});
                createClinicalHistoryMut.mutate();
              }}
            >
              <div>
                <label className="text-sm text-slate-600">Fecha</label>
                <input
                  type="date"
                  required
                  className={invalidFieldClass(Boolean(clinicalFieldErrors.recordDate), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  value={clinicalDate}
                  onChange={(e) => {
                    setClinicalDate(e.target.value);
                    if (clinicalFieldErrors.recordDate) {
                      setClinicalFieldErrors((prev) => ({ ...prev, recordDate: undefined }));
                    }
                  }}
                />
                <FormFieldError message={clinicalFieldErrors.recordDate} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Diagnóstico</label>
                <input
                  required
                  className={invalidFieldClass(Boolean(clinicalFieldErrors.diagnosis), "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2")}
                  placeholder="Ej: Lumbalgia aguda. Reposo y control en 7 días."
                  value={clinicalDiagnosis}
                  onChange={(e) => {
                    setClinicalDiagnosis(e.target.value);
                    if (clinicalFieldErrors.diagnosis) {
                      setClinicalFieldErrors((prev) => ({ ...prev, diagnosis: undefined }));
                    }
                  }}
                />
                <FormFieldError message={clinicalFieldErrors.diagnosis} />
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
              <div className={DIRECTORY_TABLE_WRAPPER}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead className={DIRECTORY_TABLE_HEAD}>
                      <tr className={DIRECTORY_TABLE_HEAD_ROW}>
                        <th className={`${DIRECTORY_TABLE_TH} w-[130px] pl-4`}>Fecha</th>
                        <th className={DIRECTORY_TABLE_TH}>Diagnóstico</th>
                        <th className={`${DIRECTORY_TABLE_TH} w-[180px]`}>Especialista</th>
                        <th className={`${DIRECTORY_TABLE_TH} pr-4 text-right`}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clinicalHistory.map((entry: ClinicalHistoryEntry, index) => (
                        <tr
                          key={entry.id}
                          className={`${DIRECTORY_TABLE_ROW_HOVER} align-top ${directoryRowBg(index)}`}
                        >
                          <td
                            className={`${DIRECTORY_TABLE_TD} border-l-4 pl-3 font-medium tabular-nums text-slate-800 ${directoryRowAccent(entry.id)}`}
                          >
                            {editingClinicalEntryId === entry.id ? (
                              <input
                                type="date"
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm"
                                value={editingClinicalDate}
                                onChange={(e) => setEditingClinicalDate(e.target.value)}
                              />
                            ) : (
                              entry.recordDate.slice(0, 10)
                            )}
                          </td>
                          <td className={DIRECTORY_TABLE_TD}>
                            {editingClinicalEntryId === entry.id ? (
                              <textarea
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm"
                                rows={3}
                                value={editingClinicalDiagnosis}
                                onChange={(e) => setEditingClinicalDiagnosis(e.target.value)}
                              />
                            ) : (
                              <div className={DIRECTORY_CELL_CARD}>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{entry.diagnosis}</p>
                              </div>
                            )}
                          </td>
                          <td className={DIRECTORY_TABLE_TD}>
                            {entry.specialist ? (
                              <div className={DIRECTORY_CELL_CARD}>
                                <p className="font-medium text-slate-800">
                                  {formatPersonDisplayLastFirst(entry.specialist.lastName, entry.specialist.firstName)}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">{entry.specialist.specialty}</p>
                              </div>
                            ) : (
                              <span className="inline-flex rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
                                No informado
                              </span>
                            )}
                          </td>
                          <td className={`${DIRECTORY_TABLE_TD} ${DIRECTORY_ACTIONS_CELL} pr-4`}>
                            <div className={DIRECTORY_ACTIONS_BAR}>
                              {editingClinicalEntryId === entry.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-sky-800/20 hover:bg-sky-700 disabled:opacity-50"
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
                                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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
                                    className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200/80 hover:bg-sky-100"
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
                                    className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80 hover:bg-rose-100 disabled:opacity-50"
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
              </div>
            )}
            </div>
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
