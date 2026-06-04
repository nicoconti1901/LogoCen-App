import type { ReactNode } from "react";
import type { Patient, Specialist } from "../types";
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
} from "../lib/directoryTableStyles";
import { computeAgeFromBirthDate } from "../lib/patientAge";
import { formatPersonDisplayLastFirst, formatPersonDisplayLastFirstUpper, normalizePersonNameField } from "../lib/personName";

export type PatientDebtFilter = "all" | "debt" | "no_debt";

export type PatientDirectoryListProps = {
  patients: Patient[];
  isLoading: boolean;
  isAdmin: boolean;
  debtPatientIds: Set<string>;
  debtAmountByPatientId: Map<string, number>;
  onOpenAppointments: (patient: Patient) => void;
  onOpenPayments: (patient: Patient) => void;
  onOpenClinicalHistory: (patient: Patient) => void;
  onEdit?: (patient: Patient) => void;
  onDelete?: (patientId: string) => void;
};

function formatMoney(amount: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)}`;
}

function patientInitials(p: Pick<Patient, "firstName" | "lastName">): string {
  const a = normalizePersonNameField(p.firstName).charAt(0);
  const b = normalizePersonNameField(p.lastName).charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function formatPhoneDisplay(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("54")) {
    return `+54 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return raw;
}

