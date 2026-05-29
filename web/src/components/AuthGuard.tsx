"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loadUser } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const publicPaths = ["/", "/login"];
      if (!publicPaths.includes(pathname)) {
        router.push("/login");
      }
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  const isPublicPath = ["/", "/login"].includes(pathname);

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg)",
      }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // Prevent rendering protected pages when not authenticated
  if (!isAuthenticated && !isPublicPath) {
    return null;
  }

  return <>{children}</>;
}
