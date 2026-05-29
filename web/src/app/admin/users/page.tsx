"use client";

import { useState } from "react";
import { useAdminUsers, useAdminToggleUser } from "@/hooks/useApi";
import { Users, Shield, Ban, Check, AlertCircle } from "lucide-react";

export default function AdminUsersPage() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: rawUsers, isLoading: loading } = useAdminUsers();
  const users = (rawUsers || []) as any[];
  const toggleMutation = useAdminToggleUser();

  const handleToggle = async (userId: string) => {
    try {
      await toggleMutation.mutateAsync(userId);
      setSuccess("User status updated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Users Management</h1>
        <p>Manage registered users</p>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}><Check size={16} />{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}><AlertCircle size={16} />{error}</div>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
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
                      <span className="badge badge-warning"><Shield size={12} /> Admin</span>
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
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_active ? "btn-danger" : "btn-primary"}`}
                      onClick={() => handleToggle(u.id)}
                    >
                      {u.is_active ? <><Ban size={14} /> Disable</> : <><Check size={14} /> Enable</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
