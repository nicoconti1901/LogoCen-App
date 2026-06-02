import { useEffect } from "react";
import type { Appointment, AppointmentStatus } from "../types";
import { getAppointmentDateStr, getEndTimeStr, getStartTimeStr } from "../lib/appointmentDisplay";
import { formatPersonDisplayLastFirst } from "../lib/personName";
import { isFixedSeriesAppointment } from "../lib/fixedAppointment";

const statusLabel: Record<AppointmentStatus, string> = {
  RESERVED: "Agendado",
  CONFIRMADO: "Confirmado",
  RESERVADO: "Reservado",
  ATTENDED: "Finalizado",
  AUSENTE_CON_AVISO: "Ausente c/ aviso",
  AUSENTE_SIN_AVISO: "Ausente s/ aviso",
};

const statusBadgeClass: Record<AppointmentStatus, string> = {
  RESERVED: "bg-sky-600 text-white shadow-sm",
  CONFIRMADO: "bg-emerald-600 text-white shadow-sm",
  RESERVADO: "bg-violet-600 text-white shadow-sm",
  ATTENDED: "bg-slate-500 text-white shadow-sm",
  AUSENTE_CON_AVISO: "bg-amber-500 text-amber-950 shadow-sm",
  AUSENTE_SIN_AVISO: "bg-rose-600 text-white shadow-sm",
};

