import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const subLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
    isActive ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;

export function BalanceLayout() {
  const { user } = useAuth();

  if (!user || (user.role !== "ADMIN" && user.role !== "SPECIALIST")) {
    return <Navigate to="/agenda" replace />;
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Balance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Los honorarios de las consultas corresponden al 100% del especialista; el cobro puede hacerse por transferencia
          directa al profesional o, en casos puntuales, a través de LogoCen para luego liquidarle al especialista.
        </p>
        {isAdmin ? (
          <nav className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4" aria-label="Secciones de balance">
            <NavLink to="/balance/especialistas" className={subLinkClass} end={false}>
              Rendiciones de especialistas
            </NavLink>
            <NavLink to="/balance/logocen" className={subLinkClass}>
              Rendición LogoCen
            </NavLink>
          </nav>
        ) : (
          <p className="mt-3 text-sm font-medium text-slate-700">Tu rendición de honorarios y movimientos del período.</p>
        )}
      </div>
      <Outlet />
    </div>
  );
}

export function BalanceIndexRedirect() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <Navigate to="/balance/especialistas" replace />;
  if (user?.role === "SPECIALIST") return <Navigate to="/balance/mi-rendicion" replace />;
  return <Navigate to="/agenda" replace />;
}
