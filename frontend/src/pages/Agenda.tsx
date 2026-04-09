import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DateSelectArg, EventClickArg, EventInput } from "@fullcalendar/core";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAppointments, fetchSpecialist } from "../api/endpoints";
import { toCalendarEnd, toCalendarStart } from "../lib/appointmentDisplay";
import { AppointmentModal } from "../components/AppointmentModal";
import type { Appointment } from "../types";

function toEvent(a: Appointment): EventInput {
  let color = "#0284c7";
  if (a.status === "ATTENDED") color = "#16a34a";
  if (a.status === "CANCELLED" || a.status === "NO_SHOW") color = "#94a3b8";
  if (a.status === "CONFIRMED") color = "#7c3aed";
  return {
    id: a.id,
    title: `${a.patient.lastName}, ${a.patient.firstName}`,
    start: toCalendarStart(a),
    end: toCalendarEnd(a),
    backgroundColor: color,
    borderColor: color,
    extendedProps: { raw: a },
  };
}

export function AgendaPage() {
  const { specialistId: routeSpecialistId } = useParams<{ specialistId?: string }>();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

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

  const onDatesSet = useCallback((arg: { start: Date; end: Date }) => {
    setRange({
      from: arg.start.toISOString(),
      to: arg.end.toISOString(),
    });
  }, []);

  const events = data.map(toEvent);

  function onSelect(sel: DateSelectArg) {
    setSelected(null);
    setSlot({ start: sel.start, end: sel.end });
    setModalOpen(true);
  }

  function onEventClick(info: EventClickArg) {
    const raw = info.event.extendedProps.raw as Appointment | undefined;
    if (raw) {
      setSlot(null);
      setSelected(raw);
      setModalOpen(true);
    }
  }

  const specialistLabel = specialistQ.data
    ? `${specialistQ.data.lastName}, ${specialistQ.data.firstName}`
    : null;

  return (
    <div className="space-y-4">
      <div>
        {routeSpecialistId && (
          <div className="mb-3">
            <Link
              to="/specialists"
              className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              ← Volver a especialistas
            </Link>
          </div>
        )}
        <h1 className="text-2xl font-semibold text-slate-900">
          {routeSpecialistId ? (
            <>
              Agenda
              {specialistLabel && (
                <span className="block text-base font-normal text-slate-600 sm:inline sm:before:content-['_—_']">
                  {specialistLabel}
                </span>
              )}
            </>
          ) : (
            "Agenda"
          )}
        </h1>
        <p className="text-slate-600">
          {routeSpecialistId
            ? "Turnos asignados a este especialista. Pulse un horario o un evento para crear o editar."
            : "Seleccione un horario para crear una cita o pulse un evento para editarlo."}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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
          selectable
          selectMirror
          dayMaxEvents
          weekends
          events={events}
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
    </div>
  );
}
