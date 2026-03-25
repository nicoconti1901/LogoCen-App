import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createOffice, deleteOffice, fetchOffices, updateOffice } from "../../api/endpoints";
import type { Office } from "../../types";

export function AdminOfficesPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["offices"], queryFn: fetchOffices });

  const [editing, setEditing] = useState<Office | null>(null);
  const [form, setForm] = useState({ name: "", number: "" });

  const createMut = useMutation({
    mutationFn: () => createOffice({ name: form.name, number: form.number || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["offices"] });
      setForm({ name: "", number: "" });
    },
  });

  function startEdit(o: Office) {
    setEditing(o);
    setForm({ name: o.name, number: o.number ?? "" });
  }

  const updateMut = useMutation({
    mutationFn: () => updateOffice(editing!.id, { name: form.name, number: form.number || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["offices"] });
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOffice(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["offices"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Consultorios</h1>
        <p className="text-slate-600">Salas u oficinas donde se atienden las citas.</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="min-w-[200px] flex-1">
          <label className="text-sm text-slate-600">Nombre</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="w-32">
          <label className="text-sm text-slate-600">Número</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.number}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          />
        </div>
        <button
          type="submit"
          disabled={createMut.isPending || updateMut.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {editing ? "Guardar" : "Añadir"}
        </button>
        {editing && (
          <button type="button" className="rounded-lg border border-slate-200 px-4 py-2" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading &&
              data.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{o.name}</td>
                  <td className="px-4 py-3">{o.number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" className="text-brand-700 hover:underline" onClick={() => startEdit(o)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-red-700 hover:underline"
                        onClick={() => {
                          if (confirm("¿Eliminar consultorio?")) deleteMut.mutate(o.id);
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
