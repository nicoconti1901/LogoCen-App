type AppointmentLike = {
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  paymentDate?: Date | null;
  medicalRecord: string | null;
  reasonForVisit: string | null;
};

/** Respuesta API: `date`, `time`, `medical_record`, `reason_for_visit` según especificación */
export function enrichAppointment<T extends AppointmentLike>(a: T) {
  return {
    ...a,
    // @db.Date llega como Date en UTC (00:00Z). Si se formatea en hora local
    // puede correrse al día anterior en zonas horarias negativas.
    date: a.appointmentDate.toISOString().slice(0, 10),
    paymentDate: a.paymentDate ? a.paymentDate.toISOString().slice(0, 10) : null,
    time: { start: a.startTime, end: a.endTime },
    medical_record: a.medicalRecord ?? null,
    reason_for_visit: a.reasonForVisit ?? null,
  };
}
