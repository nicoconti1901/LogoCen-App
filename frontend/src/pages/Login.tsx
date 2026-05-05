import axios from "axios";
import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login, token } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      let msg: string | null = null;
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.message ?? null;
        if (!msg && err.code === "ERR_NETWORK") {
          msg =
            "No hay conexión con el API. Comprobá que el backend esté en marcha (p. ej. puerto 4000) y que el proxy / VITE_API_URL sea correcto.";
        }
      }
      setError(msg ?? "No se pudo iniciar sesión");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-semibold text-brand-900">LogoCen</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Gestión de citas médicas</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
          <button
            type="button"
            className="w-full text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
            onClick={() => setShowResetHelp((v) => !v)}
          >
            {showResetHelp ? "Ocultar ayuda" : "¿Olvidaste tu contraseña?"}
          </button>
        </form>
        {showResetHelp && (
          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium">Recuperación de contraseña</p>
            <p>
              Por ahora la recuperación se gestiona manualmente. Solicitá el cambio de contraseña a un administrador de
              LogoCen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
