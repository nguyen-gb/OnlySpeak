"use client";

import AuthGuard from "@/components/AuthGuard";
import Header from "@/components/layout/Header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Header />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {children}
      </main>
    </AuthGuard>
  );
}
