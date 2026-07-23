"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { useState } from "react";
import { PageLoader, QueryError } from "@/components/QueryState";
import { HISTORY_PAGE_SIZE, useProgress } from "@/hooks/useApi";

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

export default function HistoryPage() {
  const [page, setPage] = useState(0);
  const progressQuery = useProgress(page);
  const progress = progressQuery.data?.items ?? [];
  const total = progressQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Practice History</h1>
        <p>Your recent attempts, newest first</p>
      </div>

      {progressQuery.isError ? (
        <QueryError
          error={progressQuery.error}
          onRetry={() => void progressQuery.refetch()}
          title="History is unavailable"
        />
      ) : progressQuery.isLoading ? (
        <PageLoader label="Loading practice history" />
      ) : progress.length === 0 ? (
        <div className="empty-state">
          <History size={64} aria-hidden="true" />
          <h3>No history yet</h3>
          <p>Complete a conversation practice to see your history.</p>
          <Link href="/topics" className="btn btn-primary">
            Browse topics
          </Link>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
            <caption className="sr-only">Practice attempts, newest first</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Conversation</th>
                <th>Role</th>
                <th>Level</th>
                <th>Progress</th>
                <th>Accuracy</th>
                <th>Response</th>
                <th>Status</th>
                <th>XP</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((attempt) => (
                <tr key={attempt.id}>
                  <td>
                    <time dateTime={attempt.last_practiced_at}>
                      {new Date(attempt.last_practiced_at).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                    </time>
                  </td>
                  <td>
                    <Link
                      href={`/practice/${attempt.conversation_id}`}
                      className="table-link"
                    >
                      {attempt.conversation_title ||
                        `Conversation ${attempt.conversation_id.slice(0, 8)}`}
                    </Link>
                    {attempt.conversation_situation ? (
                      <div
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: 13,
                          marginTop: 4,
                        }}
                      >
                        {attempt.conversation_situation}
                      </div>
                    ) : null}
                    {attempt.is_legacy && attempt.practice_count > 1 ? (
                      <small>{attempt.practice_count} imported sessions</small>
                    ) : null}
                  </td>
                  <td>
                    <span className="badge badge-primary">
                      Role {attempt.role_played}
                    </span>
                  </td>
                  <td>Level {attempt.practice_mode}</td>
                  <td>
                    {attempt.completed_lines}/{attempt.total_lines} lines
                  </td>
                  <td>
                    {attempt.pronunciation_score !== null ? (
                      <span
                        style={{
                          color: scoreColor(attempt.pronunciation_score),
                          fontWeight: 700,
                        }}
                      >
                        {attempt.pronunciation_score}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {attempt.avg_response_time > 0
                      ? `${attempt.avg_response_time.toFixed(1)}s`
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        attempt.is_completed
                          ? "badge-success"
                          : "badge-warning"
                      }`}
                    >
                      {attempt.is_completed ? "Completed" : "Partial"}
                    </span>
                  </td>
                  <td>{attempt.xp_gained > 0 ? `+${attempt.xp_gained}` : "—"}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Practice history pages">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0 || progressQuery.isFetching}
            >
              Previous
            </button>
            <span aria-live="polite">
              Page {page + 1} of {totalPages} · {total} attempts
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={page + 1 >= totalPages || progressQuery.isFetching}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
