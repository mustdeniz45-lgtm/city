import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Convenience accessor for the access token for outgoing API calls. */
  getAccessToken: () => Promise<string | null>;
};

const AuthCtx = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => ({ needsConfirmation: false }),
  signOut: async () => {},
  getAccessToken: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // defer to avoid lock contention inside the auth client
      setTimeout(() => setSession(newSession), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    // If email confirmation is enabled there will be no active session yet.
    const needsConfirmation = !data.session;
    return { needsConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
