import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFinanceExpense,
  deleteFinanceExpense,
  fetchConsultorioRentMonths,
  fetchFinanceExpenses,
  updateFinanceExpense,
} from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import type { FinanceExpense, FinanceExpenseType, SpecialistConsultorioRentMonthRow } from "../../types";
import { FormFieldError, invalidFieldClass } from "../../components/FormFieldError";
import { formatPersonDisplayLastFirst } from "../../lib/personName";
import { type ExpenseFormFields, type FieldErrors, validateExpenseForm } from "../../lib/validation";
import {
  dateToIsoLocal,
  formatMoney,
  parseMoney,
} from "./balanceUtils";

type DetailModalKind = "FIXED_MONTHLY" | "MONTHLY_VARIABLE" | null;

export function AdminOfficeRenditionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = dateToIsoLocal(new Date());
  const [anchorMonth, setAnchorMonth] = useState(today.slice(0, 7));
  const [detailKind, setDetailKind] = useState<DetailModalKind>(null);
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ExpenseFormFields>>({});

  useEffect(() => {
    if (!expenseDraft.id && expenseDraft.type === "FIXED_MONTHLY") {
      setExpenseDraft((prev) => ({ ...prev, expenseDate: `${anchorMonth}-01` }));
    }
  }, [anchorMonth, expenseDraft.type, expenseDraft.id]);

  if (user?.role !== "ADMIN") return <Navigate to="/agenda" replace />;

  const monthStart = `${anchorMonth}-01`;
  const monthEndDate = new Date(`${anchorMonth}-01T12:00:00`);
  monthEndDate.setMonth(monthEndDate.getMonth() + 1);
  monthEndDate.setDate(0);
  const monthEnd = dateToIsoLocal(monthEndDate);

  const rentMonthsQ = useQuery({
    queryKey: ["consultorio-rent-months", anchorMonth],
    queryFn: () => fetchConsultorioRentMonths({ month: anchorMonth }),
  });

  const financeExpensesQ = useQuery({
    queryKey: ["finance-expenses", anchorMonth],
    queryFn: () => fetchFinanceExpenses({ month: anchorMonth }),
  });

  const rentIncomeTotal = useMemo(() => parseMoney(rentMonthsQ.data?.total), [rentMonthsQ.data?.total]);

  const stats = useMemo(() => {
    const expenses = financeExpensesQ.data ?? [];
    const fixedExpenses = expenses.filter((x) => x.type === "FIXED_MONTHLY");
    const variableExpenses = expenses.filter((x) => x.type === "MONTHLY_VARIABLE");
    const fixedMonthlyExpense = fixedExpenses.reduce((acc, x) => acc + parseMoney(x.amount), 0);
    const variableMonthlyExpense = variableExpenses.reduce((acc, x) => acc + parseMoney(x.amount), 0);
    const totalExpenses = fixedMonthlyExpense + variableMonthlyExpense;
    return {
      expenses,
      fixedExpenses,
      variableExpenses,
      fixedMonthlyExpense,
      variableMonthlyExpense,
      totalExpenses,
      net: rentIncomeTotal - totalExpenses,
    };
  }, [financeExpensesQ.data, rentIncomeTotal]);

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

  const detailRows: FinanceExpense[] =
    detailKind === "FIXED_MONTHLY"
      ? stats.fixedExpenses
      : detailKind === "MONTHLY_VARIABLE"
        ? stats.variableExpenses
        : [];

  const detailTitle =
    detailKind === "FIXED_MONTHLY"
      ? "Detalle gasto mensual fijo"
      : detailKind === "MONTHLY_VARIABLE"
        ? "Detalle gasto mensual no fijo"
        : "";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Rendición LogoCen</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ingresos: alquiler de consultorio por mes (se genera automático: cada mes toma el monto del mes anterior o el
          valor base del especialista). Los gastos fijos vigentes se suman en cada mes; los no fijos solo en el mes del comprobante.
        </p>
        <label className="mt-4 block max-w-xs text-sm">
          <span className="font-medium text-slate-600">Mes</span>
          <input
            type="month"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={anchorMonth}
            onChange={(e) => setAnchorMonth(e.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Mes {monthStart} — {monthEnd}: incluye todos los gastos fijos dados de alta hasta este mes (se repiten). Los
          gastos no fijos solo los de este mes.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-800">Ingresos por alquileres</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{formatMoney(rentIncomeTotal)}</p>
          <p className="mt-1 text-xs text-emerald-800">
            Suma del mes seleccionado (filas generadas al abrir esta vista; el administrador no debe cargar el alquiler
            mes a mes).
          </p>
        </article>
        <button
          type="button"
          onClick={() => setDetailKind("FIXED_MONTHLY")}
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-rose-700">Gasto mensual fijo</p>
          <p className="mt-1 text-2xl font-bold text-rose-900">{formatMoney(stats.fixedMonthlyExpense)}</p>
          <p className="mt-1 text-xs text-rose-700">
            Suma mensual recurrente · Ver detalle ({stats.fixedExpenses.length})
          </p>
        </button>
        <button
          type="button"
          onClick={() => setDetailKind("MONTHLY_VARIABLE")}
          className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-orange-700">Gasto mensual no fijo</p>
          <p className="mt-1 text-2xl font-bold text-orange-900">{formatMoney(stats.variableMonthlyExpense)}</p>
          <p className="mt-1 text-xs text-orange-700">Ver detalle ({stats.variableExpenses.length})</p>
        </button>
        <article className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-indigo-700">Resultado del mes</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{formatMoney(stats.net)}</p>
          <p className="mt-1 text-xs text-indigo-700">Alquileres − gastos del mes</p>
        </article>
      </section>

      <ConsultorioRentList
        month={anchorMonth}
        rows={rentMonthsQ.data?.rows ?? []}
        total={rentIncomeTotal}
        isLoading={rentMonthsQ.isLoading}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Gestión de gastos mensuales</h3>
        <p className="mt-1 text-sm text-slate-600">
          Gasto fijo: se repite cada mes desde la fecha de vigencia. Gasto no fijo: solo el mes del comprobante.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const validation = validateExpenseForm(expenseDraft);
            if (!validation.ok) {
              setFieldErrors(validation.fields);
              return;
            }
            setFieldErrors({});
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
              className={invalidFieldClass(Boolean(fieldErrors.description), "w-full rounded-lg border border-slate-300 px-3 py-2")}
              value={expenseDraft.description}
              onChange={(e) => {
                setExpenseDraft((prev) => ({ ...prev, description: e.target.value }));
                if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined }));
              }}
              required
              disabled={saveExpenseMut.isPending}
            />
            <FormFieldError message={fieldErrors.description} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Monto</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={invalidFieldClass(Boolean(fieldErrors.amount), "w-full rounded-lg border border-slate-300 px-3 py-2")}
              value={expenseDraft.amount}
              onChange={(e) => {
                setExpenseDraft((prev) => ({ ...prev, amount: e.target.value }));
                if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              required
              disabled={saveExpenseMut.isPending}
            />
            <FormFieldError message={fieldErrors.amount} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {expenseDraft.type === "FIXED_MONTHLY" ? "Vigente desde" : "Fecha del comprobante"}
            </span>
            <input
              type="date"
              className={invalidFieldClass(Boolean(fieldErrors.expenseDate), "w-full rounded-lg border border-slate-300 px-3 py-2")}
              value={expenseDraft.expenseDate}
              onChange={(e) => {
                setExpenseDraft((prev) => ({ ...prev, expenseDate: e.target.value }));
                if (fieldErrors.expenseDate) setFieldErrors((prev) => ({ ...prev, expenseDate: undefined }));
              }}
              required
              disabled={saveExpenseMut.isPending}
            />
            {expenseDraft.type === "FIXED_MONTHLY" && !expenseDraft.id ? (
              <p className="text-xs text-slate-500">
                Se incluirá en este mes y en todos los meses siguientes.
              </p>
            ) : null}
            <FormFieldError message={fieldErrors.expenseDate} />
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
                  setExpenseDraft({
                    id: null,
                    type: "FIXED_MONTHLY",
                    description: "",
                    amount: "",
                    expenseDate: today,
                  })
                }
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
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
                      <p className="text-xs text-slate-600">
                        {x.type === "FIXED_MONTHLY"
                          ? `Fijo · vigente desde ${x.expenseDate.slice(0, 7)}`
                          : x.expenseDate.slice(0, 10)}
                      </p>
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
          </div>
        </div>
      )}
    </div>
  );
}

function specialistInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  const s = `${a}${b}`.toUpperCase();
  return s || "?";
}

function ConsultorioRentList({
  month,
  rows,
  total,
  isLoading,
}: {
  month: string;
  rows: SpecialistConsultorioRentMonthRow[];
  total: number;
  isLoading: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        formatPersonDisplayLastFirst(a.specialist.lastName, a.specialist.firstName).localeCompare(
          formatPersonDisplayLastFirst(b.specialist.lastName, b.specialist.firstName),
          "es"
        )
      ),
    [rows]
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-slate-50/40 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-100/80 bg-emerald-50/40 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Alquiler por especialista</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Mes <span className="font-medium text-emerald-900">{month}</span> · montos generados automáticamente
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total del mes</p>
          <p className="text-xl font-bold tabular-nums text-emerald-950">{formatMoney(total)}</p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {isLoading ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-500">
            Cargando alquileres…
          </p>
        ) : sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-500">
            No hay especialistas cargados.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sorted.map((r) => {
              const amount = parseMoney(r.amount);
              const name = formatPersonDisplayLastFirst(r.specialist.lastName, r.specialist.firstName);
              const initials = specialistInitials(r.specialist.firstName, r.specialist.lastName);
              const isZero = amount <= 0;

              return (
                <li key={r.id}>
                  <Link
                    to={`/balance/especialistas/${r.specialistId}`}
                    className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition hover:shadow-md ${
                      isZero
                        ? "border-dashed border-slate-300 bg-slate-50/90 hover:border-slate-400"
                        : "border-emerald-100 bg-white hover:border-emerald-300 hover:bg-emerald-50/30"
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isZero
                          ? "bg-slate-200 text-slate-600"
                          : "bg-emerald-100 text-emerald-900 ring-2 ring-emerald-200/80"
                      }`}
                      aria-hidden
                    >
                      {initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900 group-hover:text-brand-800">
                        {name}
                      </span>
                      <span className="text-xs text-slate-500 group-hover:text-emerald-800">
                        Ver rendición del mes →
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-right text-lg font-bold tabular-nums leading-none ${
                        isZero ? "text-slate-400" : "text-emerald-900"
                      }`}
                    >
                      {formatMoney(amount)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
