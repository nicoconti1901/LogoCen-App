import { NavLink, Outlet, useLocation } from "react-router-dom";
import logoImg from "../assets/logo.png";
import { useAuth } from "../contexts/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2.5 text-base font-semibold transition-all duration-300 ${
    isActive
      ? "bg-sky-600 text-white shadow-[0_10px_22px_-12px_rgba(2,132,199,0.75)]"
      : "text-slate-700 hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-gradient-to-r hover:from-sky-500 hover:to-cyan-400 hover:text-white hover:shadow-[0_12px_26px_-14px_rgba(14,165,233,0.8)]"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const canAccessAdminSections = user?.role === "ADMIN" || user?.role === "SPECIALIST";
  const isAgendaRoute = location.pathname === "/agenda" || location.pathname.startsWith("/specialists/");
  const isAdminMedicalRoute =
    location.pathname === "/patients" || location.pathname === "/specialists" || location.pathname === "/balance";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-sky-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 shadow-sm">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img
              src={logoImg}
              alt="Logo LogoCen"
              className="h-12 w-auto object-contain mix-blend-multiply sm:h-14 md:h-20"
            />
          </div>
          <div className="flex justify-center">
            <nav className="hidden flex-wrap items-center justify-center gap-1 sm:flex">
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
                  {user?.role === "ADMIN" && (
                    <NavLink to="/balance" className={linkClass}>
                      Balance
                    </NavLink>
                  )}
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-5 text-base text-slate-700">
            <span className="hidden items-center gap-2.5 sm:inline-flex max-w-[260px] truncate font-medium" title={user?.email}>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z" />
                </svg>
              </span>
              {user?.role === "SPECIALIST" && user.specialist
                ? `Dr(a). ${user.specialist.lastName}`
                : user?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-sky-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-sky-50"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      {isAgendaRoute ? (
        <main className="w-full flex-1">
          <Outlet />
        </main>
      ) : isAdminMedicalRoute ? (
        <main className="admin-medical-page-bg admin-medical-page-fullbleed w-full flex-1 py-6">
          <div className="mx-auto w-full max-w-7xl px-4">
            <Outlet />
          </div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <Outlet />
        </main>
      )}
    </div>
  );
}
