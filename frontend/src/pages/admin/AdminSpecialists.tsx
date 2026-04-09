import axios from "axios";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSpecialist,
  deleteSpecialist,
  fetchSpecialists,
  updateSpecialist,
} from "../../api/endpoints";
import { imageSrcCandidates, normalizeProfilePhotoUrlForStorage } from "../../lib/imageUrl";
import type { Specialist } from "../../types";

const emptyForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  specialty: "",
  profilePhotoUrl: "",
  licenseNumber: "",
  phone: "",
};

function SpecialistAvatar({ specialist }: { specialist: Specialist }) {
  const [broken, setBroken] = useState(false);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const url = specialist.profilePhotoUrl?.trim();

  useEffect(() => {
    setBroken(false);
    setCandidateIdx(0);
  }, [url]);

  const candidates = url ? imageSrcCandidates(url) : [];
  if (url && candidates.length > 0 && !broken) {
    const src = candidates[Math.min(candidateIdx, candidates.length - 1)]!;
    return (
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover object-center"
        onError={() => {
          if (candidateIdx < candidates.length - 1) {
            setCandidateIdx((i) => i + 1);
          } else {
            setBroken(true);
          }
        }}
      />
    );
  }
  const initials = `${specialist.firstName[0] ?? ""}${specialist.lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-black text-base font-bold tracking-tight text-teal-400">
      {initials || "?"}
    </div>
  );
}

type SpecialistCardProps = {
  specialist: Specialist;
  /** fluid = ocupa el ancho de la celda (grilla pocos ítems); compact = ancho fijo en carrusel scroll */
  size: "fluid" | "compact";
  onEdit: () => void;
};

function SpecialistCard({ specialist: s, size, onEdit }: SpecialistCardProps) {
  const widthClass =
    size === "fluid"
      ? "w-full"
      : "w-full min-w-[260px] max-w-[300px] shrink-0 snap-center";

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-teal-500/80 bg-black shadow-[0_0_0_1px_rgba(20,184,166,0.15)] transition duration-300 hover:border-teal-400 hover:shadow-[0_20px_50px_-12px_rgba(20,184,166,0.25)] ${widthClass}`}
    >
      {/* Forma orgánica teal (referencia) */}
      <div
        className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-[42%] bg-teal-500 opacity-95 blur-[0.5px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-12 -top-8 h-40 w-44 rotate-12 rounded-[50%] bg-teal-400/30"
        aria-hidden
      />

      {!s.active && (
        <span className="absolute right-3 top-3 z-20 rounded-full border border-zinc-700 bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          Inactivo
        </span>
      )}

      <div className="relative z-10 flex flex-col items-center px-5 pb-6 pt-10">
        <div className="relative mb-5 h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-full border-2 border-black bg-zinc-900 shadow-[0_8px_30px_rgba(0,0,0,0.5)] ring-2 ring-teal-500/40">
          <SpecialistAvatar specialist={s} />
        </div>

        <h2 className="text-center text-xl font-bold tracking-tight text-white">
          {s.lastName}, {s.firstName}
        </h2>
        <p className="mt-2 w-full max-w-[min(100%,280px)] text-center text-sm leading-snug text-zinc-400 sm:max-w-none">
          {s.specialty}
        </p>

        {/* Estrellas decorativas (sin dato de rating en el sistema) */}
        <div className="mt-3 flex gap-0.5 text-teal-500" aria-hidden>
          {"★★★★★".split("").map((ch, i) => (
            <span key={i} className="text-lg leading-none">
              {ch}
            </span>
          ))}
        </div>

        <p className="mt-3 max-w-full truncate px-1 text-center font-mono text-[10px] text-zinc-500" title={s.user.email}>
          {s.user.email}
        </p>

        <div className="mt-7 flex w-full gap-2.5">
          <Link
            to={`/specialists/${s.id}/agenda`}
            className="flex-1 rounded-full bg-teal-500 py-2.5 text-center text-sm font-bold text-black transition hover:bg-teal-400 active:scale-[0.98]"
          >
            Ver agenda
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-full bg-teal-500 py-2.5 text-sm font-bold text-black transition hover:bg-teal-400 active:scale-[0.98]"
          >
            Editar
          </button>
        </div>
      </div>
    </article>
  );
}

type FormModalProps = {
  open: boolean;
  title: string;
  editing: Specialist | null;
  onClose: () => void;
};

function parseApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : "Error inesperado";
  }
  const data = err.response?.data;
  if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
    const msg = (data as { message: string }).message;
    const issues = (data as { issues?: Record<string, string[] | undefined> }).issues;
    if (issues && typeof issues === "object") {
      const first = Object.values(issues)
        .flat()
        .find((x) => typeof x === "string" && x.length > 0);
      if (first) return `${msg}: ${first}`;
    }
    return msg;
  }
  return err.message || "No se pudo conectar con el servidor";
}