function patientMetaLine(p: Patient): string | null {
  const parts: string[] = [];
  if (p.documentId?.trim()) parts.push(`DNI ${p.documentId.trim()}`);
  if (p.birthDate) {
    const y = p.birthDate.slice(0, 4);
    const age = computeAgeFromBirthDate(p.birthDate);
    parts.push(age != null ? `Nac. ${y} (${age} años)` : `Nac. ${y}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function avatarTone(id: string): {
  ring: string;
  bg: string;
  text: string;
  rowAccent: string;
} {
  const tones = [
    {
      ring: "ring-sky-300",
      bg: "bg-sky-100",
      text: "text-sky-900",
      rowAccent: "border-l-sky-500",
    },
    {
      ring: "ring-indigo-300",
      bg: "bg-indigo-100",
      text: "text-indigo-900",
      rowAccent: "border-l-indigo-500",
    },
    {
      ring: "ring-teal-300",
      bg: "bg-teal-100",
      text: "text-teal-900",
      rowAccent: "border-l-teal-500",
    },
    {
      ring: "ring-violet-300",
      bg: "bg-violet-100",
      text: "text-violet-900",
      rowAccent: "border-l-violet-500",
    },
  ] as const;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return tones[h % tones.length]!;
}

export function PatientDirectoryList({
  patients,
  isLoading,
  isAdmin,
  debtPatientIds,
  debtAmountByPatientId,
  onOpenAppointments,
  onOpenPayments,
  onOpenClinicalHistory,
  onEdit,
  onDelete,
}: PatientDirectoryListProps) {
  return (
    <div className={DIRECTORY_TABLE_WRAPPER}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead className={`sticky top-0 z-10 ${DIRECTORY_TABLE_HEAD}`}>
            <tr className={DIRECTORY_TABLE_HEAD_ROW}>
              <th className={`${DIRECTORY_TABLE_TH} pl-5`}>Paciente</th>
              <th className={DIRECTORY_TABLE_TH}>Contacto</th>
              <th className={DIRECTORY_TABLE_TH}>Profesional</th>
              <th className={`${DIRECTORY_TABLE_TH} text-right`}>Pagos</th>
              <th className={`${DIRECTORY_TABLE_TH} pr-5 text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr
                  key={`sk-${i}`}
                  className={`animate-pulse border-b border-slate-200/80 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                >
                  <td className="px-5 py-5" colSpan={5}>
                    <div className="flex gap-4">
                      <div className="h-11 w-11 rounded-full bg-slate-200" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-4 w-48 rounded bg-slate-200" />
                        <div className="h-3 w-32 rounded bg-slate-100" />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}

            {!isLoading &&
              patients.map((p, index) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  index={index}
                  isAdmin={isAdmin}
                  hasDebt={debtPatientIds.has(p.id)}
                  debtAmount={debtAmountByPatientId.get(p.id) ?? 0}
                  onOpenAppointments={onOpenAppointments}
                  onOpenPayments={onOpenPayments}
                  onOpenClinicalHistory={onOpenClinicalHistory}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}

            {!isLoading && patients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <UsersIcon className="h-7 w-7" />
                    </span>
                    <p className="text-base font-semibold text-slate-800">Sin resultados</p>
                    <p className="text-sm text-slate-500">Probá otro criterio de búsqueda o filtro.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatientRow({
  patient: p,
  index,
  isAdmin,
  hasDebt,
  debtAmount,
  onOpenAppointments,
  onOpenPayments,
  onOpenClinicalHistory,
  onEdit,
  onDelete,
}: {
  patient: Patient;
  index: number;
  isAdmin: boolean;
  hasDebt: boolean;
  debtAmount: number;
  onOpenAppointments: (p: Patient) => void;
  onOpenPayments: (p: Patient) => void;
  onOpenClinicalHistory: (p: Patient) => void;
  onEdit?: (p: Patient) => void;
  onDelete?: (id: string) => void;
}) {
  const tone = avatarTone(p.id);
  const meta = patientMetaLine(p);
  const phone = formatPhoneDisplay(p.phone);
  const name = formatPersonDisplayLastFirstUpper(p.lastName, p.firstName);

  const rowBg = directoryRowBg(index, hasDebt);

  return (
    <tr className={`${DIRECTORY_TABLE_ROW_HOVER} ${rowBg}`}>
      <td className={`${DIRECTORY_TABLE_TD} border-l-4 pl-4 ${directoryRowAccent(p.id, hasDebt)}`}>
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2 ${tone.ring} ${tone.bg} ${tone.text}`}
            aria-hidden
          >
            {patientInitials(p)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-900" title={name}>
              {name}
            </p>
            {meta ? (
              <p className="mt-0.5 truncate text-xs text-slate-500" title={meta}>
                {meta}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-400">Sin documento cargado</p>
            )}
          </div>
        </div>
      </td>

      <td className={DIRECTORY_TABLE_TD}>
        <div className={`${DIRECTORY_CELL_CARD} space-y-1`}>
          <a
            href={`mailto:${p.email}`}
            className="block truncate text-sm font-medium text-slate-800 underline-offset-2 hover:text-brand-800 hover:underline"
            title={p.email}
          >
            {p.email}
          </a>
          {phone ? (
            <a
              href={`tel:${p.phone?.replace(/\s/g, "")}`}
              className="block text-xs font-medium tabular-nums text-slate-500 hover:text-slate-800"
            >
              {phone}
            </a>
          ) : (
            <span className="text-xs text-slate-400">Sin teléfono</span>
          )}
        </div>
      </td>

      <td className={DIRECTORY_TABLE_TD}>
        {p.specialist ? (
          <div className={DIRECTORY_CELL_CARD}>
            <p className="truncate font-medium text-slate-800" title={formatPersonDisplayLastFirst(p.specialist.lastName, p.specialist.firstName)}>
              {formatPersonDisplayLastFirst(p.specialist.lastName, p.specialist.firstName)}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{p.specialist.specialty}</p>
          </div>
        ) : (
          <span className="inline-flex rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
            Sin asignar
          </span>
        )}
      </td>

      <td className={`${DIRECTORY_TABLE_TD} text-right`}>
        {hasDebt ? (
          <div className="inline-flex flex-col items-end gap-0.5">
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200/80">
              Pendiente
            </span>
            <span className="text-sm font-bold tabular-nums text-amber-950">{formatMoney(debtAmount)}</span>
          </div>
        ) : (
          <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
            Al día
          </span>
        )}
      </td>

      <td className={`${DIRECTORY_TABLE_TD} ${DIRECTORY_ACTIONS_CELL} pr-5`}>
        <div className={`${DIRECTORY_ACTIONS_BAR} flex-nowrap`}>
          <ActionIconButton label="Turnos" onClick={() => onOpenAppointments(p)}>
            <ClockIcon />
          </ActionIconButton>
          <ActionIconButton label="Pagos" onClick={() => onOpenPayments(p)} accent="amber">
            <CardIcon />
          </ActionIconButton>
          <ActionIconButton label="Historia clínica" onClick={() => onOpenClinicalHistory(p)} accent="emerald">
            <ClipboardIcon />
          </ActionIconButton>
          {isAdmin && onEdit && (
            <ActionIconButton label="Editar" onClick={() => onEdit(p)} accent="brand">
              <PencilIcon />
            </ActionIconButton>
          )}
          {isAdmin && onDelete && (
            <ActionIconButton label="Eliminar" onClick={() => onDelete(p.id)} accent="danger">
              <TrashIcon />
            </ActionIconButton>
          )}
        </div>
      </td>
    </tr>
  );
}

type ActionAccent = "default" | "amber" | "emerald" | "brand" | "danger";

function ActionIconButton({
  label,
  onClick,
  accent = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  accent?: ActionAccent;
  children: ReactNode;
}) {
  const accentClass: Record<ActionAccent, string> = {
    default: "bg-slate-50 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
    amber: "bg-amber-50/80 text-amber-800 hover:bg-amber-100 hover:text-amber-950",
    emerald: "bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950",
    brand: "bg-sky-50 text-sky-800 hover:bg-sky-200 hover:text-sky-950",
    danger: "bg-rose-50/80 text-rose-700 hover:bg-rose-100 hover:text-rose-900",
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg shadow-sm ring-1 ring-slate-200/60 transition ${accentClass[accent]}`}
    >
      {children}
    </button>
  );
}

function iconProps(className = "h-[18px] w-[18px]") {
  return { className, fill: "none", stroke: "currentColor", strokeWidth: 1.75, "aria-hidden": true as const };
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps()}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps()}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h2m4 0h2M5 6h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps()}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps()}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps()}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

export function PatientDirectoryToolbar({
  search,
  onSearchChange,
  specialistFilter,
  onSpecialistFilterChange,
  debtFilter,
  onDebtFilterChange,
  specialists,
  isAdmin,
  isLoadingDebtIndex,
  patientCount,
  filteredCount,
  onAddPatient,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  specialistFilter: string;
  onSpecialistFilterChange: (v: string) => void;
  debtFilter: PatientDebtFilter;
  onDebtFilterChange: (v: PatientDebtFilter) => void;
  specialists: Specialist[];
  isAdmin: boolean;
  isLoadingDebtIndex: boolean;
  patientCount: number;
  filteredCount: number;
  onAddPatient: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pacientes</h1>
          <p className="mt-1 text-sm tabular-nums text-slate-500">
            {filteredCount === patientCount
              ? `${patientCount} registro${patientCount === 1 ? "" : "s"}`
              : `${filteredCount} de ${patientCount}`}
            {isLoadingDebtIndex && <span className="ml-2 text-xs">· actualizando pagos…</span>}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-brand-900/15 transition hover:bg-brand-800 active:translate-y-px"
          onClick={onAddPatient}
        >
          <PlusIcon />
          Nuevo paciente
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        <label className="lg:col-span-4">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Nombre, correo, documento…"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm text-slate-900 transition focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200/60"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </label>
        {isAdmin && (
          <label className="lg:col-span-4">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Especialista</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200/60"
              value={specialistFilter}
              onChange={(e) => onSpecialistFilterChange(e.target.value)}
            >
              <option value="">Todos los profesionales</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatPersonDisplayLastFirst(s.lastName, s.firstName)} — {s.specialty}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={isAdmin ? "lg:col-span-4" : "lg:col-span-8"}>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado de pago</span>
          <select
            className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200/60"
            value={debtFilter}
            onChange={(e) => onDebtFilterChange(e.target.value as PatientDebtFilter)}
          >
            <option value="all">Todos</option>
            <option value="debt">Con saldo pendiente</option>
            <option value="no_debt">Al día</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
