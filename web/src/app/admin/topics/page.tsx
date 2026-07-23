"use client";

import { useState } from "react";
import {
  useAdminTopics,
  useAdminCreateTopic,
  useAdminUpdateTopic,
  useAdminDeleteTopic,
  type TopicLevel,
  type TopicSummary,
} from "@/hooks/useApi";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api";
import { PageLoader, QueryError } from "@/components/QueryState";
import styles from "./adminTopics.module.css";

export default function AdminTopicsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(0);

  // Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("💬");
  const [level, setLevel] = useState<TopicLevel>("beginner");
  const [sortOrder, setSortOrder] = useState(0);
  const [isPublished, setIsPublished] = useState(false);

  const topicsQuery = useAdminTopics(page);
  const topics = topicsQuery.data?.items ?? [];
  const totalTopics = topicsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalTopics / 25));
  const loading = topicsQuery.isLoading;
  const createMutation = useAdminCreateTopic();
  const updateMutation = useAdminUpdateTopic();
  const deleteMutation = useAdminDeleteTopic();

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setIcon("💬");
    setLevel("beginner");
    setSortOrder(0);
    setIsPublished(false);
    setEditId(null);
    setShowForm(false);
    setError("");
  };

  const handleEdit = (topic: TopicSummary) => {
    setTitle(topic.title);
    setDescription(topic.description || "");
    setIcon(topic.icon);
    setLevel(topic.level);
    setSortOrder(topic.sort_order);
    setIsPublished(topic.is_published);
    setEditId(topic.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const data = { title, description, icon, level, sort_order: sortOrder, is_published: isPublished };

    try {
      if (editId) {
        await updateMutation.mutateAsync({ id: editId, data });
        setSuccess("Topic updated!");
      } else {
        await createMutation.mutateAsync(data);
        setSuccess("Topic created!");
      }
      resetForm();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this topic and all its conversations?")) return;
    setError("");
    setSuccess("");
    try {
      await deleteMutation.mutateAsync(id);
      setSuccess("Topic deleted!");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-actions">
        <div className="page-header">
          <h1>Topics Management</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={18} aria-hidden="true" />
          Add Topic
        </button>
      </div>

      {success && <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}><Check size={16} aria-hidden="true" />{success}</div>}
      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}><AlertCircle size={16} aria-hidden="true" />{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h3>{editId ? "Edit Topic" : "New Topic"}</h3>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formRow}>
              <div className={`form-group ${styles.iconField}`}>
                <label className="form-label" htmlFor="topic-icon">Icon</label>
                <input id="topic-icon" className="form-input" value={icon} onChange={(e) => setIcon(e.target.value)} minLength={1} maxLength={50} required />
              </div>
              <div className={`form-group ${styles.growField}`}>
                <label className="form-label" htmlFor="topic-title">Title</label>
                <input id="topic-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={1} maxLength={255} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="topic-description">Description</label>
              <textarea id="topic-description" className="form-input form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
            </div>
            <div className={styles.formRow}>
              <div className="form-group">
                <label className="form-label" htmlFor="topic-level">Level</label>
                <select id="topic-level" className="form-input form-select" value={level} onChange={(e) => setLevel(e.target.value as TopicLevel)}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="topic-sort-order">Sort Order</label>
                <input id="topic-sort-order" className="form-input" type="number" min={0} max={100000} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <span className="form-label">Published</span>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                  <span>{isPublished ? "Yes" : "No"}</span>
                </label>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {topicsQuery.isError ? (
        <QueryError
          error={topicsQuery.error}
          onRetry={() => void topicsQuery.refetch()}
          title="Topics are unavailable"
        />
      ) : loading ? (
        <PageLoader label="Loading topics" />
      ) : topics.length === 0 ? (
        <div className="empty-state">
          <h3>No topics yet</h3>
          <p>Create a topic to start adding conversations.</p>
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
            <caption className="sr-only">Topics available to manage</caption>
            <thead>
              <tr>
                <th>Icon</th>
                <th>Title</th>
                <th>Level</th>
                <th>Conversations</th>
                <th>Status</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.id}>
                  <td style={{ fontSize: 24 }}>{topic.icon}</td>
                  <td><strong>{topic.title}</strong></td>
                  <td><span className={`badge badge-${topic.level}`}>{topic.level}</span></td>
                  <td>{topic.conversation_count}</td>
                  <td>
                    {topic.is_published ? (
                      <span className="badge badge-success"><Eye size={12} aria-hidden="true" /> Published</span>
                    ) : (
                      <span className="badge badge-warning"><EyeOff size={12} aria-hidden="true" /> Draft</span>
                    )}
                  </td>
                  <td>{topic.sort_order}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => handleEdit(topic)} aria-label={`Edit ${topic.title}`}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => handleDelete(topic.id)} aria-label={`Delete ${topic.title}`} disabled={deleteMutation.isPending} style={{ color: "var(--danger)" }}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Topics pages">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page === 0 || topicsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span>Page {page + 1} of {totalPages} · {totalTopics} topics</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page + 1 >= totalPages || topicsQuery.isFetching}
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