function SpecialistFormModal({ open, title, editing, onClose }: FormModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (!editing) {
      setForm(emptyForm);
      return;
    }
    setForm({
      email: editing.user.email,
      password: "",
      firstName: editing.firstName,
      lastName: editing.lastName,
      specialty: editing.specialty,
      profilePhotoUrl: editing.profilePhotoUrl ?? "",
      licenseNumber: editing.licenseNumber ?? "",
      phone: editing.phone ?? "",
    });
  }, [open, editing]);

  const createMut = useMutation({
    mutationFn: () =>
      createSpecialist({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        specialty: form.specialty,
        profilePhotoUrl: normalizeProfilePhotoUrlForStorage(form.profilePhotoUrl),
        licenseNumber: form.licenseNumber || null,
        phone: form.phone || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      onClose();
      setForm(emptyForm);
    },
    onError: (err) => setFormError(parseApiError(err)),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateSpecialist(editing!.id, {
        email: form.email,
        ...(form.password ? { password: form.password } : {}),
        firstName: form.firstName,
        lastName: form.lastName,
        specialty: form.specialty,
        profilePhotoUrl: normalizeProfilePhotoUrlForStorage(form.profilePhotoUrl),
        licenseNumber: form.licenseNumber || null,
        phone: form.phone || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      await qc.invalidateQueries({ queryKey: ["specialist"] });
      onClose();
    },
    onError: (err) => setFormError(parseApiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSpecialist(editing!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      onClose();
    },
    onError: (err) => setFormError(parseApiError(err)),
  });

  if (!open) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/20 bg-white/95 p-6 shadow-[0_24px_80px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <h2 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-xl font-bold tracking-tight text-transparent">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-5 grid gap-3 sm:grid-cols-2">
          {formError && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2"
              role="alert"
            >
              {formError}
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-600">URL de foto de perfil</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="https://…"
              value={form.profilePhotoUrl}
              onChange={(e) => setForm((f) => ({ ...f, profilePhotoUrl: e.target.value }))}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Imagen por URL (HTTPS). Google Drive: usá el enlace de compartir; lo convertimos para que se vea en la tarjeta. El archivo debe estar como{" "}
              <strong className="font-medium text-slate-700">Cualquier persona con el enlace</strong> (lector).
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-600">Correo</label>
            <input
              required
              type="email"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-600">Contraseña {editing && "(opcional)"}</label>
            <input
              type="password"
              required={!editing}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Nombre</label>
            <input
              required
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Apellido</label>
            <input
              required
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-600">Especialidad</label>
            <input
              required
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.specialty}
              onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Matrícula</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.licenseNumber}
              onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Teléfono</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-gradient-to-r from-brand-600 to-sky-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-brand-500/25 transition hover:brightness-105 disabled:opacity-50"
            >
              {editing ? "Guardar" : "Crear especialista"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            {editing && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("¿Eliminar este especialista y su usuario?")) deleteMut.mutate();
                }}
                className="rounded-xl border border-red-200 bg-red-50/80 px-5 py-2.5 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminSpecialistsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["specialists", "admin"],
    queryFn: () => fetchSpecialists(true),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Specialist | null>(null);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(s: Specialist) {
    setEditing(s);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  const count = data.length;
  /** A partir de 5 tarjetas: carrusel horizontal; 1–4: rejilla que usa casi todo el ancho */
  const useScrollCarousel = count > 4;
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollCards(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.min(el.clientWidth * 0.85, 340);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  function gridClass(n: number): string {
    if (n <= 1) return "max-w-md grid-cols-1 mx-auto";
    if (n === 2) return "grid-cols-1 sm:grid-cols-2";
    if (n === 3) return "grid-cols-1 sm:grid-cols-3";
    if (n === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    return "";
  }

  return (
    <div className="space-y-8">
      {/* Bloque oscuro: mismo lenguaje visual que la referencia */}
      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-black px-4 py-8 shadow-2xl sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Especialistas</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
              Equipo médico en un vistazo. Abrí la agenda de cada profesional o sumá nuevos perfiles.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-teal-500 px-7 py-3 text-sm font-bold text-black shadow-[0_0_24px_rgba(20,184,166,0.35)] transition hover:bg-teal-400 active:scale-[0.98]"
          >
            Agregar especialista
          </button>
        </div>

        {isLoading && (
          <div className="mt-10 flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 px-5 py-4 text-zinc-400">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Cargando equipo…
          </div>
        )}

        {!isLoading && data.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-zinc-700 bg-zinc-950/50 px-8 py-16 text-center">
            <p className="text-sm font-medium text-zinc-300 sm:text-base">No hay especialistas todavía.</p>
            <p className="mt-2 text-sm text-zinc-500">Creá el primero con el botón de arriba.</p>
          </div>
        )}

        {!isLoading && data.length > 0 && (
          <div className="relative mt-10">
            {useScrollCarousel && count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => scrollCards(-1)}
                  className="absolute left-0 top-1/2 z-10 hidden -translate-x-1 -translate-y-1/2 rounded-full border border-teal-500/50 bg-black/80 p-2.5 text-teal-400 shadow-lg backdrop-blur-sm transition hover:bg-teal-500/20 md:flex"
                  aria-label="Anterior"
                >
                  <span className="text-xl leading-none">‹</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollCards(1)}
                  className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 translate-x-1 rounded-full border border-teal-500/50 bg-black/80 p-2.5 text-teal-400 shadow-lg backdrop-blur-sm transition hover:bg-teal-500/20 md:flex"
                  aria-label="Siguiente"
                >
                  <span className="text-xl leading-none">›</span>
                </button>
              </>
            )}

            {useScrollCarousel ? (
              <div
                ref={scrollRef}
                className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-8"
              >
                {data.map((s) => (
                  <SpecialistCard key={s.id} specialist={s} size="compact" onEdit={() => openEdit(s)} />
                ))}
              </div>
            ) : (
              <div
                className={`grid w-full gap-6 px-4 sm:px-6 md:px-8 ${gridClass(count)}`}
              >
                {data.map((s) => (
                  <SpecialistCard key={s.id} specialist={s} size="fluid" onEdit={() => openEdit(s)} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <SpecialistFormModal
        open={modalOpen}
        title={editing ? "Editar especialista" : "Nuevo especialista"}
        editing={editing}
        onClose={closeModal}
      />
    </div>
  );
}
