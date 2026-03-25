import { formatDateOnlyISO } from "./appointmentTime.js";

type AppointmentLike = {
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  medicalRecord: string | null;
  reasonForVisit: string | null;
};

/** Respuesta API: `date`, `time`, `medical_record`, `reason_for_visit` según especificación */
export function enrichAppointment<T extends AppointmentLike>(a: T) {
  return {
    ...a,
    date: formatDateOnlyISO(new Date(a.appointmentDate)),
    time: { start: a.startTime, end: a.endTime },
    medical_record: a.medicalRecord ?? null,
    reason_for_visit: a.reasonForVisit ?? null,
  };
}
