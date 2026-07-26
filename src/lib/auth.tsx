import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, supabaseEnvError } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithPin: (phone: string, pin: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (supabaseEnvError) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const { data, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();
            if (data && !error) {
              setUser(data as User);
            }
          }
        }
      } catch {
        // no session
      }
      setLoading(false);
    })();
  }, []);

  const signInWithPin = async (phone: string, pin: string): Promise<{ error: string | null }> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/pin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ phone, pin }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: err.error || 'Login failed. Please check your phone number and PIN.' };
      }

      const { session, user: authedUser } = await response.json();

      if (session) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (setSessionError) {
          return { error: 'Failed to establish session. Please try again.' };
        }
      }

      setUser(authedUser as User);
      return { error: null };
    } catch {
      return { error: 'Unable to connect. Please try again.' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const refreshUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();
      if (data) setUser(data as User);
    }
  };

  if (supabaseEnvError && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Configuration error</h1>
          <p className="text-sm text-gray-500">{supabaseEnvError}</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithPin, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRoleGuard(allowedRoles: UserRole[]) {
  const { user, loading } = useAuth();
  return { user, loading, canAccess: !loading && user !== null && allowedRoles.includes(user.role) };
}
