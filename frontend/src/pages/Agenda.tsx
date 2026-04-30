import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DateSelectArg, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAppointments, fetchSpecialist } from "../api/endpoints";
import { getAppointmentDateStr, toCalendarEnd, toCalendarStart } from "../lib/appointmentDisplay";
import { AppointmentModal } from "../components/AppointmentModal";
import { useAuth } from "../contexts/AuthContext";
import type { Appointment } from "../types";

const statusLabel: Record<Appointment["status"], string> = {
  RESERVED: "RESERVADO",
  CONFIRMED: "CONFIRMADO",
  ATTENDED: "FINALIZADO",
  CANCELLED: "CANCELÓ",
  NO_SHOW: "NO ASISTIÓ",
};

const CONSULTORIOS_BASE = [
  "Consultorio 1",
  "Consultorio 2",
  "Consultorio 3",
  "Consultorio 4",
  "Consultorio 5",
];

const WORKDAY_START = "07:00";
const WORKDAY_END = "21:00";

function patientNameUpper(lastName: string, firstName: string): string {
  return `${lastName}, ${firstName}`.toUpperCase();
}

function toEvent(a: Appointment): EventInput {
  return {
    id: a.id,
    title: patientNameUpper(a.patient.lastName, a.patient.firstName),
    start: toCalendarStart(a),
    end: toCalendarEnd(a),
    classNames: ["appt-event", `status-${a.status.toLowerCase()}`],
    extendedProps: { raw: a },
  };
}

