import type { ComponentType } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

type BalanceSection = "especialistas" | "logocen";

const sections: {
  id: BalanceSection;
  to: string;
  end?: boolean;
  title: string;
  activeRing: string;
  activeBg: string;
  iconBg: string;
  iconColor: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  {
    id: "especialistas",
    to: "/balance/especialistas",
    end: false,
    title: "Por especialista",
    activeRing: "ring-brand-500/40",
    activeBg: "border-brand-300 bg-gradient-to-br from-brand-50 to-white shadow-md",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-800",
    Icon: SpecialistsIcon,
  },
  {
    id: "logocen",
    to: "/balance/logocen",
    title: "LogoCen",
    activeRing: "ring-emerald-500/40",
    activeBg: "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-md",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-800",
    Icon: LogoCenIcon,
  },
];

export function BalanceLayout() {
  const { user } = useAuth();
  if (!user || (user.role !== "ADMIN" && user.role !== "SPECIALIST")) {
    return <Navigate to="/agenda" replace />;
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-brand-50/30 shadow-sm">
        {isAdmin ? (
          <nav className="p-4 sm:p-5" aria-label="Vista de balance">
            <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Balance</h1>
            <div className="grid gap-3 sm:grid-cols-2">
              {sections.map((section) => (
                <NavLink
                  key={section.id}
                  to={section.to}
                  end={section.end}
                  className={({ isActive }) =>
                    `group relative flex gap-3.5 rounded-xl border-2 p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                      isActive
                        ? `${section.activeBg} ${section.activeRing} ring-2`
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${
                          isActive ? section.iconBg : "bg-slate-100 group-hover:bg-slate-200/80"
                        }`}
                        aria-hidden
                      >
                        <section.Icon
                          className={`h-6 w-6 ${isActive ? section.iconColor : "text-slate-500 group-hover:text-slate-700"}`}
                        />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span
                          className={`flex items-center gap-2 text-base font-semibold ${
                            isActive ? "text-slate-900" : "text-slate-800"
                          }`}
                        >
                          {section.title}
                          {isActive && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                section.id === "logocen"
                                  ? "bg-emerald-200 text-emerald-900"
                                  : "bg-brand-200 text-brand-900"
                              }`}
                            >
                              Activo
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full transition ${
                          isActive
                            ? section.id === "logocen"
                              ? "bg-emerald-500"
                              : "bg-brand-600"
                            : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        ) : (
          <div className="px-5 py-4">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Balance</h1>
          </div>
        )}
      </header>
      <Outlet />
    </div>
  );
}

function SpecialistsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function LogoCenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

export function BalanceIndexRedirect() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <Navigate to="/balance/especialistas" replace />;
  if (user?.role === "SPECIALIST") return <Navigate to="/balance/mi-rendicion" replace />;
  return <Navigate to="/agenda" replace />;
}
