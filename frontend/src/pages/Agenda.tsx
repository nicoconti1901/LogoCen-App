import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DateSelectArg, EventClickArg, EventInput } from "@fullcalendar/core";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAppointments } from "../api/endpoints";
import { AppointmentModal } from "../components/AppointmentModal";
import type { Appointment } from "../types";

function toEvent(a: Appointment): EventInput {
  let color = "#0284c7";
  if (a.status === "COMPLETED") color = "#16a34a";
  if (a.status === "CANCELLED") color = "#94a3b8";
  return {
    id: a.id,
    title: `${a.patient.lastName}, ${a.patient.firstName}`,
    start: a.startAt,
    end: a.endAt,
    backgroundColor: color,
    borderColor: color,
    extendedProps: { raw: a },
  };
}

export function AgendaPage() {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const { data = [], refetch } = useQuery({
    queryKey: ["appointments", range?.from, range?.to],
    queryFn: () =>
      fetchAppointments({
        from: range!.from,
        to: range!.to,
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>
        <p className="text-slate-600">Seleccione un horario para crear una cita o pulse un evento para editarlo.</p>
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
        onSaved={() => void refetch()}
      />
    </div>
  );
}
