"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, BookOpen, MessageSquare, BarChart3 } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .adminGetStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <p>Manage OnlySpeak content and users</p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-icon">
            <Users size={22} />
          </div>
          <div className="stat-value">{loading ? "—" : stats?.users || 0}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-light)", color: "var(--success)" }}>
            <BookOpen size={22} />
          </div>
          <div className="stat-value">{loading ? "—" : stats?.topics || 0}</div>
          <div className="stat-label">Topics</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--info-light)", color: "var(--info)" }}>
            <MessageSquare size={22} />
          </div>
          <div className="stat-value">{loading ? "—" : stats?.conversations || 0}</div>
          <div className="stat-label">Conversations</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--warning-light)", color: "var(--warning)" }}>
            <BarChart3 size={22} />
          </div>
          <div className="stat-value">{loading ? "—" : stats?.total_practices || 0}</div>
          <div className="stat-label">Total Practices</div>
        </div>
      </div>
    </div>
  );
}
