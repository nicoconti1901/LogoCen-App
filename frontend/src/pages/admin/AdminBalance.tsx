import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppointments, updateAppointment } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import type { Appointment } from "../../types";

type RangePreset = "day" | "week" | "month" | "year" | "custom";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateToIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return e;
}

function parseMoney(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v)}`;
}

function getRangeFromPreset(preset: RangePreset, anchorDate: string, customFrom: string, customTo: string) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  if (preset === "day") return { from: anchorDate, to: anchorDate };
  if (preset === "week") return { from: dateToIsoLocal(startOfWeek(anchor)), to: dateToIsoLocal(endOfWeek(anchor)) };
  if (preset === "month") {
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: dateToIsoLocal(s), to: dateToIsoLocal(e) };
  }
  if (preset === "year") {
    const s = new Date(anchor.getFullYear(), 0, 1);
    const e = new Date(anchor.getFullYear(), 11, 31);
    return { from: dateToIsoLocal(s), to: dateToIsoLocal(e) };
  }
  return { from: customFrom, to: customTo };
}

export function AdminBalancePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = dateToIsoLocal(new Date());
  const [preset, setPreset] = useState<RangePreset>("day");
  const [anchorDate, setAnchorDate] = useState(today);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  if (user?.role !== "ADMIN") return <Navigate to="/agenda" replace />;

  const range = useMemo(
    () => getRangeFromPreset(preset, anchorDate, customFrom, customTo),
    [preset, anchorDate, customFrom, customTo]
  );

  const appointmentsQ = useQuery({
    queryKey: ["balance", range.from, range.to],
    queryFn: () =>
      fetchAppointments({
        from: range.from,
        to: range.to,
      }),
  });

  const settleMut = useMutation({
    mutationFn: async (appointmentIds: string[]) => {
      const now = new Date().toISOString();
      await Promise.all(
        appointmentIds.map((id) =>
          updateAppointment(id, {
            specialistSettledAt: now,
          })
        )
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      await qc.invalidateQueries({ queryKey: ["balance"] });
    },
  });

  const stats = useMemo(() => {
    const rows = (appointmentsQ.data ?? []).filter((a) => a.paymentCompleted);
    let total = 0;
    let toLogoTransfer = 0;
    let toSpecialistTransfer = 0;
    let cashLogo = 0;

    const pendingBySpecialist = new Map<
      string,
      {
        specialistName: string;
        alias: string;
        amountPending: number;
        appointments: Appointment[];
      }
    >();
    let settledSpecialistAmount = 0;

    for (const a of rows) {
      const amount = parseMoney(a.specialist.consultationFee);
      total += amount;

      if (a.paymentMethod === "TRANSFER_TO_LOGOCEN") toLogoTransfer += amount;
      else if (a.paymentMethod === "TRANSFER_TO_SPECIALIST") toSpecialistTransfer += amount;
      else if (a.paymentMethod === "CASH_TO_LOGOCEN") cashLogo += amount;

      if (a.paymentMethod === "TRANSFER_TO_SPECIALIST") {
        if (a.specialistSettledAt) {
          settledSpecialistAmount += amount;
        } else {
          const key = a.specialistId;
          const name = `${a.specialist.lastName}, ${a.specialist.firstName}`;
          const row =
            pendingBySpecialist.get(key) ?? {
              specialistName: name,
              alias: a.specialist.transferAlias ?? "Sin alias",
              amountPending: 0,
              appointments: [],
            };
          row.amountPending += amount;
          row.appointments.push(a);
          pendingBySpecialist.set(key, row);
        }
      }
    }

    return {
      totalConsultas: rows.length,
      totalIngresado: total,
      transferLogo: toLogoTransfer,
      transferSpecialist: toSpecialistTransfer,
      cashLogo,
      settledSpecialistAmount,
      pendingSpecialistAmount: toSpecialistTransfer - settledSpecialistAmount,
      pendingBySpecialist: Array.from(pendingBySpecialist.values()).sort(
        (a, b) => b.amountPending - a.amountPending
      ),
    };
  }, [appointmentsQ.data]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Balance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ingresos, métodos de cobro y rendición a especialistas en una sola vista.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {(["day", "week", "month", "year", "custom"] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                preset === p ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {p === "day" ? "Día" : p === "week" ? "Semanal" : p === "month" ? "Mensual" : p === "year" ? "Anual" : "Rango"}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
          {preset === "custom" && (
            <>
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ingresado</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatMoney(stats.totalIngresado)}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.totalConsultas} consultas con pago realizado</p>
        </article>
        <article className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-sky-700">Transferencia a LogoCen</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{formatMoney(stats.transferLogo)}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Efectivo a LogoCen</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{formatMoney(stats.cashLogo)}</p>
        </article>
        <article className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-violet-700">Transferencia al especialista</p>
          <p className="mt-1 text-2xl font-bold text-violet-900">{formatMoney(stats.transferSpecialist)}</p>
          <p className="mt-1 text-xs text-violet-700">Monto a controlar para rendición</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-700">Pendiente de rendir</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{formatMoney(stats.pendingSpecialistAmount)}</p>
        </article>
        <article className="rounded-xl border border-teal-200 bg-teal-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-teal-700">Ya rendido</p>
          <p className="mt-1 text-2xl font-bold text-teal-900">{formatMoney(stats.settledSpecialistAmount)}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Rendición a especialistas</h2>
        <p className="mt-1 text-sm text-slate-600">
          Lo pendiente se calcula sobre turnos con pago realizado y método transferencia al especialista.
        </p>
        {appointmentsQ.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Calculando balance...</p>
        ) : stats.pendingBySpecialist.length === 0 ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            No hay rendiciones pendientes en el rango seleccionado.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {stats.pendingBySpecialist.map((row) => (
              <div
                key={row.specialistName}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.specialistName}</p>
                  <p className="truncate text-xs text-slate-600">Alias: {row.alias}</p>
                  <p className="text-xs text-slate-500">{row.appointments.length} turnos pendientes</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-amber-800">{formatMoney(row.amountPending)}</p>
                  <button
                    type="button"
                    disabled={settleMut.isPending}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    onClick={() => settleMut.mutate(row.appointments.map((a) => a.id))}
                  >
                    Marcar rendido
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
