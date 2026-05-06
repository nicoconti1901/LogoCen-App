import axios from "axios";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSpecialist,
  deleteSpecialist,
  fetchSpecialists,
  uploadSpecialistProfilePhoto,
  updateSpecialist,
} from "../../api/endpoints";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAuth } from "../../contexts/AuthContext";
import { imageSrcCandidates, normalizeProfilePhotoUrlForStorage } from "../../lib/imageUrl";
import type { Specialist } from "../../types";

const emptyForm = {
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  specialty: "",
  profilePhotoUrl: "",
  licenseNumber: "",
  phone: "",
  consultationFee: "",
  transferAlias: "",
  availabilities: [] as Array<{
    weekday: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
    startTime: string;
    endTime: string;
  }>,
};

const weekdayOptions = [
  { value: "MONDAY", label: "Lunes" },
  { value: "TUESDAY", label: "Martes" },
  { value: "WEDNESDAY", label: "Miércoles" },
  { value: "THURSDAY", label: "Jueves" },
  { value: "FRIDAY", label: "Viernes" },
  { value: "SATURDAY", label: "Sábado" },
  { value: "SUNDAY", label: "Domingo" },
] as const;

const weekdayLabel: Record<
  "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY",
  string
> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

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

function specialtyBadge(specialty: string): { icon: string; label: string } {
  const normalized = specialty.toLowerCase();
  if (normalized.includes("kinesi")) return { icon: "🦴", label: "Kinesiología" };
  if (normalized.includes("cardio")) return { icon: "❤️", label: "Cardiología" };
  if (normalized.includes("pedia")) return { icon: "🧒", label: "Pediatría" };
  if (normalized.includes("nutri")) return { icon: "🥗", label: "Nutrición" };
  if (normalized.includes("psico")) return { icon: "🧠", label: "Psicología" };
  if (normalized.includes("derma")) return { icon: "🧴", label: "Dermatología" };
  if (normalized.includes("odonto")) return { icon: "🦷", label: "Odontología" };
  if (normalized.includes("trauma")) return { icon: "🦵", label: "Traumatología" };
  return { icon: "🩺", label: specialty };
}

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
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-blue-50 text-base font-bold tracking-tight text-sky-800">
      {initials || "?"}
    </div>
  );
}

type SpecialistCardProps = {
  specialist: Specialist;
  /** fluid = ocupa el ancho de la celda (grilla pocos ítems); compact = ancho fijo en carrusel scroll */
  size: "fluid" | "compact";
  canEdit: boolean;
  canViewAgenda: boolean;
  canViewFinancialData: boolean;
  onEdit: () => void;
};

const cardVariants = [
  {
    frame: "border-sky-200 hover:border-sky-300",
    topAccent: "from-sky-600 via-blue-600 to-indigo-600",
    bubble: "bg-sky-100/70",
    ring: "ring-sky-200",
  },
  {
    frame: "border-cyan-200 hover:border-cyan-300",
    topAccent: "from-cyan-600 via-teal-600 to-sky-600",
    bubble: "bg-cyan-100/70",
    ring: "ring-cyan-200",
  },
  {
    frame: "border-violet-200 hover:border-violet-300",
    topAccent: "from-violet-600 via-indigo-600 to-blue-600",
    bubble: "bg-violet-100/70",
    ring: "ring-violet-200",
  },
  {
    frame: "border-fuchsia-200 hover:border-fuchsia-300",
    topAccent: "from-fuchsia-600 via-pink-600 to-rose-600",
    bubble: "bg-fuchsia-100/70",
    ring: "ring-fuchsia-200",
  },
] as const;

function variantIndexFromSpecialist(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % cardVariants.length;
}

