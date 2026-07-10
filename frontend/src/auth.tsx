import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import type { Session, User, Provider } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Complete any in-flight auth session (harmless no-op on native and web).
WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AuthCtx = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => ({ needsConfirmation: false }),
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
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

  /**
   * Supabase-managed OAuth flow (browser popup — no client-side Google/Apple
   * SDK required). Requires the provider to be enabled in Supabase Dashboard
   * → Authentication → Providers. Redirect URLs must include:
   *   - Web  : `${window.location.origin}` (any origin will do for dev).
   *   - Native: `frontend://auth/callback` (the app's `scheme` in app.json).
   */
  const signInWithOAuth = useCallback(async (provider: Provider) => {
    const isWeb = Platform.OS === "web";
    const redirectTo = isWeb
      ? `${window.location.origin}/auth/callback`
      : Linking.createURL("auth/callback");

    if (isWeb) {
      // Native full-page redirect — supabase-js completes the flow on return.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
      return;
    }

    // Native flow: get the URL, open an in-app browser, then exchange the code.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw error ?? new Error("OAuth URL missing");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      throw new Error(result.type === "cancel" ? "Sign-in cancelled" : "Sign-in failed");
    }
    // Extract ?code=... from the callback URL and exchange it for a session.
    const parsed = Linking.parse(result.url);
    const code = (parsed.queryParams?.code ?? "") as string;
    if (!code) throw new Error("No auth code returned");
    const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exchErr) throw exchErr;
  }, []);

  const signInWithGoogle = useCallback(() => signInWithOAuth("google"), [signInWithOAuth]);
  const signInWithApple  = useCallback(() => signInWithOAuth("apple"),  [signInWithOAuth]);

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
        signInWithGoogle,
        signInWithApple,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
