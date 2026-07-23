"use client";

import { useState } from "react";
import {
  useAdminConversations,
  useAdminTopicOptions,
  useAdminCreateConversation,
  useAdminDeleteConversation,
  useAdminGenerateAudio,
  type ConversationLineInput,
  type ConversationMutationInput,
  type ConversationRole,
  type TopicLevel,
} from "@/hooks/useApi";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Volume2,
  AlertCircle,
  Check,
  Loader2,
  MessagesSquare,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api";
import { PageLoader, QueryError } from "@/components/QueryState";
import styles from "./adminConversations.module.css";

function createEmptyForm(): ConversationMutationInput {
  return {
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
  };
}

export default function AdminConversationsPage() {
  const [topicFilter, setTopicFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ConversationMutationInput>(createEmptyForm);

  const conversationsQuery = useAdminConversations(
    topicFilter || undefined,
    page
  );
  const topicsQuery = useAdminTopicOptions();
  const conversations = conversationsQuery.data?.items ?? [];
  const totalConversations = conversationsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalConversations / 25));
  const topics = topicsQuery.data ?? [];
  const convsLoading = conversationsQuery.isLoading;
  const topicsLoading = topicsQuery.isLoading;
  const loading = convsLoading || topicsLoading;

  const createMutation = useAdminCreateConversation();
  const deleteMutation = useAdminDeleteConversation();
  const generateAudioMutation = useAdminGenerateAudio();

  const handleGenerateAudio = async (id: string) => {
    setError("");
    setSuccess("");
    setGeneratingId(id);
    try {
      const result = await generateAudioMutation.mutateAsync(id);
      if (result.failed_count > 0) {
        const sampleIds = result.failed_line_ids.slice(0, 3).join(", ");
        setError(
          `Generated ${result.generated_count} audio files; ${result.failed_count} failed${sampleIds ? ` (${sampleIds})` : ""}. Retry to generate the missing files.`
        );
      } else {
        setSuccess(`Generated audio for ${result.generated_count} lines.`);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    setError("");
    setSuccess("");
    try {
      await deleteMutation.mutateAsync(id);
      setSuccess("Deleted!");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const addLine = () => {
    if (form.lines.length >= 200) {
      setError("A conversation is limited to 200 dialogue lines.");
      return;
    }
    setForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          speaker: current.lines.length % 2 === 0 ? "A" : "B",
          text_en: "",
          pronunciation_hint: "",
        },
      ],
    }));
  };

  const removeLine = (index: number) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  };

  const updateLine = (index: number, patch: Partial<ConversationLineInput>) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      ),
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const speakers = new Set(form.lines.map((line) => line.speaker));
    if (form.is_published && (!speakers.has("A") || !speakers.has("B"))) {
      setError("A published conversation needs at least one line for both role A and role B.");
      return;
    }

    try {
      const data: ConversationMutationInput = {
        ...form,
        lines: form.lines.map((l, i) => ({
          ...l,
          line_order: i + 1,
        })),
      };
      await createMutation.mutateAsync(data);
      setSuccess("Conversation created!");
      setShowForm(false);
      setForm(createEmptyForm());
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-actions">
        <div className="page-header">
          <h1>Conversations</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((visible) => !visible)}>
          <Plus size={18} aria-hidden="true" />
          {showForm ? "Close form" : "Add Conversation"}
        </button>
      </div>

      {success && <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}><Check size={16} aria-hidden="true" />{success}</div>}
      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}><AlertCircle size={16} aria-hidden="true" />{error}</div>}

      {topicsQuery.isError ? (
        <QueryError
          error={topicsQuery.error}
          onRetry={() => void topicsQuery.refetch()}
          title="Topic filters are unavailable"
        />
      ) : null}

      {/* Topic filter */}
      <div className={styles.filters} role="group" aria-label="Filter conversations by topic">
        <button type="button" className={`btn btn-sm ${topicFilter === "" ? "btn-primary" : "btn-secondary"}`} onClick={() => { setTopicFilter(""); setPage(0); }} aria-pressed={topicFilter === ""}>
          All Topics
        </button>
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn btn-sm ${topicFilter === t.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => { setTopicFilter(t.id); setPage(0); }}
            aria-pressed={topicFilter === t.id}
          >
            {t.icon} {t.title}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showForm && !topicsQuery.isError && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>New Conversation</h3>
          <form onSubmit={handleCreate} className={styles.form}>
            <div className={styles.formRow}>
              <div className={`form-group ${styles.fieldGrow}`}>
                <label className="form-label" htmlFor="conversation-topic">Topic</label>
                <select id="conversation-topic" className="form-input form-select" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })} required>
                  <option value="">Select topic...</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.icon} {t.title}</option>
                  ))}
                </select>
              </div>
              <div className={`form-group ${styles.fieldGrow}`}>
                <label className="form-label" htmlFor="conversation-title">Title</label>
                <input id="conversation-title" className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} minLength={1} maxLength={255} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="conversation-description">Description</label>
              <textarea id="conversation-description" className="form-input form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={5000} />
            </div>
            <div className={styles.formRow}>
              <div className={`form-group ${styles.fieldGrow}`}>
                <label className="form-label" htmlFor="conversation-situation">Situation</label>
                <input id="conversation-situation" className="form-input" value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} maxLength={5000} placeholder="e.g. At a coffee shop" />
              </div>
              <div className={`form-group ${styles.roleField}`}>
                <label className="form-label" htmlFor="role-a-name">Role A Name</label>
                <input id="role-a-name" className="form-input" value={form.role_a_name} onChange={(e) => setForm({ ...form, role_a_name: e.target.value })} minLength={1} maxLength={100} required />
              </div>
              <div className={`form-group ${styles.roleField}`}>
                <label className="form-label" htmlFor="role-b-name">Role B Name</label>
                <input id="role-b-name" className="form-input" value={form.role_b_name} onChange={(e) => setForm({ ...form, role_b_name: e.target.value })} minLength={1} maxLength={100} required />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className="form-group">
                <label className="form-label" htmlFor="conversation-level">Level</label>
                <select id="conversation-level" className="form-input form-select" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as TopicLevel })}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className={`form-group ${styles.sortField}`}>
                <label className="form-label" htmlFor="conversation-sort-order">Sort order</label>
                <input id="conversation-sort-order" className="form-input" type="number" min={0} max={100000} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
              <div className={`form-group ${styles.publishField}`}>
                <label className="form-label" htmlFor="conversation-published">
                  <input id="conversation-published" type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
                  Published
                </label>
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className={styles.dialogueHeader}>
                <span className="form-label" style={{ fontWeight: 700 }}>Dialogue Lines</span>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addLine}>
                  <Plus size={14} aria-hidden="true" /> Add Line
                </button>
              </div>
              {form.lines.map((line, i) => (
                <div key={i} className={styles.dialogueLine}>
                  <label className="sr-only" htmlFor={`line-${i}-speaker`}>Speaker for line {i + 1}</label>
                  <select
                    id={`line-${i}-speaker`}
                    className="form-input form-select"
                    value={line.speaker}
                    onChange={(e) => updateLine(i, { speaker: e.target.value as ConversationRole })}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                  <label className="sr-only" htmlFor={`line-${i}-text`}>English text for line {i + 1}</label>
                  <input
                    id={`line-${i}-text`}
                    className="form-input"
                    value={line.text_en}
                    onChange={(e) => updateLine(i, { text_en: e.target.value })}
                    placeholder={`Line ${i + 1}...`}
                    minLength={1}
                    maxLength={2000}
                    required
                  />
                  <label className="sr-only" htmlFor={`line-${i}-hint`}>Pronunciation hint for line {i + 1}</label>
                  <input
                    id={`line-${i}-hint`}
                    className="form-input"
                    value={line.pronunciation_hint}
                    onChange={(e) => updateLine(i, { pronunciation_hint: e.target.value })}
                    placeholder="Pronunciation hint (optional)"
                    maxLength={2000}
                  />
                  <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => removeLine(i)} style={{ color: "var(--danger)" }} aria-label={`Remove line ${i + 1}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {form.lines.length === 0 ? (
                <p className={styles.dialogueHint}>Drafts can be empty. Published conversations require both roles.</p>
              ) : null}
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Conversation"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {conversationsQuery.isError ? (
        <QueryError
          error={conversationsQuery.error}
          onRetry={() => void conversationsQuery.refetch()}
          title="Conversations are unavailable"
        />
      ) : loading ? (
        <PageLoader label="Loading conversations" />
      ) : conversations.length === 0 ? (
        <div className="empty-state">
          <MessagesSquare size={64} aria-hidden="true" />
          <h3>No conversations found</h3>
          <p>Add a conversation or choose a different topic filter.</p>
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
            <caption className="sr-only">Conversations available to manage</caption>
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
                      <span className="badge badge-success"><Eye size={12} aria-hidden="true" /> Live</span>
                    ) : (
                      <span className="badge badge-warning"><EyeOff size={12} aria-hidden="true" /> Draft</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleGenerateAudio(c.id)}
                        disabled={generateAudioMutation.isPending}
                        aria-label={`Generate audio for ${c.title}`}
                      >
                        {generatingId === c.id ? <Loader2 size={14} className="icon-spin" aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
                        Audio
                      </button>
                      <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => handleDelete(c.id)} style={{ color: "var(--danger)" }} disabled={deleteMutation.isPending} aria-label={`Delete ${c.title}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Conversation pages">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page === 0 || conversationsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span>Page {page + 1} of {totalPages} · {totalConversations} conversations</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page + 1 >= totalPages || conversationsQuery.isFetching}
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
