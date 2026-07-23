"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { subscribeToAuthEvents } from "@/lib/authSync";

export default function AuthBootstrap() {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const loadUser = useAuthStore((state) => state.loadUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!isInitialized) {
      void loadUser();
    }
  }, [isInitialized, loadUser]);

  useEffect(() => {
    const handleSessionExpired = () => clearSession();
    window.addEventListener("onlyspeak:session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener("onlyspeak:session-expired", handleSessionExpired);
    };
  }, [clearSession]);

  useEffect(
    () =>
      subscribeToAuthEvents((event) => {
        if (event === "logged-out" || event === "session-expired") {
          clearSession(false);
          return;
        }
        void loadUser();
      }),
    [clearSession, loadUser]
  );

  useEffect(() => {
    const revalidate = () => void loadUser();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadUser]);

  return null;
}
