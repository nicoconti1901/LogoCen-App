import axios from "axios";
import type { AuthUser } from "../types";

const baseURL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

const STORAGE_KEY = "logocen_token";
const USER_KEY = "logocen_user";

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/** Guarda token y perfil para restaurar la sesión al volver a abrir la app. */
export function storeSession(token: string, user: AuthUser) {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  setAuthToken(token);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearStoredToken() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
  setAuthToken(null);
}

export function initAuthFromStorage() {
  const t = getStoredToken();
  if (t) setAuthToken(t);
}

api.interceptors.response.use(
  (r) => r,
  (err: unknown) => {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 401) {
      clearStoredToken();
      if (!window.location.pathname.includes("/login")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  }
);
