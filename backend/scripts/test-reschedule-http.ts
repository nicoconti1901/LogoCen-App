/**
 * Prueba HTTP local (como el frontend). Requiere: npm run dev en :4000
 */
import "dotenv/config";
import { Role } from "@prisma/client";
import { prisma } from "../src/config/database.js";
import { signToken } from "../src/utils/jwt.js";
import * as fixedService from "../src/services/fixedAppointmentSeries.service.js";
import { formatDateOnlyISO, toDateOnly, weekdayFromDate } from "../src/utils/appointmentTime.js";

const API = "http://localhost:4000/api";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (!admin) throw new Error("Sin usuario admin");

  const token = signToken({
    sub: admin.id,
    role: admin.role,
    specialistId: admin.specialistId,
  });
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let series = await prisma.fixedAppointmentSeries.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });

  if (!series) {
    const specialist = await prisma.specialist.findFirst({ where: { active: true } });
    const patient = await prisma.patient.findFirst();
    if (!specialist || !patient) throw new Error("Sin datos seed");
    const fromDate = formatDateOnlyISO(toDateOnly(new Date()));
    const created = await fixedService.createFixedAppointmentSeries(
      {
        patientId: patient.id,
        specialistId: specialist.id,
        consultorio: "Consultorio 1",
        date: fromDate,
        startTime: "11:00",
        displayDurationMinutes: 30,
      },
      Role.ADMIN,
      null
    );
    series = await prisma.fixedAppointmentSeries.findUniqueOrThrow({ where: { id: created.id } });
  }

  const fromDate = formatDateOnlyISO(toDateOnly(new Date()));
  const payload = {
    consultorio: series.consultorio,
    startTime: series.startTime,
    displayDurationMinutes: series.displayDurationMinutes,
    effectiveUntil: null,
    fromDate,
  };

  console.log("PATCH series", series.id, payload);

  const t0 = Date.now();
  const res = await fetch(`${API}/appointments/fixed-series/${series.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  console.log("Status:", res.status, "ms:", Date.now() - t0);

  if (!res.ok) {
    console.error("❌ HTTP FALLO:", body);
    process.exit(1);
  }

  console.log("✅ HTTP reschedule OK →", (body as { id: string }).id);

  // Probar GET con id viejo (debe resolver a activa si existe)
  const oldId = series.id;
  const getRes = await fetch(`${API}/appointments/fixed-series/${oldId}`, { headers });
  const getBody = await getRes.json();
  console.log("GET id viejo activo?", getRes.status, getBody?.id === (body as { id: string }).id ? "resuelve nueva" : getBody);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
