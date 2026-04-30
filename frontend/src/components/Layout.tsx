import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const canAccessAdminSections = user?.role === "ADMIN" || user?.role === "SPECIALIST";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-brand-800">LogoCen</span>
            <nav className="hidden flex-wrap gap-1 sm:flex">
              <NavLink to="/agenda" className={linkClass}>
                Agenda
              </NavLink>
              {canAccessAdminSections && (
                <>
                  <NavLink to="/specialists" className={linkClass}>
                    Especialistas
                  </NavLink>
                  <NavLink to="/patients" className={linkClass}>
                    Pacientes
                  </NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline max-w-[200px] truncate" title={user?.email}>
              {user?.role === "SPECIALIST" && user.specialist
                ? `Dr(a). ${user.specialist.lastName}`
                : user?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
