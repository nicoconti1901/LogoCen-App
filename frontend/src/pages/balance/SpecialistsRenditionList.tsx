import { Navigate, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAppointments, fetchConsultorioRentMonths, fetchSpecialists } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { formatPersonDisplayLastFirst } from "../../lib/personName";
import type { Specialist } from "../../types";
import { dateToIsoLocal, formatMoney, getRangeFromPreset, parseMoney } from "./balanceUtils";
import { groupAppointmentsBySpecialist, summarizeAppointments } from "./renditionStats";

function monthRange(month: string): { from: string; to: string } {
  return getRangeFromPreset("month", `${month}-01`, "", "");
}

export function SpecialistsRenditionListPage() {
  const { user } = useAuth();
  const [anchorMonth, setAnchorMonth] = useState(() => dateToIsoLocal(new Date()).slice(0, 7));

  if (user?.role !== "ADMIN") return <Navigate to="/agenda" replace />;

  const range = useMemo(() => monthRange(anchorMonth), [anchorMonth]);

  const specialistsQ = useQuery({
    queryKey: ["specialists", "balance-rendition-list"],
    queryFn: () => fetchSpecialists(true),
  });

  const appointmentsQ = useQuery({
    queryKey: ["balance-rendition-list", range.from, range.to],
    queryFn: () => fetchAppointments({ from: range.from, to: range.to }),
  });

  const rentMonthsQ = useQuery({
    queryKey: ["consultorio-rent-months", anchorMonth, "all"],
    queryFn: () => fetchConsultorioRentMonths({ month: anchorMonth }),
  });

  const rows = specialistsQ.data ?? [];
  const bySpecialist = useMemo(
    () => groupAppointmentsBySpecialist(appointmentsQ.data ?? []),
    [appointmentsQ.data]
  );

  const rentBySpecialistId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rentMonthsQ.data?.rows ?? []) {
      map.set(r.specialistId, parseMoney(r.amount));
    }
    return map;
  }, [rentMonthsQ.data]);

  const cards = useMemo(() => {
    return rows.map((s) => {
      const appts = bySpecialist.get(s.id) ?? [];
      const stats = summarizeAppointments(appts);
      const rent = rentBySpecialistId.get(s.id) ?? parseMoney(s.monthlyConsultorioRent ?? undefined);
      return { specialist: s, stats, rent };
    });
  }, [rows, bySpecialist, rentBySpecialistId]);

  const isLoading = specialistsQ.isLoading || appointmentsQ.isLoading || rentMonthsQ.isLoading;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Rendiciones por especialista</h2>
        <label className="mt-4 block max-w-xs text-sm">
          <span className="font-medium text-slate-600">Mes</span>
          <input
            type="month"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={anchorMonth}
            onChange={(e) => setAnchorMonth(e.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Período: {range.from} al {range.to}
        </p>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
          Cargando resúmenes…
        </p>
      ) : cards.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
          No hay especialistas cargados.
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cards.map(({ specialist: s, stats, rent }) => (
            <SpecialistRenditionCard key={s.id} specialist={s} stats={stats} rent={rent} month={anchorMonth} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SpecialistRenditionCard({
  specialist: s,
  stats,
  rent,
  month,
}: {
  specialist: Specialist;
  stats: ReturnType<typeof summarizeAppointments>;
  rent: number;
  month: string;
}) {
  const name = formatPersonDisplayLastFirst(s.lastName, s.firstName);
  const hasActivity = stats.totalTurnos > 0;

  return (
    <li>
      <Link
        to={`/balance/especialistas/${s.id}`}
        className={`group block overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md ${
          hasActivity
            ? "border-slate-200 bg-white hover:border-brand-300"
            : "border-dashed border-slate-300 bg-slate-50/80"
        }`}
      >
        <div
          className={`border-b px-4 py-3 ${
            hasActivity
              ? "border-brand-100 bg-gradient-to-r from-brand-50/90 to-white"
              : "border-slate-200 bg-slate-100/80"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900 group-hover:text-brand-800">{name}</p>
              <p className="text-sm text-slate-600">{s.specialty}</p>
              {!s.active && (
                <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                  Inactivo
                </span>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white opacity-90 group-hover:opacity-100">
              Ver detalle →
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          <MetricPill
            label="Pacientes atendidos"
            value={String(stats.uniquePatientsAttended)}
            sub={`${stats.attendedCount} finalizados`}
            tone="slate"
          />
          <MetricPill label="Turnos" value={String(stats.totalTurnos)} sub="en el mes" tone="slate" />
          <MetricPill
            label="Cobrado"
            value={formatMoney(stats.honorariosCobrados)}
            sub="imputado"
            tone="emerald"
          />
          <MetricPill
            label="Deuda pacientes"
            value={formatMoney(stats.deudasTotal)}
            sub={stats.conDeuda > 0 ? `${stats.conDeuda} turno/s` : "al día"}
            tone={stats.deudasTotal > 0 ? "amber" : "slate"}
          />
          <MetricPill label="Alquiler consultorio" value={formatMoney(rent)} sub={`mes ${month}`} tone="sky" />
          {stats.pendingSettlementCount > 0 ? (
            <MetricPill
              label="Sin rendir"
              value={String(stats.pendingSettlementCount)}
              sub="transfer. al esp."
              tone="violet"
            />
          ) : (
            <MetricPill label="Rendición" value="OK" sub="transferencias" tone="slate" />
          )}
        </div>
      </Link>
    </li>
  );
}

function MetricPill({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "slate" | "emerald" | "amber" | "sky" | "violet";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50",
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    sky: "border-sky-200 bg-sky-50",
    violet: "border-violet-200 bg-violet-50",
  }[tone];

  const valueClass = {
    slate: "text-slate-900",
    emerald: "text-emerald-950",
    amber: "text-amber-950",
    sky: "text-sky-950",
    violet: "text-violet-950",
  }[tone];

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-bold leading-tight ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}
