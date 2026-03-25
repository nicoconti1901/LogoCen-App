import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSpecialist,
  deleteSpecialist,
  fetchSpecialists,
  updateSpecialist,
} from "../../api/endpoints";
import type { Specialist } from "../../types";

export function AdminSpecialistsPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["specialists", "admin"],
    queryFn: () => fetchSpecialists(true),
  });

  const [editing, setEditing] = useState<Specialist | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    specialty: "",
    licenseNumber: "",
    phone: "",
  });

  const createMut = useMutation({
    mutationFn: () =>
      createSpecialist({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        specialty: form.specialty,
        licenseNumber: form.licenseNumber || null,
        phone: form.phone || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      setForm({
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        specialty: "",
        licenseNumber: "",
        phone: "",
      });
    },
  });

  function startEdit(s: Specialist) {
    setEditing(s);
    setForm({
      email: s.user.email,
      password: "",
      firstName: s.firstName,
      lastName: s.lastName,
      specialty: s.specialty,
      licenseNumber: s.licenseNumber ?? "",
      phone: s.phone ?? "",
    });
  }

  const updateMut = useMutation({
    mutationFn: () =>
      updateSpecialist(editing!.id, {
        email: form.email,
        ...(form.password ? { password: form.password } : {}),
        firstName: form.firstName,
        lastName: form.lastName,
        specialty: form.specialty,
        licenseNumber: form.licenseNumber || null,
        phone: form.phone || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      setEditing(null);
    },
  });

  const toggleMut = useMutation({
    mutationFn: (s: Specialist) => updateSpecialist(s.id, { active: !s.active }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["specialists"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSpecialist(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["specialists"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Especialistas</h1>
        <p className="text-slate-600">Crear cuentas de médicos (rol especialista).</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="sm:col-span-2 lg:col-span-3">
          <h2 className="font-medium text-slate-800">{editing ? "Editar" : "Nuevo"} especialista</h2>
        </div>
        <div>
          <label className="text-sm text-slate-600">Correo</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm text-slate-600">
            Contraseña {editing && "(opcional)"}
          </label>
          <input
            type="password"
            required={!editing}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
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
          <label className="text-sm text-slate-600">Especialidad</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.specialty}
            onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm text-slate-600">Matrícula</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.licenseNumber}
            onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
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
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={createMut.isPending || updateMut.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {editing ? "Guardar" : "Crear"}
          </button>
          {editing && (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2"
              onClick={() => setEditing(null)}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Especialidad</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading &&
              data.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {s.lastName}, {s.firstName}
                  </td>
                  <td className="px-4 py-3">{s.specialty}</td>
                  <td className="px-4 py-3">{s.user.email}</td>
                  <td className="px-4 py-3">{s.active ? "Sí" : "No"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-brand-700 hover:underline"
                        onClick={() => startEdit(s)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-slate-600 hover:underline"
                        onClick={() => toggleMut.mutate(s)}
                      >
                        {s.active ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className="text-red-700 hover:underline"
                        onClick={() => {
                          if (confirm("¿Eliminar especialista y su usuario?")) deleteMut.mutate(s.id);
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
