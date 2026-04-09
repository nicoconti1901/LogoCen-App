import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PrivateRoute } from "./components/PrivateRoute";
import { useAuth } from "./contexts/AuthContext";
import { AdminPatientsPage } from "./pages/admin/AdminPatients";
import { AdminSpecialistsPage } from "./pages/admin/AdminSpecialists";
import { AgendaPage } from "./pages/Agenda";
import { LoginPage } from "./pages/Login";

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") {
    return <Navigate to="/agenda" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/agenda" replace />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route
            path="specialists/:specialistId/agenda"
            element={
              <AdminOnly>
                <AgendaPage />
              </AdminOnly>
            }
          />
          <Route path="appointments" element={<Navigate to="/agenda" replace />} />
          <Route
            path="specialists"
            element={
              <AdminOnly>
                <AdminSpecialistsPage />
              </AdminOnly>
            }
          />
          <Route
            path="patients"
            element={
              <AdminOnly>
                <AdminPatientsPage />
              </AdminOnly>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  );
}
