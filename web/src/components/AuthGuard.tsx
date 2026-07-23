"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "admin";
}

export default function AuthGuard({
  children,
  requiredRole,
}: AuthGuardProps) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  const sessionError = useAuthStore((state) => state.sessionError);
  const loadUser = useAuthStore((state) => state.loadUser);
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = pathname === "/" || pathname === "/login";
  const hasRequiredRole = !requiredRole || user?.role === requiredRole;

  useEffect(() => {
    if (!isInitialized || isLoading || sessionError) return;

    if (!isAuthenticated && !isPublicPath) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (isAuthenticated && !hasRequiredRole) {
      router.replace("/dashboard");
    }
  }, [
    hasRequiredRole,
    isAuthenticated,
    isInitialized,
    isLoading,
    isPublicPath,
    pathname,
    router,
    sessionError,
  ]);

  if (!isInitialized || isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading your session"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: "var(--bg)",
        }}
      >
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (sessionError && !isPublicPath) {
    return (
      <div
        role="alert"
        style={{
          display: "grid",
          placeItems: "center",
          gap: 16,
          minHeight: "100dvh",
          padding: 24,
          textAlign: "center",
          background: "var(--bg)",
        }}
      >
        <div>
          <h1>We could not verify your session</h1>
          <p>{sessionError}</p>
          <button className="btn btn-primary" onClick={() => void loadUser()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if ((!isAuthenticated && !isPublicPath) || !hasRequiredRole) {
    return null;
  }

  return <>{children}</>;
}
