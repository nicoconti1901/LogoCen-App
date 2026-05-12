import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFinanceExpense,
  deleteFinanceExpense,
  fetchAppointments,
  fetchFinanceExpenses,
  updateAppointment,
  updateFinanceExpense,
} from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import type { Appointment, FinanceExpense, FinanceExpenseType } from "../../types";
import { formatPersonDisplayLastFirst } from "../../lib/personName";

type RangePreset = "day" | "week" | "month" | "year" | "custom";
type DetailModalKind =
  | "INGRESADO"
  | "TRANSFER_LOGO"
  | "CASH_LOGO"
  | "TRANSFER_SPECIALIST"
  | "PENDING_SETTLEMENT"
  | "SETTLED_SETTLEMENT"
  | "FIXED_MONTHLY"
  | "MONTHLY_VARIABLE";

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
  const [detailKind, setDetailKind] = useState<DetailModalKind | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<{
    id: string | null;
    type: FinanceExpenseType;
    description: string;
    amount: string;
    expenseDate: string;
  }>({
    id: null,
    type: "FIXED_MONTHLY",
    description: "",
    amount: "",
    expenseDate: today,
  });

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

  const selectedMonth = useMemo(() => anchorDate.slice(0, 7), [anchorDate]);
  const financeExpensesQ = useQuery({
    queryKey: ["finance-expenses", selectedMonth],
    queryFn: () => fetchFinanceExpenses({ month: selectedMonth }),
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

  const saveExpenseMut = useMutation({
    mutationFn: async () => {
      const payload = {
        type: expenseDraft.type,
        description: expenseDraft.description.trim(),
        amount: parseMoney(expenseDraft.amount),
        expenseDate: expenseDraft.expenseDate,
      };
      if (expenseDraft.id) {
        return updateFinanceExpense(expenseDraft.id, payload);
      }
      return createFinanceExpense(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance-expenses"] });
      setExpenseDraft({
        id: null,
        type: "FIXED_MONTHLY",
        description: "",
        amount: "",
        expenseDate: today,
      });
    },
  });

  const deleteExpenseMut = useMutation({
    mutationFn: deleteFinanceExpense,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance-expenses"] });
    },
  });

  const stats = useMemo(() => {
    const rows = (appointmentsQ.data ?? []).filter((a) => a.paymentCompleted);
    const transferLogoAppointments: Appointment[] = [];
    const cashLogoAppointments: Appointment[] = [];
    const transferSpecialistAppointments: Appointment[] = [];
    const pendingSpecialistAppointments: Appointment[] = [];
    const settledSpecialistAppointments: Appointment[] = [];
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

      if (a.paymentMethod === "TRANSFER_TO_LOGOCEN") transferLogoAppointments.push(a);
      else if (a.paymentMethod === "CASH_TO_LOGOCEN") cashLogoAppointments.push(a);
      else if (a.paymentMethod === "TRANSFER_TO_SPECIALIST") transferSpecialistAppointments.push(a);

      if (a.paymentMethod === "TRANSFER_TO_SPECIALIST") {
        if (a.specialistSettledAt) {
          settledSpecialistAmount += amount;
          settledSpecialistAppointments.push(a);
        } else {
          pendingSpecialistAppointments.push(a);
          const key = a.specialistId;
          const name = formatPersonDisplayLastFirst(a.specialist.lastName, a.specialist.firstName);
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

    const expenses = financeExpensesQ.data ?? [];
    const fixedExpenses = expenses.filter((x) => x.type === "FIXED_MONTHLY");
    const variableExpenses = expenses.filter((x) => x.type === "MONTHLY_VARIABLE");
    const fixedMonthlyExpense = fixedExpenses.reduce((acc, x) => acc + parseMoney(x.amount), 0);
    const variableMonthlyExpense = variableExpenses.reduce((acc, x) => acc + parseMoney(x.amount), 0);
    const monthlyExpenseApplied = preset === "month" ? fixedMonthlyExpense + variableMonthlyExpense : 0;

    return {
      totalConsultas: rows.length,
      totalIngresado: total,
      fixedMonthlyExpense,
      variableMonthlyExpense,
      expenses,
      fixedExpenses,
      variableExpenses,
      monthlyExpenseApplied,
      totalNeto: total - monthlyExpenseApplied,
      ingresosAppointments: rows,
      transferLogoAppointments,
      cashLogoAppointments,
      transferSpecialistAppointments,
      pendingSpecialistAppointments,
      settledSpecialistAppointments,
      transferLogo: toLogoTransfer,
      transferSpecialist: toSpecialistTransfer,
      cashLogo,
      settledSpecialistAmount,
      pendingSpecialistAmount: toSpecialistTransfer - settledSpecialistAmount,
      pendingBySpecialist: Array.from(pendingBySpecialist.values()).sort(
        (a, b) => b.amountPending - a.amountPending
      ),
    };
  }, [appointmentsQ.data, financeExpensesQ.data, preset]);

  const detailRows: FinanceExpense[] =
    detailKind === "FIXED_MONTHLY"
      ? stats.fixedExpenses
      : detailKind === "MONTHLY_VARIABLE"
      ? stats.variableExpenses
      : [];

  const appointmentDetailRows: Appointment[] =
    detailKind === "INGRESADO"
      ? stats.ingresosAppointments
      : detailKind === "TRANSFER_LOGO"
      ? stats.transferLogoAppointments
      : detailKind === "CASH_LOGO"
      ? stats.cashLogoAppointments
      : detailKind === "TRANSFER_SPECIALIST"
      ? stats.transferSpecialistAppointments
      : detailKind === "PENDING_SETTLEMENT"
      ? stats.pendingSpecialistAppointments
      : detailKind === "SETTLED_SETTLEMENT"
      ? stats.settledSpecialistAppointments
      : [];

  const detailTitle =
    detailKind === "INGRESADO"
      ? "Detalle de ingresado"
      : detailKind === "TRANSFER_LOGO"
      ? "Detalle de transferencias a LogoCen"
      : detailKind === "CASH_LOGO"
      ? "Detalle de efectivo a LogoCen"
      : detailKind === "TRANSFER_SPECIALIST"
      ? "Detalle de transferencias a especialistas"
      : detailKind === "PENDING_SETTLEMENT"
      ? "Detalle pendiente de rendir"
      : detailKind === "SETTLED_SETTLEMENT"
      ? "Detalle ya rendido"
      : detailKind === "FIXED_MONTHLY"
      ? "Detalle gasto mensual fijo"
      : detailKind === "MONTHLY_VARIABLE"
      ? "Detalle gasto mensual no fijo"
      : "";

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
        <button
          type="button"
          onClick={() => setDetailKind("INGRESADO")}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-slate-500">Ingresado</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatMoney(stats.totalIngresado)}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.totalConsultas} consultas con pago realizado</p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("FIXED_MONTHLY")}
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-rose-700">Gasto mensual fijo</p>
          <p className="mt-1 text-2xl font-bold text-rose-900">{formatMoney(stats.fixedMonthlyExpense)}</p>
          <p className="mt-1 text-xs text-rose-700">
            Click para ver detalle ({stats.fixedExpenses.length} gasto/s).
          </p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("MONTHLY_VARIABLE")}
          className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-orange-700">Gasto mensual</p>
          <p className="mt-1 text-2xl font-bold text-orange-900">{formatMoney(stats.variableMonthlyExpense)}</p>
          <p className="mt-1 text-xs text-orange-700">
            No fijo. Click para ver detalle ({stats.variableExpenses.length} gasto/s).
          </p>
        </button>
        <article className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-indigo-700">
            {preset === "month" ? "Neto mensual (ingresos - gastos del mes)" : "Neto del rango"}
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{formatMoney(stats.totalNeto)}</p>
        </article>
        <button
          type="button"
          onClick={() => setDetailKind("TRANSFER_LOGO")}
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-sky-700">Transferencia a LogoCen</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{formatMoney(stats.transferLogo)}</p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("CASH_LOGO")}
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-emerald-700">Efectivo a LogoCen</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{formatMoney(stats.cashLogo)}</p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("TRANSFER_SPECIALIST")}
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-violet-700">Transferencia al especialista</p>
          <p className="mt-1 text-2xl font-bold text-violet-900">{formatMoney(stats.transferSpecialist)}</p>
          <p className="mt-1 text-xs text-violet-700">Monto a controlar para rendición</p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("PENDING_SETTLEMENT")}
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-amber-700">Pendiente de rendir</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{formatMoney(stats.pendingSpecialistAmount)}</p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("SETTLED_SETTLEMENT")}
          className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-teal-700">Ya rendido</p>
          <p className="mt-1 text-2xl font-bold text-teal-900">{formatMoney(stats.settledSpecialistAmount)}</p>
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Gestión de gastos mensuales</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cargá gastos del mes diferenciando fijo mensual y mensual no fijo.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveExpenseMut.mutate();
          }}
        >
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipo</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={expenseDraft.type}
              onChange={(e) =>
                setExpenseDraft((prev) => ({ ...prev, type: e.target.value as FinanceExpenseType }))
              }
              disabled={saveExpenseMut.isPending}
            >
              <option value="FIXED_MONTHLY">Gasto mensual fijo</option>
              <option value="MONTHLY_VARIABLE">Gasto mensual (no fijo)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Descripción</span>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={expenseDraft.description}
              onChange={(e) => setExpenseDraft((prev) => ({ ...prev, description: e.target.value }))}
              required
              disabled={saveExpenseMut.isPending}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Monto</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={expenseDraft.amount}
              onChange={(e) => setExpenseDraft((prev) => ({ ...prev, amount: e.target.value }))}
              required
              disabled={saveExpenseMut.isPending}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Fecha</span>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={expenseDraft.expenseDate}
              onChange={(e) => setExpenseDraft((prev) => ({ ...prev, expenseDate: e.target.value }))}
              required
              disabled={saveExpenseMut.isPending}
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saveExpenseMut.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {expenseDraft.id ? "Guardar cambios" : "Agregar gasto"}
          </button>
          {expenseDraft.id && (
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() =>
                setExpenseDraft({ id: null, type: "FIXED_MONTHLY", description: "", amount: "", expenseDate: today })
              }
            >
              Cancelar edición
            </button>
          )}
          </div>
        </form>
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

      {detailKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-5 shadow-xl ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{detailTitle}</h3>
              <button
                type="button"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 active:translate-y-px"
                onClick={() => setDetailKind(null)}
              >
                Cerrar
              </button>
            </div>
            {(detailKind === "FIXED_MONTHLY" || detailKind === "MONTHLY_VARIABLE") && (
              <>
                {detailRows.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No hay gastos para mostrar en este mes.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {detailRows.map((x) => (
                      <div
                        key={x.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{x.description}</p>
                          <p className="text-xs text-slate-600">{x.expenseDate.slice(0, 10)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">{formatMoney(parseMoney(x.amount))}</p>
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setExpenseDraft({
                                id: x.id,
                                type: x.type,
                                description: x.description,
                                amount: x.amount,
                                expenseDate: x.expenseDate.slice(0, 10),
                              });
                              setDetailKind(null);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            disabled={deleteExpenseMut.isPending}
                            onClick={() => deleteExpenseMut.mutate(x.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {detailKind !== "FIXED_MONTHLY" && detailKind !== "MONTHLY_VARIABLE" && (
              <>
                {appointmentDetailRows.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No hay movimientos para mostrar.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {appointmentDetailRows.map((a) => {
                      const specialistName = formatPersonDisplayLastFirst(a.specialist.lastName, a.specialist.firstName);
                      const patientName = formatPersonDisplayLastFirst(a.patient.lastName, a.patient.firstName);
                      const amount = parseMoney(a.specialist.consultationFee);
                      return (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{patientName}</p>
                            <p className="truncate text-xs text-slate-600">Especialista: {specialistName}</p>
                            <p className="text-xs text-slate-500">{a.appointmentDate.slice(0, 10)}</p>
                          </div>
                          <p className="text-sm font-bold text-slate-900">{formatMoney(amount)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
