"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { History, MessageSquare } from "lucide-react";

export default function HistoryPage() {
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getProgress()
      .then((data: any) => setProgress(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Practice History</h1>
        <p>Your recent practice sessions</p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : progress.length === 0 ? (
        <div className="empty-state">
          <History size={64} />
          <h3>No history yet</h3>
          <p>Complete a conversation practice to see your history!</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Role</th>
                <th>Progress</th>
                <th>Score</th>
                <th>Status</th>
                <th>Practices</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((p) => (
                <tr key={p.id}>
                  <td>
                    {new Date(p.last_practiced_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <span className="badge badge-primary">Role {p.role_played}</span>
                  </td>
                  <td>
                    {p.completed_lines}/{p.total_lines} lines
                  </td>
                  <td>
                    {p.pronunciation_score ? (
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            p.pronunciation_score >= 80
                              ? "var(--success)"
                              : p.pronunciation_score >= 50
                                ? "var(--warning)"
                                : "var(--danger)",
                        }}
                      >
                        {p.pronunciation_score}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {p.is_completed ? (
                      <span className="badge badge-success">Completed</span>
                    ) : (
                      <span className="badge badge-warning">In Progress</span>
                    )}
                  </td>
                  <td>{p.practice_count}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
