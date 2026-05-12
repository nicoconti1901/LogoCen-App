import { Link, useLocation, useParams, useSearchParams, type To } from "react-router-dom";
import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DateSelectArg, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAppointment, fetchAppointments, fetchSpecialist, fetchSpecialists } from "../api/endpoints";
import { getAppointmentDateStr, toCalendarEnd, toCalendarStart } from "../lib/appointmentDisplay";
import { formatPersonDisplayLastFirst, formatPersonDisplayLastFirstUpper } from "../lib/personName";
import { AppointmentModal } from "../components/AppointmentModal";
import { PatientPaymentHistoryModal } from "../components/PatientPaymentHistoryModal";
import { useAuth } from "../contexts/AuthContext";
import type { Appointment, AppointmentPaymentMethod, Specialist } from "../types";
import { appointmentHasDebt, appointmentDebtAmountArs, reservadoHonorarioRemainder } from "../lib/appointmentDebt";
import { appointmentBlocksScheduleSlot } from "../lib/appointmentScheduling";

/** Intervalos de atención (minutos desde medianoche) para un día de calendario, recortados al rango de la grilla. */
function availabilityIntervalsForCalendarDay(
  specialist: Specialist,
  day: Date
): Array<{ s: number; e: number }> {
  const wd = (["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const)[day.getDay()];
  const gridStart = hhmmToMinutes(WORKDAY_START);
  const gridEnd = hhmmToMinutes(WORKDAY_END);
  return specialist.availabilities
    .filter((a) => a.weekday === wd)
    .map((a) => {
      const s = Math.max(hhmmToMinutes(a.startTime), gridStart);
      const e = Math.min(hhmmToMinutes(a.endTime), gridEnd);
      return { s, e };
    })
    .filter((x) => x.e > x.s);
}

/**
 * Bloques de fondo en el calendario = exactamente cuándo atiende el especialista (misma lógica que la validación).
 * La grilla queda neutra; solo estos bloques marcan “podés asignar acá”.
 */
function buildAvailabilityBackgroundEvents(
  specialist: Specialist | undefined,
  range: { from: string; to: string } | null,
  routeSpecialistId: string | undefined
): EventInput[] {
  if (!routeSpecialistId || !specialist?.availabilities?.length || !range) return [];
  const viewStart = new Date(range.from);
  const viewEnd = new Date(range.to);
  const out: EventInput[] = [];
  const d = new Date(viewStart.getFullYear(), viewStart.getMonth(), viewStart.getDate());
  const lastExclusive = new Date(viewEnd.getFullYear(), viewEnd.getMonth(), viewEnd.getDate());
  while (d < lastExclusive) {
    const intervals = availabilityIntervalsForCalendarDay(specialist, d);
    for (const iv of intervals) {
      const startDt = new Date(d);
      startDt.setHours(Math.floor(iv.s / 60), iv.s % 60, 0, 0);
      const endDt = new Date(d);
      endDt.setHours(Math.floor(iv.e / 60), iv.e % 60, 0, 0);
      out.push({
        id: `avail-bg-${startDt.getTime()}-${iv.s}-${iv.e}`,
        start: startDt,
        end: endDt,
        display: "background",
        classNames: ["specialist-avail-bg"],
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** El intervalo [segmentStart, segmentEnd) debe caer entero dentro de alguna franja de ese mismo día local. */
function isSegmentWithinAvailabilityOnDay(
  segmentStart: Date,
  segmentEnd: Date,
  specialist: Specialist
): boolean {
  if (segmentEnd <= segmentStart) return false;
  const intervals = availabilityIntervalsForCalendarDay(specialist, segmentStart);
  if (!intervals.length) return false;
  const sm = segmentStart.getHours() * 60 + segmentStart.getMinutes();
  const em = segmentEnd.getHours() * 60 + segmentEnd.getMinutes();
  return intervals.some((iv) => sm >= iv.s && em <= iv.e);
}

function isSelectionWithinSpecialistAvailability(start: Date, end: Date, specialist: Specialist): boolean {
  if (!specialist.availabilities?.length) return false;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return false;
  let dayCursor = new Date(start);
  dayCursor.setHours(0, 0, 0, 0);
  while (dayCursor < end) {
    const nextMidnight = new Date(dayCursor);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    const segStart = new Date(Math.max(startMs, dayCursor.getTime()));
    const segEnd = new Date(Math.min(endMs, nextMidnight.getTime()));
    if (segEnd > segStart && !isSegmentWithinAvailabilityOnDay(segStart, segEnd, specialist)) {
      return false;
    }
    dayCursor = nextMidnight;
  }
  return true;
}

const statusLabel: Record<Appointment["status"], string> = {
  RESERVED: "AGENDADO",
  RESERVADO: "RESERVADO",
  ATTENDED: "FINALIZADO",
  AUSENTE_CON_AVISO: "AUSENTE C/ AVISO",
  AUSENTE_SIN_AVISO: "AUSENTE S/ AVISO",
};

const WORKDAY_START = "08:00";
const WORKDAY_END = "20:00";

const paymentMethodLabel: Record<AppointmentPaymentMethod, string> = {
  TRANSFER_TO_LOGOCEN: "Transferencia a LogoCen",
  TRANSFER_TO_SPECIALIST: "Transferencia al especialista",
  CASH_TO_LOGOCEN: "Efectivo a LogoCen",
};

/** Monto de referencia del turno (misma base que deuda en Pacientes / ingresos en Balance). */
function formatConsultationFeeArs(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "Sin honorario cargado";
  const normalized = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(normalized)) return "Sin honorario cargado";
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(normalized);
  return `$${formatted}`;
}

function parseMoneyAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const normalized = Number(String(raw).replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function formatMoneyArsAmount(n: number): string {
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
  return `$${formatted}`;
}

function reservationBalanceCaption(a: Appointment): string | null {
  if (a.status !== "RESERVADO") return null;
  const dep = parseMoneyAmount(a.reservationDepositAmount ?? undefined);
  const fee = parseMoneyAmount(a.specialist.consultationFee);
  if (dep == null) return "Reservado · anticipo sin cargar";
  if (fee != null && fee > 0) {
    const rest = Math.max(0, fee - dep);
    return `Anticipo ${formatMoneyArsAmount(dep)} · Falta pagar ${formatMoneyArsAmount(rest)}`;
  }
  return `Anticipo ${formatMoneyArsAmount(dep)}`;
}

function appointmentPaymentCaption(a: Appointment): string {
  const remainder = reservadoHonorarioRemainder(a);
  let paid: string;
  if (a.paymentCompleted) {
    paid = "Pagado";
  } else if (a.status === "RESERVADO") {
    if (remainder != null) {
      paid = remainder > 0 ? "Seña imputada · saldo pendiente" : "Seña imputada (honorario cubierto)";
    } else {
      paid = "Sin pagar";
    }
  } else {
    paid = "Sin pagar";
  }
  const method = a.paymentMethod ? paymentMethodLabel[a.paymentMethod] : "forma sin definir";
  const amount = formatConsultationFeeArs(a.specialist.consultationFee);
  const base = `${paid} · ${method} · ${amount}`;
  let withAbsent = base;
  if (
    (a.status === "AUSENTE_CON_AVISO" || a.status === "AUSENTE_SIN_AVISO") &&
    !a.paymentCompleted &&
    appointmentHasDebt(a)
  ) {
    const d = appointmentDebtAmountArs(a);
    withAbsent =
      d > 0
        ? `${base} · Inasistencia: deuda ${formatMoneyArsAmount(d)}`
        : `${base} · Inasistencia: deuda sujeta a honorario cargado`;
  }
  const res = reservationBalanceCaption(a);
  return res ? `${withAbsent} · ${res}` : withAbsent;
}

function toEvent(a: Appointment): EventInput {
  return {
    id: a.id,
    title: formatPersonDisplayLastFirstUpper(a.patient.lastName, a.patient.firstName),
    start: toCalendarStart(a),
    end: toCalendarEnd(a),
    classNames: ["appt-event", `status-${a.status.toLowerCase()}`],
    extendedProps: { raw: a },
  };
}

function renderEventContent(arg: EventContentArg, buildPatientPaymentTo: (patientId: string) => To) {
  if (arg.event.display === "background") return null;
  const raw = arg.event.extendedProps.raw as Appointment | undefined;
  if (!raw) return <span>{arg.event.title}</span>;
  const patient = formatPersonDisplayLastFirst(raw.patient.lastName, raw.patient.firstName);
  const specialist = formatPersonDisplayLastFirst(raw.specialist.lastName, raw.specialist.firstName);
  const consultorio = raw.consultorio.trim() || "Sin consultorio";
  const status = statusLabel[raw.status];
  const hasDebt = appointmentHasDebt(raw);
  const isListView = arg.view.type.startsWith("list");
  const isMonthView = arg.view.type === "dayGridMonth";

  if (isListView) {
    return (
      <div className="appt-list-event-content">
        <div className="appt-list-row-main">
          <span className="appt-list-left">
            <span className="appt-list-patient">{patient}</span>
            <span className="appt-list-specialist">{specialist}</span>
          </span>
          <span className="appt-list-right">
            <span className={`appt-list-status status-chip-${raw.status.toLowerCase()}`}>{status}</span>
            <Link
              to={buildPatientPaymentTo(raw.patientId)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                hasDebt ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
              }`}
              title="Abrir historial de pagos del paciente"
              onClick={(e) => e.stopPropagation()}
            >
              {hasDebt ? "Con deuda" : "Sin deuda"}
            </Link>
            <span className="appt-list-office">{consultorio}</span>
          </span>
        </div>
        <div className="appt-list-payment-row">{appointmentPaymentCaption(raw)}</div>
      </div>
    );
  }

  if (isMonthView) {
    return (
      <div className="flex flex-col gap-0.5 text-[10px] leading-none" title={appointmentPaymentCaption(raw)}>
        <div className="flex items-center gap-1">
          <span className="font-semibold">{raw.startTime}</span>
          <span className="truncate">{patient}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="appt-week-event-content">
      <div className="appt-week-event-top">
        <div className="appt-week-event-time">{raw.startTime}</div>
        <div className={`appt-event-status status-chip-${raw.status.toLowerCase()}`}>{status}</div>
      </div>
      <div className="appt-week-event-patient">{patient}</div>
      <div className="appt-week-event-payment">{appointmentPaymentCaption(raw)}</div>
      <div className="appt-week-event-bottom">
        <div className="appt-week-event-office">{consultorio}</div>
        <span className={hasDebt ? "appt-week-payment debt" : "appt-week-payment paid"}>
          {hasDebt ? "Deuda" : "Pago OK"}
        </span>
      </div>
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateToIsoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function AgendaPage() {
  const { user } = useAuth();
  const { specialistId: routeSpecialistId } = useParams<{ specialistId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const buildPatientPaymentTo = useCallback(
    (patientId: string): To => {
      const next = new URLSearchParams(searchParams);
      next.set("paymentPatientId", patientId);
      return { pathname, search: next.toString() };
    },
    [pathname, searchParams]
  );
  const paymentPatientId = searchParams.get("paymentPatientId");
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [eventActionOpen, setEventActionOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [clickedAppointment, setClickedAppointment] = useState<Appointment | null>(null);
  const [clickedSlot, setClickedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [showQuickSlots, setShowQuickSlots] = useState(false);
  const [quickSlotsLimit, setQuickSlotsLimit] = useState<5 | 10>(5);
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const [unavailableHintOpen, setUnavailableHintOpen] = useState(false);
  const [deleteTargetAppointmentId, setDeleteTargetAppointmentId] = useState<string | null>(null);
  const [monthSimplified, setMonthSimplified] = useState(true);
  const qc = useQueryClient();
  const shouldOpenQuickSlots = searchParams.get("new") === "1";
  const effectiveSpecialistId = routeSpecialistId ?? (user?.role === "SPECIALIST" ? user.specialistId ?? undefined : undefined);

  const specialistQ = useQuery({
    queryKey: ["specialist", effectiveSpecialistId],
    queryFn: () => fetchSpecialist(effectiveSpecialistId!),
    enabled: Boolean(effectiveSpecialistId),
  });

  const { data = [], refetch } = useQuery({
    queryKey: ["appointments", range?.from, range?.to, effectiveSpecialistId],
    queryFn: () =>
      fetchAppointments({
        from: range!.from,
        to: range!.to,
        ...(effectiveSpecialistId ? { specialistId: effectiveSpecialistId } : {}),
      }),
    enabled: Boolean(range),
  });

  const visibleAppointments = useMemo(
    () => (effectiveSpecialistId ? data.filter((a) => a.specialistId === effectiveSpecialistId) : data),
    [data, effectiveSpecialistId]
  );
  const todayIso = todayStr();

  const dayCellClassNames = useCallback(
    (arg: { date: Date }) => {
      if (!effectiveSpecialistId || !specialistQ.data) return [];
      const intervals = availabilityIntervalsForCalendarDay(specialistQ.data, arg.date);
      return intervals.length ? [] : ["agenda-fc-day-no-hours"];
    },
    [effectiveSpecialistId, specialistQ.data]
  );

  const onDatesSet = useCallback((arg: { start: Date; end: Date }) => {
    setRange({
      from: arg.start.toISOString(),
      to: arg.end.toISOString(),
    });
  }, []);

  const eventClassNames = useCallback(
    (arg: { event: { display: string; start: Date | null } }) => {
      if (arg.event.display === "background") return [];
      const start = arg.event.start;
      if (!start) return [];
      return dateToIsoLocal(start) === todayIso ? ["agenda-event-today"] : [];
    },
    [todayIso]
  );

  const events = visibleAppointments.map(toEvent);

  const availabilityBackgroundEvents = useMemo(
    () =>
      buildAvailabilityBackgroundEvents(
        effectiveSpecialistId ? specialistQ.data : undefined,
        range,
        effectiveSpecialistId
      ),
    [effectiveSpecialistId, specialistQ.data, range]
  );

  const calendarEvents = useMemo(
    () => [...availabilityBackgroundEvents, ...events],
    [availabilityBackgroundEvents, events]
  );

  const specialistsSummaryQ = useQuery({
    queryKey: ["specialists", "agenda-day-strip"],
    queryFn: () => fetchSpecialists(false),
  });

  const todayAllAppointmentsQ = useQuery({
    queryKey: ["appointments", "today-all", todayIso],
    queryFn: () => fetchAppointments({ from: todayIso, to: todayIso }),
  });

  const specialistDayBoard = useMemo(() => {
    const all = specialistsSummaryQ.data ?? [];
    const activeAll = all.filter((s) => s.active);
    const active =
      user?.role === "SPECIALIST" && user.specialistId
        ? activeAll.filter((s) => s.id === user.specialistId)
        : activeAll.slice(0, 5);
    const appts = todayAllAppointmentsQ.data ?? [];
    const today = todayIso;
    return active.map((s) => ({
      specialist: s,
      appointments: appts
        .filter((a) => a.specialistId === s.id && getAppointmentDateStr(a) === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  }, [specialistsSummaryQ.data, todayAllAppointmentsQ.data, todayIso, user?.role, user?.specialistId]);

  const totalActiveSpecialists = useMemo(
    () => (specialistsSummaryQ.data ?? []).filter((s) => s.active).length,
    [specialistsSummaryQ.data]
  );
  const isSingleSpecialistDayBoard = specialistDayBoard.length === 1;
  const canDeleteClickedAppointment =
    Boolean(clickedAppointment) &&
    (user?.role === "ADMIN" ||
      (user?.role === "SPECIALIST" &&
        Boolean(user.specialistId) &&
        user.specialistId === clickedAppointment?.specialistId));

  const deleteFromActionMut = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      await refetch();
      setDeleteTargetAppointmentId(null);
      setClickedAppointment(null);
      setClickedSlot(null);
    },
  });

  function onSelect(sel: DateSelectArg) {
    if (effectiveSpecialistId) {
      if (!specialistQ.data) {
        queueMicrotask(() => calendarRef.current?.getApi().unselect());
        return;
      }
      if (sel.allDay) {
        const intervals = availabilityIntervalsForCalendarDay(specialistQ.data, sel.start);
        if (!intervals.length) {
          queueMicrotask(() => calendarRef.current?.getApi().unselect());
          setUnavailableHintOpen(true);
          setUnavailableOpen(true);
          return;
        }
        const firstInterval = intervals[0];
        const start = new Date(sel.start);
        start.setHours(Math.floor(firstInterval.s / 60), firstInterval.s % 60, 0, 0);
        const endMinutes = Math.min(firstInterval.s + 30, firstInterval.e);
        const end = new Date(sel.start);
        end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
        setSelected(null);
        setSlot({ start, end });
        setModalOpen(true);
        queueMicrotask(() => calendarRef.current?.getApi().unselect());
        return;
      }
      if (!isSelectionWithinSpecialistAvailability(sel.start, sel.end, specialistQ.data)) {
        queueMicrotask(() => calendarRef.current?.getApi().unselect());
        setUnavailableHintOpen(true);
        setUnavailableOpen(true);
        return;
      }
    }
    setSelected(null);
    setSlot({ start: sel.start, end: sel.end });
    setModalOpen(true);
  }

  function onEventClick(info: EventClickArg) {
    const raw = info.event.extendedProps.raw as Appointment | undefined;
    if (!raw) return;
    if (user?.role === "SPECIALIST" && user.specialistId && raw.specialistId !== user.specialistId) return;
    if (effectiveSpecialistId && raw.specialistId !== effectiveSpecialistId) return;

    const start = info.event.start;
    if (!start) return;
    const end = info.event.end ?? new Date(start.getTime() + 30 * 60 * 1000);
    setClickedAppointment(raw);
    setClickedSlot({ start, end });
    setEventActionOpen(true);
  }

  function onMoreLinkClick(arg: { date: Date }) {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView("listDay", arg.date);
  }

  const quickAvailableSlots = useMemo(() => {
    if (!effectiveSpecialistId || !specialistQ.data) return [] as Array<{ start: Date; end: Date; label: string }>;
    const specialistAvailabilities = specialistQ.data.availabilities;
    if (!specialistAvailabilities.length) return [];

    const byDate = new Map<string, Array<{ start: number; end: number }>>();
    for (const a of visibleAppointments) {
      if (a.specialistId !== effectiveSpecialistId) continue;
      if (!appointmentBlocksScheduleSlot(a)) continue;
      const key = getAppointmentDateStr(a);
      const row = byDate.get(key) ?? [];
      row.push({ start: hhmmToMinutes(a.startTime), end: hhmmToMinutes(a.endTime) });
      byDate.set(key, row);
    }

    const weekdayIdx: Record<string, number> = {
      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
    };
    const now = new Date();
    const found: Array<{ start: Date; end: Date; label: string }> = [];
    for (let addDays = 0; addDays < 45 && found.length < quickSlotsLimit; addDays++) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + addDays);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const occupied = byDate.get(dateKey) ?? [];
      for (const avail of specialistAvailabilities) {
        if (weekdayIdx[avail.weekday] !== day.getDay()) continue;
        const startM = Math.max(hhmmToMinutes(avail.startTime), hhmmToMinutes(WORKDAY_START));
        const endM = Math.min(hhmmToMinutes(avail.endTime), hhmmToMinutes(WORKDAY_END));
        for (let m = startM; m + 30 <= endM && found.length < quickSlotsLimit; m += 30) {
          const candidateStart = new Date(day);
          candidateStart.setHours(Math.floor(m / 60), m % 60, 0, 0);
          if (candidateStart <= now) continue;
          const candidateEnd = new Date(candidateStart.getTime() + 30 * 60 * 1000);
          const overlaps = occupied.some((o) => m < o.end && m + 30 > o.start);
          if (overlaps) continue;
          found.push({
            start: candidateStart,
            end: candidateEnd,
            label: `${candidateStart.toLocaleDateString("es-AR", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
            })} - ${String(candidateStart.getHours()).padStart(2, "0")}:${String(candidateStart.getMinutes()).padStart(2, "0")}`,
          });
        }
      }
    }
    return found;
  }, [effectiveSpecialistId, specialistQ.data, visibleAppointments, quickSlotsLimit]);

  useEffect(() => {
    if (!effectiveSpecialistId || !shouldOpenQuickSlots) return;
    setShowQuickSlots(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [effectiveSpecialistId, shouldOpenQuickSlots, searchParams, setSearchParams]);

  useEffect(() => {
    if (!unavailableHintOpen) return;
    const timer = window.setTimeout(() => setUnavailableHintOpen(false), 3500);
    return () => window.clearTimeout(timer);
  }, [unavailableHintOpen]);

  return (
    <div className="agenda-page-bg agenda-page-fullbleed">
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:px-6">
      <div
        className={`agenda-light rounded-2xl border border-slate-200/60 p-3 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.45)] ${
          effectiveSpecialistId ? "agenda-specialist-view" : ""
        }`}
      >
        {effectiveSpecialistId && (
          <div className="mb-3 rounded-xl border border-sky-200/90 bg-gradient-to-r from-sky-50/95 to-white px-4 py-3 shadow-sm">
            {specialistQ.isLoading && (
              <p className="text-sm font-medium text-slate-600">Cargando datos del especialista…</p>
            )}
            {specialistQ.data && (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-800/90">Agenda del especialista</p>
                  <h1 className="mt-0.5 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    {formatPersonDisplayLastFirst(specialistQ.data.lastName, specialistQ.data.firstName)}
                  </h1>
                  <p className="mt-0.5 truncate text-sm text-slate-600">{specialistQ.data.specialty}</p>
                </div>
                {user?.role === "ADMIN" && routeSpecialistId && (
                  <Link
                    to="/agenda"
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Agenda general
                  </Link>
                )}
              </div>
            )}
            {!specialistQ.isLoading && !specialistQ.data && (
              <p className="text-sm text-amber-800">No se pudo cargar el especialista.</p>
            )}
          </div>
        )}
        <div className="mb-4 rounded-xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[3px]">
          <div className="mb-4">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Agenda del día</h2>
            <p className="mt-0.5 text-xs capitalize text-slate-600">
              {new Date(todayIso + "T12:00:00").toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          {specialistsSummaryQ.isLoading || todayAllAppointmentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Cargando agenda del día…</p>
          ) : specialistDayBoard.length === 0 ? (
            <p className="text-sm text-slate-500">No hay especialistas activos para mostrar.</p>
          ) : (
            <>
              <div
                className={`grid gap-4 ${isSingleSpecialistDayBoard ? "grid-cols-1" : ""}`}
                style={
                  isSingleSpecialistDayBoard
                    ? undefined
                    : { gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }
                }
              >
                {specialistDayBoard.map(({ specialist: s, appointments: dayAppts }) => {
                  const name = formatPersonDisplayLastFirst(s.lastName, s.firstName);
                  const canLinkAgenda = user?.role === "ADMIN" || (user?.role === "SPECIALIST" && user.specialistId === s.id);
                  return (
                    <div
                      key={s.id}
                      className={`rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm ${
                        isSingleSpecialistDayBoard
                          ? "flex flex-col gap-3 lg:flex-row lg:items-start"
                          : "flex min-h-[10rem] flex-col"
                      }`}
                    >
                      <div
                        className={`${
                          isSingleSpecialistDayBoard
                            ? "border-b border-slate-100 pb-2 lg:min-w-[260px] lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
                            : "border-b border-slate-100 pb-2"
                        }`}
                      >
                        {canLinkAgenda ? (
                          <Link
                            to={`/specialists/${s.id}/agenda`}
                            className="block truncate text-sm font-bold text-sky-800 hover:text-sky-950 hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <p className="truncate text-sm font-bold text-slate-900">{name}</p>
                        )}
                        <p className="mt-0.5 truncate text-[11px] text-slate-600">{s.specialty}</p>
                        {canLinkAgenda && (
                          <Link
                            to={`/specialists/${s.id}/agenda?new=1`}
                            className="mt-2 inline-flex items-center rounded-md bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-700"
                          >
                            Agendar turno
                          </Link>
                        )}
                      </div>
                      <ul
                        className={`text-[11px] leading-tight ${
                          isSingleSpecialistDayBoard
                            ? "mt-1 flex-1 whitespace-nowrap overflow-x-auto overflow-y-hidden space-y-0"
                            : "mt-2 flex-1 space-y-1.5 overflow-y-auto"
                        }`}
                      >
                        {dayAppts.length === 0 ? (
                          <li className="rounded-md bg-slate-50 px-3 py-2.5 text-center text-slate-500">Sin turnos hoy</li>
                        ) : (
                          dayAppts.map((a) => {
                            const patient = formatPersonDisplayLastFirstUpper(a.patient.lastName, a.patient.firstName);
                            const muted =
                              a.status === "AUSENTE_CON_AVISO" || a.status === "AUSENTE_SIN_AVISO";
                            const dayCellTone =
                              a.status === "ATTENDED"
                                ? "bg-emerald-50 border-emerald-200"
                                : a.status === "AUSENTE_SIN_AVISO"
                                  ? "bg-rose-50 border-rose-200"
                                  : a.status === "AUSENTE_CON_AVISO"
                                    ? "bg-amber-50 border-amber-200"
                                    : a.status === "RESERVADO"
                                      ? "bg-violet-50 border-violet-200"
                                      : "bg-sky-50 border-sky-200";
                            const hasDebt = appointmentHasDebt(a);
                            return (
                              <li
                                key={a.id}
                                className={`rounded-md border px-3 py-2 ${dayCellTone} ${
                                  isSingleSpecialistDayBoard
                                    ? "mr-2 inline-block min-w-[210px] align-top"
                                    : ""
                                } ${muted ? "opacity-60" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-semibold text-slate-800">{a.startTime}–{a.endTime}</span>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <span
                                      className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide agenda-pill status-${a.status.toLowerCase()}`}
                                    >
                                      {statusLabel[a.status]}
                                    </span>
                                    <button
                                      type="button"
                                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                        hasDebt ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-900"
                                      }`}
                                      onClick={() => {
                                        setSearchParams((prev) => {
                                          const next = new URLSearchParams(prev);
                                          next.set("paymentPatientId", a.patientId);
                                          return next;
                                        });
                                      }}
                                      title="Ver pagos y deuda del paciente"
                                    >
                                      {hasDebt ? "Con deuda" : "Sin deuda"}
                                    </button>
                                  </div>
                                </div>
                                <p className={`mt-0.5 truncate text-slate-700 ${muted ? "line-through" : ""}`}>{patient}</p>
                                <p className="truncate text-slate-500">({a.consultorio.trim() || "—"})</p>
                                <p className="mt-1 text-[10px] leading-snug text-slate-600">{appointmentPaymentCaption(a)}</p>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
              {totalActiveSpecialists > 5 && (
                <p className="mt-3 text-center text-[11px] text-slate-500">
                  Mostrando 5 de {totalActiveSpecialists} profesionales activos. El resto aparece en la grilla o en Especialistas.
                </p>
              )}
            </>
          )}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {(Object.keys(statusLabel) as Appointment["status"][]).map((s) => (
            <span key={s} className={`agenda-pill status-${s.toLowerCase()}`}>
              {statusLabel[s]}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setMonthSimplified((v) => !v)}
            className={`rounded-full border px-3 py-1 font-semibold transition ${
              monthSimplified
                ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200"
                : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            title="Reducir saturación visual en vista mensual"
          >
            Mes simplificado: {monthSimplified ? "ON" : "OFF"}
          </button>
        </div>
        {effectiveSpecialistId && (
          <p className="mb-3 text-xs text-slate-600">
            Para mejorar lectura con alta cantidad de turnos, usá <strong>Semana</strong> y <strong>Día</strong> en formato lista.
          </p>
        )}
        {effectiveSpecialistId && specialistQ.data && !specialistQ.data.availabilities.length ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
            Este especialista no tiene franjas de atención cargadas: no se podrán asignar turnos hasta que un administrador
            las configure.
          </div>
        ) : null}
        {unavailableHintOpen && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 shadow-sm">
            Fuera de franja de atención: seleccioná un horario dentro de los bloques habilitados para este especialista.
          </div>
        )}
        <div className={effectiveSpecialistId ? "agenda-specialist-slots" : undefined}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="listWeek"
            initialDate={todayIso}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: effectiveSpecialistId ? "listWeek,listDay,dayGridMonth" : "dayGridMonth,listWeek,listDay",
            }}
            views={{
              listWeek: {
                type: "list",
                duration: { days: 7 },
              },
              listDay: {
                type: "list",
                duration: { days: 1 },
                buttonText: "Día",
              },
            }}
            locale={esLocale}
            slotMinTime={`${WORKDAY_START}:00`}
            slotMaxTime={`${WORKDAY_END}:00`}
            allDaySlot={false}
            height="auto"
            nowIndicator
            expandRows
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            selectable={!effectiveSpecialistId || Boolean(specialistQ.data)}
            selectMirror
            dayMaxEvents
            dayMaxEventRows={monthSimplified ? 2 : true}
            eventMaxStack={monthSimplified ? 2 : 3}
            slotEventOverlap={false}
            weekends={false}
            eventOrder="start,-duration,title"
            eventMinHeight={84}
            eventShortHeight={72}
            moreLinkContent={(arg) => `+${arg.num} turnos`}
            moreLinkClick={onMoreLinkClick}
            dayCellClassNames={effectiveSpecialistId ? dayCellClassNames : undefined}
            events={calendarEvents}
            eventClassNames={eventClassNames}
            eventContent={(arg) => renderEventContent(arg, buildPatientPaymentTo)}
            select={onSelect}
            eventClick={onEventClick}
            datesSet={onDatesSet}
          />
        </div>
      </div>

        <AppointmentModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelected(null);
            setSlot(null);
          }}
          initialStart={slot?.start}
          initialEnd={slot?.end}
          appointment={selected}
          fixedSpecialistId={effectiveSpecialistId}
          onSaved={() => void refetch()}
        />

        <PatientPaymentHistoryModal
          patientId={paymentPatientId}
          onClose={() => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("paymentPatientId");
              return next;
            });
          }}
        />

        {eventActionOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
            <div
              className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5"
              role="dialog"
              aria-labelledby="event-action-title"
              aria-describedby="event-action-desc"
            >
              <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 pb-4 pt-5 sm:px-6">
                <h3 id="event-action-title" className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  Acción sobre este turno
                </h3>
                <p id="event-action-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
                  {user?.role === "ADMIN"
                    ? "Editá el turno, creá uno nuevo en el mismo horario o eliminá el turno si corresponde."
                    : "Podés agendar una nueva cita en este horario o eliminar el turno. Para modificar una cita ya cargada, contactá a administración."}
                </p>
              </div>
              <div className="space-y-4 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                {user?.role === "ADMIN" && (
                  <button
                    type="button"
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-brand-900/20 transition hover:bg-brand-800 active:translate-y-px active:bg-brand-900 active:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:flex-none sm:min-w-[11rem]"
                    onClick={() => {
                      if (!clickedAppointment) return;
                      setEventActionOpen(false);
                      setClickedAppointment(null);
                      setClickedSlot(null);
                      setSelected(clickedAppointment);
                      setSlot(null);
                      setModalOpen(true);
                    }}
                  >
                      Editar turno
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-bold tracking-tight text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 active:translate-y-px active:border-slate-500 active:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 sm:flex-none sm:min-w-[12.5rem]"
                  onClick={() => {
                    if (!clickedSlot) return;
                    if (effectiveSpecialistId && specialistQ.data) {
                      if (!isSelectionWithinSpecialistAvailability(clickedSlot.start, clickedSlot.end, specialistQ.data)) {
                        setEventActionOpen(false);
                        setClickedAppointment(null);
                        setClickedSlot(null);
                        setUnavailableOpen(true);
                        return;
                      }
                    }
                    setEventActionOpen(false);
                    setClickedAppointment(null);
                    setClickedSlot(null);
                    setSelected(null);
                    setSlot(clickedSlot);
                    setModalOpen(true);
                  }}
                >
                  Nueva cita en este horario
                </button>
                {canDeleteClickedAppointment && (
                  <button
                    type="button"
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border-2 border-rose-400 bg-rose-50 px-4 py-2.5 text-sm font-bold tracking-tight text-rose-900 shadow-sm ring-1 ring-rose-900/10 transition hover:border-rose-500 hover:bg-rose-100 active:translate-y-px active:bg-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 sm:flex-none sm:min-w-[11rem]"
                    onClick={() => {
                      if (!clickedAppointment) return;
                      setDeleteTargetAppointmentId(clickedAppointment.id);
                      setEventActionOpen(false);
                    }}
                  >
                    Eliminar turno
                  </button>
                )}
                </div>
                <div className="flex justify-center border-t border-slate-100 pt-4 sm:justify-end">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 active:translate-y-px active:bg-slate-200"
                    onClick={() => {
                      setEventActionOpen(false);
                      setClickedAppointment(null);
                      setClickedSlot(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {deleteTargetAppointmentId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
            <div
              className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5"
              role="dialog"
              aria-labelledby="delete-appt-title"
            >
              <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 pb-4 pt-5 sm:px-6">
                <h3 id="delete-appt-title" className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  Eliminar turno
                </h3>
              </div>
              <div className="px-5 py-4 sm:px-6">
                <p className="text-sm leading-relaxed text-slate-600">Esta acción eliminará el turno de forma permanente.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:gap-3 sm:px-6">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 active:translate-y-px disabled:opacity-50"
                  disabled={deleteFromActionMut.isPending}
                  onClick={() => setDeleteTargetAppointmentId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-red-900/25 transition hover:bg-red-800 active:translate-y-px active:bg-red-900 active:shadow-sm disabled:opacity-50"
                  disabled={deleteFromActionMut.isPending}
                  onClick={() => {
                    if (!deleteTargetAppointmentId) return;
                    deleteFromActionMut.mutate(deleteTargetAppointmentId);
                  }}
                >
                  {deleteFromActionMut.isPending ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}
        {unavailableOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
            <div
              className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5"
              role="dialog"
              aria-labelledby="unavail-title"
            >
              <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 pb-4 pt-5 sm:px-6">
                <h3 id="unavail-title" className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  Turno no disponible
                </h3>
              </div>
              <div className="px-5 py-4 sm:px-6">
                <p className="text-sm leading-relaxed text-slate-600">
                  El especialista no atiende en ese día y horario. Elegí un horario dentro de un bloque violeta de “franja
                  de atención” en la grilla.
                </p>
              </div>
              <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-5 py-2 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-brand-900/20 transition hover:bg-brand-800 active:translate-y-px active:bg-brand-900 active:shadow-sm"
                  onClick={() => setUnavailableOpen(false)}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
        {showQuickSlots && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-slate-900/5">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-4 sm:px-6">
                <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Turnos directos disponibles</h3>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 active:translate-y-px"
                  onClick={() => setShowQuickSlots(false)}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <div className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setQuickSlotsLimit(5)}
                    className={`inline-flex min-h-10 items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-bold transition active:translate-y-px ${
                      quickSlotsLimit === 5
                        ? "border-slate-800 bg-slate-800 text-white shadow-md"
                        : "border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    Primeros 5
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickSlotsLimit(10)}
                    className={`inline-flex min-h-10 items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-bold transition active:translate-y-px ${
                      quickSlotsLimit === 10
                        ? "border-slate-800 bg-slate-800 text-white shadow-md"
                        : "border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    Primeros 10
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {quickAvailableSlots.length === 0 ? (
                    <p className="text-sm text-slate-500">No hay disponibilidad próxima con la configuración actual.</p>
                  ) : (
                    quickAvailableSlots.map((slotItem, idx) => (
                      <button
                        key={`${slotItem.start.toISOString()}-${idx}`}
                        type="button"
                        className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:translate-y-px"
                        onClick={() => {
                          setShowQuickSlots(false);
                          setSelected(null);
                          setSlot({ start: slotItem.start, end: slotItem.end });
                          setModalOpen(true);
                        }}
                      >
                        {slotItem.label}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
