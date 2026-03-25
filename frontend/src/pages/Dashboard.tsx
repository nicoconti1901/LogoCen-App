import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Panel</h1>
        <p className="mt-1 text-slate-600">
          {isAdmin
            ? "Administración de la clínica: especialistas, pacientes, consultorios y citas."
            : "Su agenda y citas asignadas."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/agenda"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
        >
          <h2 className="font-semibold text-brand-800">Agenda</h2>
          <p className="mt-1 text-sm text-slate-600">Vista de calendario y programación</p>
        </Link>
        <Link
          to="/appointments"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
        >
          <h2 className="font-semibold text-brand-800">Lista de citas</h2>
          <p className="mt-1 text-sm text-slate-600">Filtros: hoy, próximas, estado</p>
        </Link>
        {isAdmin && (
          <>
            <Link
              to="/specialists"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
            >
              <h2 className="font-semibold text-brand-800">Especialistas</h2>
              <p className="mt-1 text-sm text-slate-600">Altas y cuentas de médicos</p>
            </Link>
            <Link
              to="/patients"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
            >
              <h2 className="font-semibold text-brand-800">Pacientes</h2>
              <p className="mt-1 text-sm text-slate-600">Datos sin acceso web</p>
            </Link>
            <Link
              to="/offices"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
            >
              <h2 className="font-semibold text-brand-800">Consultorios</h2>
              <p className="mt-1 text-sm text-slate-600">Salas y numeración</p>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
