import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { configureAuth } from './api/client';

const TOKEN_KEY = 'rr.session';

interface StoredSession {
  token: string;
  expires_at: string;
  user: User;
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s.token || Date.parse(s.expires_at) <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

function writeSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

interface AuthValue {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
let memorySession: StoredSession | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => (memorySession = readSession()));
  const [ready, setReady] = useState(false);

  const clear = useCallback(() => {
    memorySession = null;
    writeSession(null);
    setSession(null);
  }, []);

  useEffect(() => {
    configureAuth(() => memorySession?.token ?? null, clear);
  }, [clear]);

  const refresh = useCallback(async () => {
    if (!memorySession) return;
    const { user } = await api.me();
    memorySession = { ...memorySession, user };
    writeSession(memorySession);
    setSession(memorySession);
  }, []);

  useEffect(() => {
    // Revalidate a stored session with the server (role/active may have changed).
    (async () => {
      try {
        if (memorySession) await refresh();
      } catch {
        /* network errors keep the cached user; UNAUTHENTICATED clears via the client hook */
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    memorySession = { token: r.token, expires_at: r.expires_at, user: r.user };
    writeSession(memorySession);
    setSession(memorySession);
    return r.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* still sign out locally */
    }
    clear();
  }, [clear]);

  const value = useMemo(() => ({ user: session?.user ?? null, ready, signIn, signOut, refresh }), [session, ready, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
