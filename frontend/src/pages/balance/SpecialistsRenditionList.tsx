import { Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSpecialists } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { formatPersonDisplayLastFirst } from "../../lib/personName";
import { parseMoney, formatMoney } from "./balanceUtils";

export function SpecialistsRenditionListPage() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN") return <Navigate to="/agenda" replace />;

  const specialistsQ = useQuery({
    queryKey: ["specialists", "balance-rendition-list"],
    queryFn: () => fetchSpecialists(true),
  });

  const rows = specialistsQ.data ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Rendiciones por especialista</h2>
      <p className="mt-1 text-sm text-slate-600">
        Cada profesional tiene su propio resumen: pacientes atendidos, montos, deudas y alquiler mensual del consultorio.
      </p>
      {specialistsQ.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No hay especialistas cargados.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {rows.map((s) => {
            const name = formatPersonDisplayLastFirst(s.lastName, s.firstName);
            const rent = parseMoney(s.monthlyConsultorioRent ?? undefined);
            return (
              <li key={s.id}>
                <Link
                  to={`/balance/especialistas/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">{s.specialty}</p>
                    {!s.active && <span className="mt-1 inline-block text-xs text-amber-700">Inactivo</span>}
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-500">Alquiler mensual consultorio</p>
                    <p className="font-semibold text-slate-800">{formatMoney(rent)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
