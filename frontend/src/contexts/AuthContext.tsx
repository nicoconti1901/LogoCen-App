import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "../types";
import {
  clearStoredToken,
  getStoredToken,
  getStoredUser,
  initAuthFromStorage,
  storeSession,
} from "../api/client";
import { fetchMe, login as apiLogin } from "../api/endpoints";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (u: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    initAuthFromStorage();
    const t = getStoredToken();
    const cached = getStoredUser();
    setToken(t);

    if (!t) {
      setLoading(false);
      return;
    }

    if (cached) {
      setUser(cached);
      setLoading(false);
    }

    void (async () => {
      try {
        const u = await fetchMe();
        if (cancelled) return;
        setUser(u);
        storeSession(t, u);
      } catch {
        if (cancelled) return;
        clearStoredToken();
        setUser(null);
        setToken(null);
      } finally {
        if (!cancelled && !cached) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    storeSession(res.token, res.user);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      setUser,
    }),
    [user, token, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth dentro de AuthProvider");
  return ctx;
}
