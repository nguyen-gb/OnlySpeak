"use client";

import { useAdminStats } from "@/hooks/useApi";
import { Users, BookOpen, MessageSquare, BarChart3 } from "lucide-react";
import { PageLoader, QueryError } from "@/components/QueryState";

export default function AdminDashboard() {
  const { data: stats, isLoading: loading, isError, error, refetch } = useAdminStats();

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <p>Manage OnlySpeak content and users</p>
      </div>

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} title="Admin stats are unavailable" />
      ) : loading ? (
        <PageLoader label="Loading admin statistics" />
      ) : (
      <div className="grid grid-4" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-icon">
            <Users size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">{stats?.users ?? 0}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-light)", color: "var(--success)" }}>
            <BookOpen size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">{stats?.topics ?? 0}</div>
          <div className="stat-label">Topics</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--info-light)", color: "var(--info)" }}>
            <MessageSquare size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">{stats?.conversations ?? 0}</div>
          <div className="stat-label">Conversations</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--warning-light)", color: "var(--warning)" }}>
            <BarChart3 size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">{stats?.total_practices ?? 0}</div>
          <div className="stat-label">Total Practices</div>
        </div>
      </div>
      )}
    </div>
  );
}
