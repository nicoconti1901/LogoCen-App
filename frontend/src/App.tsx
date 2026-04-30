import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PrivateRoute } from "./components/PrivateRoute";
import { AdminPatientsPage } from "./pages/admin/AdminPatients";
import { AdminSpecialistsPage } from "./pages/admin/AdminSpecialists";
import { AgendaPage } from "./pages/Agenda";
import { LoginPage } from "./pages/Login";

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
            element={<AgendaPage />}
          />
          <Route path="appointments" element={<Navigate to="/agenda" replace />} />
          <Route
            path="specialists"
            element={<AdminSpecialistsPage />}
          />
          <Route
            path="patients"
            element={<AdminPatientsPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  );
}