function SpecialistCard({ specialist: s, size, canEdit, canViewAgenda, canViewFinancialData, onEdit }: SpecialistCardProps) {
  const widthClass =
    size === "fluid"
      ? "w-full"
      : "w-full min-w-[260px] max-w-[300px] shrink-0 snap-center";
  const variant = cardVariants[variantIndexFromSpecialist(s.id)]!;

  const availabilityText = s.availabilities.length
    ? s.availabilities.map((a) => `${weekdayLabel[a.weekday]} ${a.startTime}-${a.endTime}`).join(" · ")
    : "Sin disponibilidad cargada";
  const specialtyTag = specialtyBadge(s.specialty);
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[1.35rem] border bg-white shadow-[0_10px_28px_-18px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(3,105,161,0.35)] ${variant.frame} ${widthClass}`}
    >
      {/* Acento superior institucional */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r opacity-90 ${variant.topAccent}`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute -left-8 top-8 h-28 w-28 rounded-full ${variant.bubble}`}
        aria-hidden
      />

      {!s.active && (
        <span className="absolute right-3 top-3 z-20 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          Inactivo
        </span>
      )}

      <div className="relative z-10 flex flex-col items-center px-5 pb-6 pt-10">
        <div className={`relative mb-5 h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-[0_10px_24px_-10px_rgba(3,105,161,0.55)] ring-2 ${variant.ring}`}>
          <SpecialistAvatar specialist={s} />
        </div>

        <h2 className="text-center text-xl font-bold tracking-tight text-slate-900">
          {s.lastName}, {s.firstName}
        </h2>
        <p className="mt-2 w-full max-w-[min(100%,280px)] text-center text-sm leading-snug text-slate-600 sm:max-w-none">
          {s.specialty}
        </p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          <span aria-hidden>{specialtyTag.icon}</span>
          {specialtyTag.label}
        </span>

        <div className="mt-3 w-full space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left">
          <p className="text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Atiende:</span> {availabilityText}
          </p>
          {canViewFinancialData && (
            <>
              <p className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Valor consulta:</span>{" "}
                {formatArsAmount(s.consultationFee) ?? "No configurado"}
              </p>
              <p className="truncate text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Alias:</span> {s.transferAlias || "No configurado"}
              </p>
            </>
          )}
        </div>

        <div className="mt-7 flex w-full gap-2.5">
          {canViewAgenda && (
            <Link
              to={`/specialists/${s.id}/agenda`}
              className="flex-1 rounded-full bg-sky-600 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-[0.98]"
            >
              Ver agenda
            </Link>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 rounded-full border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              Editar
            </button>
          )}
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
  canDelete: boolean;
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

function SpecialistFormModal({ open, title, editing, onClose, canDelete }: FormModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      confirmPassword: "",
      firstName: editing.firstName,
      lastName: editing.lastName,
      specialty: editing.specialty,
      profilePhotoUrl: editing.profilePhotoUrl ?? "",
      licenseNumber: editing.licenseNumber ?? "",
      phone: editing.phone ?? "",
      consultationFee: editing.consultationFee ?? "",
      transferAlias: editing.transferAlias ?? "",
      availabilities: editing.availabilities.map((a) => ({
        weekday: a.weekday,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
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
        consultationFee: form.consultationFee || null,
        transferAlias: form.transferAlias || null,
        availabilities: form.availabilities,
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
        consultationFee: form.consultationFee || null,
        transferAlias: form.transferAlias || null,
        availabilities: form.availabilities,
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

  const uploadPhotoMut = useMutation({
    mutationFn: (file: File) => uploadSpecialistProfilePhoto(file),
    onSuccess: ({ url }) => {
      setForm((prev) => ({ ...prev, profilePhotoUrl: url }));
      setFormError(null);
    },
    onError: (err) => setFormError(parseApiError(err)),
  });

  if (!open) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) {
      if (form.password !== form.confirmPassword) {
        setFormError("La confirmación de contraseña no coincide");
        return;
      }
    } else if (form.password && form.password !== form.confirmPassword) {
      setFormError("La confirmación de contraseña no coincide");
      return;
    }
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending || deleteMut.isPending || uploadPhotoMut.isPending;
  const passwordNeedsConfirmation = !editing || Boolean(form.password);
  const passwordMismatch = passwordNeedsConfirmation && form.password !== form.confirmPassword;

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
        <form onSubmit={onSubmit} autoComplete="off" className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            name="fake-username"
            autoComplete="username"
            tabIndex={-1}
            className="hidden"
            aria-hidden="true"
          />
          <input
            type="password"
            name="fake-password"
            autoComplete="current-password"
            tabIndex={-1}
            className="hidden"
            aria-hidden="true"
          />
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
            <label className="mt-3 block text-sm font-medium text-slate-600">o subir imagen</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="mt-1.5 block w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sky-700"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                uploadPhotoMut.mutate(file);
                e.currentTarget.value = "";
              }}
            />
            {uploadPhotoMut.isPending && (
              <p className="mt-1.5 text-xs text-slate-500">Subiendo imagen…</p>
            )}
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Podés cargar una URL (HTTPS) o subir la imagen directo al servidor (máx. 5MB; jpg/png/webp/gif). Si pegás un enlace de Google
              Drive, intentamos convertirlo automáticamente.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-600">Correo</label>
            <input
              required
              type="email"
              name="specialist-email"
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          {!editing && (
            <>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-slate-600">Contraseña</label>
                <input
                  type="password"
                  required
                  name="specialist-new-password"
                  autoComplete="new-password"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-slate-600">Confirmar contraseña</label>
                <input
                  type="password"
                  required
                  name="specialist-confirm-password"
                  autoComplete="new-password"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                />
                {passwordMismatch && (
                  <p className="mt-1 text-xs text-red-600">La confirmación de contraseña no coincide.</p>
                )}
              </div>
            </>
          )}
          <div>
            <label className="text-sm font-medium text-slate-600">Nombre</label>
            <input
              required
              name="specialist-first-name"
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Apellido</label>
            <input
              required
              name="specialist-last-name"
              autoComplete="off"
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
          <div>
            <label className="text-sm font-medium text-slate-600">Valor consulta (ARS)</label>
            <input
              inputMode="decimal"
              placeholder="Ej. 25000"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.consultationFee}
              onChange={(e) => setForm((f) => ({ ...f, consultationFee: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Alias para transferencias</label>
            <input
              placeholder="Ej. nombre.apellido.mp"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.transferAlias}
              onChange={(e) => setForm((f) => ({ ...f, transferAlias: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-600">Disponibilidad semanal</label>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    availabilities: [...f.availabilities, { weekday: "MONDAY", startTime: "08:00", endTime: "12:00" }],
                  }))
                }
              >
                + Agregar franja
              </button>
            </div>
            {form.availabilities.length === 0 ? (
              <p className="text-xs text-slate-500">Sin disponibilidad. No se podrán asignar turnos.</p>
            ) : (
              <div className="space-y-2">
                {form.availabilities.map((a, idx) => (
                  <div key={`${a.weekday}-${idx}`} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                      value={a.weekday}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          availabilities: f.availabilities.map((row, i) =>
                            i === idx
                              ? {
                                  ...row,
                                  weekday: e.target.value as
                                    | "MONDAY"
                                    | "TUESDAY"
                                    | "WEDNESDAY"
                                    | "THURSDAY"
                                    | "FRIDAY"
                                    | "SATURDAY"
                                    | "SUNDAY",
                                }
                              : row
                          ),
                        }))
                      }
                    >
                      {weekdayOptions.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                      value={a.startTime}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          availabilities: f.availabilities.map((row, i) =>
                            i === idx ? { ...row, startTime: e.target.value } : row
                          ),
                        }))
                      }
                    />
                    <input
                      type="time"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                      value={a.endTime}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          availabilities: f.availabilities.map((row, i) =>
                            i === idx ? { ...row, endTime: e.target.value } : row
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          availabilities: f.availabilities.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending || passwordMismatch}
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
            {editing && canDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-xl border border-red-200 bg-red-50/80 px-5 py-2.5 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar especialista"
        message="Se eliminará el especialista y su usuario asociado."
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

export function AdminSpecialistsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const mySpecialistId = user?.specialistId ?? null;
  const { data = [], isLoading } = useQuery({
    queryKey: ["specialists", "admin"],
    queryFn: () => fetchSpecialists(isAdmin),
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
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-4 py-6 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.4)] sm:px-8 sm:py-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Especialistas</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Equipo médico en un vistazo. Abrí la agenda de cada profesional o sumá nuevos perfiles.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-sky-600 px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_26px_-12px_rgba(3,105,161,0.45)] transition hover:bg-sky-700 active:scale-[0.98]"
            >
              Agregar especialista
            </button>
          )}
        </div>

        {isLoading && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-sky-100 bg-white px-5 py-4 text-slate-600">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            Cargando equipo…
          </div>
        )}

        {!isLoading && data.length === 0 && (
          <div className="mt-6 rounded-3xl border border-dashed border-sky-200 bg-white/70 px-8 py-14 text-center">
            <p className="text-sm font-medium text-slate-700 sm:text-base">No hay especialistas todavía.</p>
            <p className="mt-2 text-sm text-slate-500">Creá el primero con el botón de arriba.</p>
          </div>
        )}

        {!isLoading && data.length > 0 && (
          <div className="relative mt-6">
            {useScrollCarousel && count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => scrollCards(-1)}
                  className="absolute left-0 top-1/2 z-10 hidden -translate-x-1 -translate-y-1/2 rounded-full border border-sky-200 bg-white/95 p-2.5 text-sky-700 shadow-lg backdrop-blur-sm transition hover:bg-sky-50 md:flex"
                  aria-label="Anterior"
                >
                  <span className="text-xl leading-none">‹</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollCards(1)}
                  className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 translate-x-1 rounded-full border border-sky-200 bg-white/95 p-2.5 text-sky-700 shadow-lg backdrop-blur-sm transition hover:bg-sky-50 md:flex"
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
                  <SpecialistCard
                    key={s.id}
                    specialist={s}
                    size="compact"
                    canEdit={isAdmin || s.id === mySpecialistId}
                    canViewAgenda={isAdmin || s.id === mySpecialistId}
                    canViewFinancialData={isAdmin}
                    onEdit={() => openEdit(s)}
                  />
                ))}
              </div>
            ) : (
              <div
                className={`grid w-full gap-6 px-4 sm:px-6 md:px-8 ${gridClass(count)}`}
              >
                {data.map((s) => (
                  <SpecialistCard
                    key={s.id}
                    specialist={s}
                    size="fluid"
                    canEdit={isAdmin || s.id === mySpecialistId}
                    canViewAgenda={isAdmin || s.id === mySpecialistId}
                    canViewFinancialData={isAdmin}
                    onEdit={() => openEdit(s)}
                  />
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
        canDelete={isAdmin}
        onClose={closeModal}
      />
    </div>
  );
}
