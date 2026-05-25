"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
} from "lucide-react";
import styles from "./adminTopics.module.css";

export default function AdminTopicsPage() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("💬");
  const [level, setLevel] = useState("beginner");
  const [sortOrder, setSortOrder] = useState(0);
  const [isPublished, setIsPublished] = useState(false);

  const loadTopics = () => {
    setLoading(true);
    api
      .adminGetTopics()
      .then((data: any) => setTopics(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTopics();
  }, []);

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

  const handleEdit = (topic: any) => {
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
    const data = { title, description, icon, level, sort_order: sortOrder, is_published: isPublished };

    try {
      if (editId) {
        await api.adminUpdateTopic(editId, data);
        setSuccess("Topic updated!");
      } else {
        await api.adminCreateTopic(data);
        setSuccess("Topic created!");
      }
      resetForm();
      loadTopics();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this topic and all its conversations?")) return;
    try {
      await api.adminDeleteTopic(id);
      loadTopics();
      setSuccess("Topic deleted!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Topics Management</h1>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={18} />
          Add Topic
        </button>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}><Check size={16} />{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}><AlertCircle size={16} />{error}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <h3>{editId ? "Edit Topic" : "New Topic"}</h3>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formRow}>
              <div className="form-group" style={{ width: 80 }}>
                <label className="form-label">Icon</label>
                <input className="form-input" value={icon} onChange={(e) => setIcon(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Title</label>
                <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <div className="form-group">
                <label className="form-label">Level</label>
                <select className="form-input form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sort Order</label>
                <input className="form-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Published</label>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                  <span>{isPublished ? "Yes" : "No"}</span>
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary">{editId ? "Update" : "Create"}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
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
                      <span className="badge badge-success"><Eye size={12} /> Published</span>
                    ) : (
                      <span className="badge badge-warning"><EyeOff size={12} /> Draft</span>
                    )}
                  </td>
                  <td>{topic.sort_order}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-icon btn-ghost btn-sm" onClick={() => handleEdit(topic)} title="Edit">
                        <Pencil size={16} />
                      </button>
                      <button className="btn btn-icon btn-ghost btn-sm" onClick={() => handleDelete(topic.id)} title="Delete" style={{ color: "var(--danger)" }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
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
