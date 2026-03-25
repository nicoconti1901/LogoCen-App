import axios from "axios";

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

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
  setAuthToken(token);
}

export function clearStoredToken() {
  localStorage.removeItem(STORAGE_KEY);
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
