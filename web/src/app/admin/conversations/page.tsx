"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Volume2,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";

export default function AdminConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicFilter, setTopicFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    topic_id: "",
    title: "",
    description: "",
    situation: "",
    role_a_name: "Person A",
    role_b_name: "Person B",
    level: "beginner",
    sort_order: 0,
    is_published: false,
    lines: [] as { speaker: string; text_en: string; pronunciation_hint: string }[],
  });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.adminGetConversations(topicFilter || undefined),
      api.adminGetTopics(),
    ])
      .then(([convs, tops]: any) => {
        setConversations(convs);
        setTopics(tops);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [topicFilter]);

  const handleGenerateAudio = async (id: string) => {
    setGeneratingId(id);
    try {
      await api.adminGenerateAudio(id);
      setSuccess("Audio generated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await api.adminDeleteConversation(id);
      loadData();
      setSuccess("Deleted!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addLine = () => {
    setForm({
      ...form,
      lines: [
        ...form.lines,
        { speaker: form.lines.length % 2 === 0 ? "A" : "B", text_en: "", pronunciation_hint: "" },
      ],
    });
  };

  const removeLine = (index: number) => {
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });
  };

  const updateLine = (index: number, field: string, value: string) => {
    const newLines = [...form.lines];
    (newLines[index] as any)[field] = value;
    setForm({ ...form, lines: newLines });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const data = {
        ...form,
        lines: form.lines.map((l, i) => ({
          ...l,
          line_order: i + 1,
        })),
      };
      await api.adminCreateConversation(data);
      setSuccess("Conversation created!");
      setShowForm(false);
      setForm({
        topic_id: "",
        title: "",
        description: "",
        situation: "",
        role_a_name: "Person A",
        role_b_name: "Person B",
        level: "beginner",
        sort_order: 0,
        is_published: false,
        lines: [],
      });
      loadData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Conversations</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} />
          Add Conversation
        </button>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}><Check size={16} />{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}><AlertCircle size={16} />{error}</div>}

      {/* Topic filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button className={`btn btn-sm ${topicFilter === "" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTopicFilter("")}>
          All Topics
        </button>
        {topics.map((t: any) => (
          <button
            key={t.id}
            className={`btn btn-sm ${topicFilter === t.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTopicFilter(t.id)}
          >
            {t.icon} {t.title}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>New Conversation</h3>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <label className="form-label">Topic</label>
                <select className="form-input form-select" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })} required>
                  <option value="">Select topic...</option>
                  {topics.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.icon} {t.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <label className="form-label">Title</label>
                <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Situation</label>
                <input className="form-input" value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} placeholder="e.g. At a coffee shop" />
              </div>
              <div className="form-group" style={{ width: 120 }}>
                <label className="form-label">Role A Name</label>
                <input className="form-input" value={form.role_a_name} onChange={(e) => setForm({ ...form, role_a_name: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 120 }}>
                <label className="form-label">Role B Name</label>
                <input className="form-input" value={form.role_b_name} onChange={(e) => setForm({ ...form, role_b_name: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Level</label>
                <select className="form-input form-select" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} style={{ marginRight: 6 }} />
                  Published
                </label>
              </div>
            </div>

            {/* Lines */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 700 }}>Dialogue Lines</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addLine}>
                  <Plus size={14} /> Add Line
                </button>
              </div>
              {form.lines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <select
                    className="form-input form-select"
                    style={{ width: 70 }}
                    value={line.speaker}
                    onChange={(e) => updateLine(i, "speaker", e.target.value)}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    value={line.text_en}
                    onChange={(e) => updateLine(i, "text_en", e.target.value)}
                    placeholder={`Line ${i + 1}...`}
                    required
                  />
                  <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => removeLine(i)} style={{ color: "var(--danger)" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary">Create Conversation</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Roles</th>
                <th>Lines</th>
                <th>Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.title}</strong></td>
                  <td style={{ fontSize: 13 }}>{c.role_a_name} & {c.role_b_name}</td>
                  <td>{c.line_count}</td>
                  <td><span className={`badge badge-${c.level}`}>{c.level}</span></td>
                  <td>
                    {c.is_published ? (
                      <span className="badge badge-success"><Eye size={12} /> Live</span>
                    ) : (
                      <span className="badge badge-warning"><EyeOff size={12} /> Draft</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleGenerateAudio(c.id)}
                        disabled={generatingId === c.id}
                        title="Generate audio for all lines"
                      >
                        {generatingId === c.id ? <Loader2 size={14} className="spinner" /> : <Volume2 size={14} />}
                        Audio
                      </button>
                      <button className="btn btn-icon btn-ghost btn-sm" onClick={() => handleDelete(c.id)} style={{ color: "var(--danger)" }}>
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
