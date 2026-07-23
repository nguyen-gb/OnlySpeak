"use client";

import { useState } from "react";
import { useAdminUsers, useAdminToggleUser } from "@/hooks/useApi";
import { Shield, Ban, Check, AlertCircle, UserRoundX } from "lucide-react";
import { getErrorMessage } from "@/lib/api";
import { PageLoader, QueryError } from "@/components/QueryState";

export default function AdminUsersPage() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(0);

  const usersQuery = useAdminUsers(page);
  const users = usersQuery.data?.items ?? [];
  const totalUsers = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalUsers / 25));
  const loading = usersQuery.isLoading;
  const toggleMutation = useAdminToggleUser();

  const handleToggle = async (userId: string) => {
    setError("");
    setSuccess("");
    try {
      await toggleMutation.mutateAsync(userId);
      setSuccess("User status updated!");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Users Management</h1>
        <p>Manage registered users</p>
      </div>

      {success && <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}><Check size={16} aria-hidden="true" />{success}</div>}
      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}><AlertCircle size={16} aria-hidden="true" />{error}</div>}

      {usersQuery.isError ? (
        <QueryError
          error={usersQuery.error}
          onRetry={() => void usersQuery.refetch()}
          title="Users are unavailable"
        />
      ) : loading ? (
        <PageLoader label="Loading users" />
      ) : users.length === 0 ? (
        <div className="empty-state">
          <UserRoundX size={64} aria-hidden="true" />
          <h3>No users found</h3>
          <p>Registered users will appear here.</p>
          {page > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={() => setPage((current) => Math.max(0, current - 1))}>
              Previous page
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
            <caption className="sr-only">Registered users</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Provider</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong></td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{u.email}</td>
                  <td>
                    <span className="badge badge-primary">{u.provider}</span>
                  </td>
                  <td>
                    {u.role === "admin" ? (
                      <span className="badge badge-warning"><Shield size={12} aria-hidden="true" /> Admin</span>
                    ) : (
                      <span className="badge badge-beginner">User</span>
                    )}
                  </td>
                  <td>
                    {u.is_active ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-advanced">Disabled</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                    <time dateTime={u.created_at}>{new Date(u.created_at).toLocaleDateString()}</time>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_active ? "btn-danger" : "btn-primary"}`}
                      onClick={() => handleToggle(u.id)}
                      disabled={toggleMutation.isPending}
                      aria-label={`${u.is_active ? "Disable" : "Enable"} ${u.full_name}`}
                    >
                      {u.is_active ? <><Ban size={14} aria-hidden="true" /> Disable</> : <><Check size={14} aria-hidden="true" /> Enable</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="User pages">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page === 0 || usersQuery.isFetching}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span>Page {page + 1} of {totalPages} · {totalUsers} users</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page + 1 >= totalPages || usersQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
