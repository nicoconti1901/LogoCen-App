import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPatient, deletePatient, fetchPatients, updatePatient } from "../../api/endpoints";
import type { Patient } from "../../types";

export function AdminPatientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["patients", search],
    queryFn: () => fetchPatients(search || undefined),
  });

  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    documentId: "",
    birthDate: "",
    notes: "",
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
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients"] });
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        documentId: "",
        birthDate: "",
        notes: "",
      });
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
    });
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
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patients"] });
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePatient(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pacientes</h1>
        <p className="text-slate-600">Los pacientes no tienen cuenta; solo datos de contacto.</p>
      </div>

      <div className="flex gap-2">
        <input
          placeholder="Buscar…"
          className="max-w-md flex-1 rounded-lg border border-slate-300 px-3 py-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
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
          {editing && (
            <button type="button" className="rounded-lg border border-slate-200 px-4 py-2" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading &&
              data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {p.lastName}, {p.firstName}
                  </td>
                  <td className="px-4 py-3">{p.email}</td>
                  <td className="px-4 py-3">{p.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" className="text-brand-700 hover:underline" onClick={() => startEdit(p)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-red-700 hover:underline"
                        onClick={() => {
                          if (confirm("¿Eliminar paciente?")) deleteMut.mutate(p.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