function formatAppointmentDateEs(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type ActionTone = "primary" | "default" | "violet" | "danger";

/** Acciones frecuentes (editar / nuevo / eliminar) vs secundarias (turno fijo). */
type ActionEmphasis = "featured" | "standard";

type ActionItem = {
  key: string;
  label: string;
  hint?: string;
  tone: ActionTone;
  emphasis: ActionEmphasis;
  onClick: () => void;
  icon: "edit" | "add" | "calendar-off" | "repeat-off" | "trash";
};

const featuredRowClass: Record<ActionTone, string> = {
  primary:
    "border-2 border-brand-700 bg-brand-700 shadow-md ring-1 ring-brand-900/15 hover:border-brand-800 hover:bg-brand-800",
  default:
    "border-2 border-brand-500 bg-white shadow-sm ring-1 ring-brand-900/5 hover:border-brand-600 hover:bg-brand-50",
  violet:
    "border-2 border-violet-400 bg-violet-50 shadow-sm hover:border-violet-500 hover:bg-violet-100",
  danger:
    "border-2 border-rose-500 bg-rose-50 shadow-sm ring-1 ring-rose-900/10 hover:border-rose-600 hover:bg-rose-100",
};

const featuredIconClass: Record<ActionTone, string> = {
  primary: "bg-white/20 text-white",
  default: "bg-brand-100 text-brand-800",
  violet: "bg-violet-200 text-violet-900",
  danger: "bg-rose-200 text-rose-900",
};

const featuredLabelClass: Record<ActionTone, string> = {
  primary: "text-white",
  default: "text-brand-900",
  violet: "text-violet-950",
  danger: "text-rose-950",
};

const featuredHintClass: Record<ActionTone, string> = {
  primary: "text-brand-100",
  default: "text-brand-700/80",
  violet: "text-violet-800",
  danger: "text-rose-800",
};

const standardIconClass: Record<ActionTone, string> = {
  primary: "bg-brand-100 text-brand-800",
  default: "bg-slate-100 text-slate-700",
  violet: "bg-violet-100 text-violet-800",
  danger: "bg-rose-100 text-rose-800",
};

function ActionIcon({ name }: { name: ActionItem["icon"] }) {
  const common = "h-5 w-5";
  switch (name) {
    case "edit":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "add":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      );
    case "calendar-off":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeLinecap="round" />
          <path d="m9 14 6 6M15 14l-6 6" strokeLinecap="round" />
        </svg>
      );
    case "repeat-off":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "trash":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function ActionRow({ item }: { item: ActionItem }) {
  const featured = item.emphasis === "featured";

  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`group flex w-full items-center gap-3 rounded-xl px-3.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
        featured
          ? `min-h-[3.25rem] py-3.5 ${featuredRowClass[item.tone]}`
          : "border border-transparent py-3 hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          featured ? featuredIconClass[item.tone] : standardIconClass[item.tone]
        }`}
      >
        <ActionIcon name={item.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[15px] font-bold tracking-tight ${
            featured ? featuredLabelClass[item.tone] : "text-slate-900"
          }`}
        >
          {item.label}
        </span>
        {item.hint ? (
          <span
            className={`mt-0.5 block text-xs ${featured ? featuredHintClass[item.tone] : "text-slate-500"}`}
          >
            {item.hint}
          </span>
        ) : null}
      </span>
      <svg
        className={`h-5 w-5 shrink-0 transition ${
          featured
            ? item.tone === "primary"
              ? "text-white/70 group-hover:text-white"
              : "text-slate-400 group-hover:text-slate-600"
            : "text-slate-300 group-hover:text-slate-500"
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export type AppointmentEventActionDialogProps = {
  open: boolean;
  appointment: Appointment;
  isAdmin: boolean;
  showEdit: boolean;
  showNewSlot: boolean;
  showDelete: boolean;
  showFixedCancel: boolean;
  onClose: () => void;
  onEdit: () => void;
  onNewSlot: () => void;
  onDelete: () => void;
  onCancelOccurrence: () => void;
  onCancelSeries: () => void;
};

export function AppointmentEventActionDialog({
  open,
  appointment,
  isAdmin,
  showEdit,
  showNewSlot,
  showDelete,
  showFixedCancel,
  onClose,
  onEdit,
  onNewSlot,
  onDelete,
  onCancelOccurrence,
  onCancelSeries,
}: AppointmentEventActionDialogProps) {
  const isFixed = isFixedSeriesAppointment(appointment);
  const dateStr = getAppointmentDateStr(appointment);
  const patientName = formatPersonDisplayLastFirst(
    appointment.patient.lastName,
    appointment.patient.firstName
  );
  const specialistName = formatPersonDisplayLastFirst(
    appointment.specialist.lastName,
    appointment.specialist.firstName
  );
  const status = appointment.status;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mainActions: ActionItem[] = [];
  const otherActions: ActionItem[] = [];

  if (showEdit) {
    mainActions.push({
      key: "edit",
      label: isFixed ? "Pago y estado" : "Editar turno",
      hint: isFixed ? "Registrar pago o cambiar estado del día" : "Datos, estado y cobros del turno",
      tone: "primary",
      emphasis: "featured",
      icon: "edit",
      onClick: onEdit,
    });
  }
  if (showNewSlot) {
    mainActions.push({
      key: "new",
      label: "Nueva cita en este horario",
      hint: "Agendar otro paciente en el mismo bloque",
      tone: "default",
      emphasis: "featured",
      icon: "add",
      onClick: onNewSlot,
    });
  }
  if (showDelete) {
    mainActions.push({
      key: "delete",
      label: "Eliminar turno",
      hint: "Quita la cita de la agenda",
      tone: "danger",
      emphasis: "featured",
      icon: "trash",
      onClick: onDelete,
    });
  }
  if (showFixedCancel) {
    otherActions.push({
      key: "skip-day",
      label: "Cancelar solo este día",
      hint: "Esta semana no se atiende; la serie sigue activa",
      tone: "violet",
      emphasis: "standard",
      icon: "calendar-off",
      onClick: onCancelOccurrence,
    });
    otherActions.push({
      key: "cancel-series",
      label: "Dar de baja turno fijo",
      hint: "Cancela toda la serie semanal",
      tone: "danger",
      emphasis: "standard",
      icon: "repeat-off",
      onClick: onCancelSeries,
    });
  }

  const subtitle = isFixed
    ? "Turno fijo semanal"
    : isAdmin
      ? "Elegí una acción"
      : "Podés agendar o eliminar; para editar, contactá administración";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-action-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-brand-50/80 via-white to-white px-5 pb-4 pt-5 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-800/80">{subtitle}</p>
          <h3 id="event-action-title" className="mt-1 pr-10 text-lg font-semibold tracking-tight text-slate-900">
            {patientName}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                isFixed ? "bg-violet-600 text-white shadow-sm" : statusBadgeClass[status]
              }`}
            >
              {isFixed ? "Fijo" : statusLabel[status]}
            </span>
            <span className="text-sm text-slate-600">
              {formatAppointmentDateEs(dateStr)} · {getStartTimeStr(appointment)}–{getEndTimeStr(appointment)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-sm sm:px-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Profesional</p>
            <p className="font-medium text-slate-800">{specialistName}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Consultorio</p>
            <p className="font-medium text-slate-800">{appointment.consultorio?.trim() || "—"}</p>
          </div>
        </div>

        <div className="max-h-[min(55vh,22rem)] overflow-y-auto px-3 py-3 sm:px-4">
          {mainActions.length > 0 && (
            <div className="space-y-2.5">
              <p className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-800">
                Acciones principales
              </p>
              {mainActions.map((item) => (
                <ActionRow key={item.key} item={item} />
              ))}
            </div>
          )}
          {otherActions.length > 0 && (
            <div className={`space-y-1 ${mainActions.length > 0 ? "mt-4 border-t border-slate-200 pt-3" : ""}`}>
              <p className="px-0.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Turno fijo
              </p>
              {otherActions.map((item) => (
                <ActionRow key={item.key} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