function renderEventContent(arg: EventContentArg) {
  const raw = arg.event.extendedProps.raw as Appointment | undefined;
  if (!raw) return <span>{arg.event.title}</span>;
  const patient = patientNameUpper(raw.patient.lastName, raw.patient.firstName);
  const specialist = `${raw.specialist.lastName}, ${raw.specialist.firstName}`;
  const consultorio = raw.consultorio;
  return (
    <div className="appt-event-content">
      <div className="appt-event-patient">Pac: {patient}</div>
      <div className="appt-event-specialist">Esp: {specialist}</div>
      <div className="appt-event-office">Cons: {consultorio}</div>
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHHmm(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function AgendaPage() {
  const { user } = useAuth();
  const { specialistId: routeSpecialistId } = useParams<{ specialistId?: string }>();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [eventActionOpen, setEventActionOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [clickedAppointment, setClickedAppointment] = useState<Appointment | null>(null);
  const [clickedSlot, setClickedSlot] = useState<{ start: Date; end: Date } | null>(null);

  const specialistQ = useQuery({
    queryKey: ["specialist", routeSpecialistId],
    queryFn: () => fetchSpecialist(routeSpecialistId!),
    enabled: Boolean(routeSpecialistId),
  });

  const { data = [], refetch } = useQuery({
    queryKey: ["appointments", range?.from, range?.to, routeSpecialistId],
    queryFn: () =>
      fetchAppointments({
        from: range!.from,
        to: range!.to,
        ...(routeSpecialistId ? { specialistId: routeSpecialistId } : {}),
      }),
    enabled: Boolean(range),
  });

  const visibleAppointments = useMemo(
    () => (routeSpecialistId ? data.filter((a) => a.specialistId === routeSpecialistId) : data),
    [data, routeSpecialistId]
  );

  const onDatesSet = useCallback((arg: { start: Date; end: Date }) => {
    setRange({
      from: arg.start.toISOString(),
      to: arg.end.toISOString(),
    });
  }, []);

  const events = visibleAppointments.map(toEvent);

  const consultorioSituations = useMemo(() => {
    const today = todayStr();
    const now = nowHHmm();
    const startMin = hhmmToMinutes(WORKDAY_START);
    const endMin = hhmmToMinutes(WORKDAY_END);
    const byOffice = new Map<
      string,
      {
        count: number;
        occupiedNow: boolean;
        next?: Appointment;
        freeRanges: string[];
        occupiedRanges: Array<{ start: number; end: number }>;
      }
    >();

    const todays = visibleAppointments.filter((a) => getAppointmentDateStr(a) === today);
    for (const a of todays) {
      const office = a.consultorio?.trim() || "Sin consultorio";
      const row = byOffice.get(office) ?? {
        count: 0,
        occupiedNow: false,
        freeRanges: [],
        occupiedRanges: [],
      };

      const blocksOffice = a.status !== "CANCELLED";
      if (blocksOffice) {
        row.count += 1;
        row.occupiedRanges.push({
          start: hhmmToMinutes(a.startTime),
          end: hhmmToMinutes(a.endTime),
        });
      }

      const blocksNow =
        blocksOffice &&
        a.status !== "NO_SHOW" &&
        a.status !== "ATTENDED" &&
        a.startTime <= now &&
        a.endTime > now;
      if (blocksNow) row.occupiedNow = true;

      const canBeNext =
        a.status !== "CANCELLED" &&
        a.status !== "NO_SHOW" &&
        a.startTime >= now;
      if (canBeNext) {
        if (!row.next || a.startTime < row.next.startTime) row.next = a;
      }

      byOffice.set(office, row);
    }

    const offices = Array.from(
      new Set([...CONSULTORIOS_BASE, ...Array.from(byOffice.keys())])
    );

    return offices
      .map((office) => {
        const s = byOffice.get(office) ?? {
          count: 0,
          occupiedNow: false,
          next: undefined,
          freeRanges: [],
          occupiedRanges: [],
        };

        const merged = s.occupiedRanges
          .filter((r) => r.end > r.start)
          .sort((a, b) => a.start - b.start)
          .reduce<Array<{ start: number; end: number }>>((acc, cur) => {
            const last = acc[acc.length - 1];
            if (!last || cur.start > last.end) {
              acc.push({ ...cur });
            } else if (cur.end > last.end) {
              last.end = cur.end;
            }
            return acc;
          }, []);

        const free: string[] = [];
        let cursor = startMin;
        for (const r of merged) {
          const rs = Math.max(startMin, r.start);
          const re = Math.min(endMin, r.end);
          if (rs > cursor) free.push(`${minutesToHHmm(cursor)}-${minutesToHHmm(rs)}`);
          cursor = Math.max(cursor, re);
        }
        if (cursor < endMin) free.push(`${minutesToHHmm(cursor)}-${minutesToHHmm(endMin)}`);
        if (free.length === 0) free.push("Sin huecos");

        return { office, ...s, freeRanges: free };
      })
      .sort((a, b) => a.office.localeCompare(b.office));
  }, [visibleAppointments]);

  function onSelect(sel: DateSelectArg) {
    setSelected(null);
    setSlot({ start: sel.start, end: sel.end });
    setModalOpen(true);
  }

  function onEventClick(info: EventClickArg) {
    const raw = info.event.extendedProps.raw as Appointment | undefined;
    if (!raw) return;
    if (user?.role === "SPECIALIST" && user.specialistId && raw.specialistId !== user.specialistId) return;
    if (routeSpecialistId && raw.specialistId !== routeSpecialistId) return;

    const start = info.event.start;
    if (!start) return;
    const end = info.event.end ?? new Date(start.getTime() + 30 * 60 * 1000);
    setClickedAppointment(raw);
    setClickedSlot({ start, end });
    setEventActionOpen(true);
  }

  const specialistLabel = specialistQ.data
    ? `${specialistQ.data.lastName}, ${specialistQ.data.firstName}`
    : null;

  return (
    <div className="agenda-page-bg agenda-page-fullbleed">
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:px-6">
      <div>
        {routeSpecialistId && (
          <div className="mb-3">
            <Link
              to="/specialists"
              className="text-sm font-medium text-cyan-200 hover:text-cyan-100 hover:underline"
            >
              ← Volver a especialistas
            </Link>
          </div>
        )}
        <h1 className="text-2xl font-semibold text-slate-50 drop-shadow-sm">
          {routeSpecialistId ? (
            <>
              Agenda
              {specialistLabel && (
                <span className="block text-base font-normal text-slate-200 sm:inline sm:before:content-['_—_']">
                  {specialistLabel}
                </span>
              )}
            </>
          ) : (
            "Agenda"
          )}
        </h1>
        <p className="max-w-4xl text-slate-200/90">
          {routeSpecialistId
            ? "Turnos asignados a este especialista. Pulse un horario o un evento para crear o editar."
            : "Seleccione un horario para crear una cita o pulse un evento para editarlo."}
        </p>
      </div>
      <div className="agenda-light rounded-2xl border border-slate-200/60 p-3 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.45)]">
        <div className="mb-3 rounded-xl border border-slate-200/80 bg-white/65 p-3 backdrop-blur-[3px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Situación de consultorios (hoy)</h2>
            <span className="text-xs text-slate-500">{todayStr()}</span>
          </div>
          {consultorioSituations.length === 0 ? (
            <p className="text-xs text-slate-500">No hay turnos cargados para hoy en esta vista.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {consultorioSituations.map((c) => (
                <div key={c.office} className="rounded-lg border border-slate-200/90 bg-white/78 px-3 py-2 backdrop-blur-[2px]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">{c.office}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        c.occupiedNow
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {c.occupiedNow ? "Ocupado" : "Libre"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Turnos hoy: {c.count}</p>
                  <p className="text-xs text-slate-500">
                    Próximo:{" "}
                    {c.next
                      ? `${c.next.startTime} · ${patientNameUpper(c.next.patient.lastName, c.next.patient.firstName)}`
                      : "Sin próximos"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Libres: <span className="font-medium">{c.freeRanges.join(" | ")}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {(Object.keys(statusLabel) as Appointment["status"][]).map((s) => (
            <span key={s} className={`agenda-pill status-${s.toLowerCase()}`}>
              {statusLabel[s]}
            </span>
          ))}
        </div>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locale={esLocale}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={false}
          height="auto"
          nowIndicator
          expandRows
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          selectable
          selectMirror
          dayMaxEvents
          weekends
          events={events}
          eventContent={renderEventContent}
          select={onSelect}
          eventClick={onEventClick}
          datesSet={onDatesSet}
        />
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
          fixedSpecialistId={routeSpecialistId}
          onSaved={() => void refetch()}
        />

        {eventActionOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">Acción sobre este turno</h3>
              <p className="mt-1 text-sm text-slate-600">
                Podés editar la cita actual o crear una nueva en el mismo horario.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
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
                  Editar cita
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    if (!clickedSlot) return;
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
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
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
        )}
      </div>
    </div>
  );
}
