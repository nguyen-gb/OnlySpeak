import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Query Keys ──────────────────────────────────────────────────────────────
export const queryKeys = {
  // Auth
  me: ["auth", "me"] as const,

  // Topics
  topics: (level?: string) => ["topics", { level }] as const,
  topic: (id: string) => ["topics", id] as const,

  // Conversations
  conversation: (id: string) => ["conversations", id] as const,

  // Progress
  progress: ["progress"] as const,
  stats: ["progress", "stats"] as const,
  masteryMap: ["progress", "mastery"] as const,
  reviewList: ["progress", "review"] as const,

  // Admin
  adminStats: ["admin", "stats"] as const,
  adminTopics: ["admin", "topics"] as const,
  adminConversations: (topicId?: string) =>
    ["admin", "conversations", { topicId }] as const,
  adminConversation: (id: string) => ["admin", "conversations", id] as const,
  adminUsers: ["admin", "users"] as const,
} as const;

// ── Auth Hooks ──────────────────────────────────────────────────────────────

export function useGoogleLogin() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post("/api/auth/google", { token }).then((r) => r.data),
  });
}

// ── Topic Hooks ─────────────────────────────────────────────────────────────

export function useTopics(level?: string) {
  return useQuery({
    queryKey: queryKeys.topics(level),
    queryFn: () => {
      const q = level ? `?level=${level}` : "";
      return api.get(`/api/topics${q}`).then((r) => r.data);
    },
  });
}

export function useTopic(id: string) {
  return useQuery({
    queryKey: queryKeys.topic(id),
    queryFn: () => api.get(`/api/topics/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

// ── Conversation Hooks ──────────────────────────────────────────────────────

export function useConversation(id: string) {
  return useQuery({
    queryKey: queryKeys.conversation(id),
    queryFn: () => api.get(`/api/conversations/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

// ── Progress Hooks ──────────────────────────────────────────────────────────

export function useProgress() {
  return useQuery({
    queryKey: queryKeys.progress,
    queryFn: () => api.get("/api/progress").then((r) => r.data),
  });
}

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api.get("/api/progress/stats").then((r) => r.data),
  });
}

export function useMasteryMap() {
  return useQuery({
    queryKey: queryKeys.masteryMap,
    queryFn: () => api.get("/api/progress/mastery").then((r) => r.data),
  });
}

export function useReviewList() {
  return useQuery({
    queryKey: queryKeys.reviewList,
    queryFn: () => api.get("/api/progress/review").then((r) => r.data),
    retry: false, // graceful fail if no reviews
  });
}

export function useSaveProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      conversation_id: string;
      role_played: string;
      completed_lines: number;
      total_lines: number;
      is_completed: boolean;
      pronunciation_score?: number;
      practice_mode: number;
      response_times: number[];
    }) => api.post("/api/progress", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

export function useSendFreeTalk() {
  return useMutation({
    mutationFn: (data: {
      conversation_id: string;
      user_input: string;
      history: { role: string; content: string }[];
      role_played: string;
    }) => api.post("/api/chat/free-talk", data).then((r) => r.data),
  });
}

// ── Admin Hooks ─────────────────────────────────────────────────────────────

export function useAdminStats() {
  return useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: () => api.get("/api/admin/stats").then((r) => r.data),
  });
}

export function useAdminTopics() {
  return useQuery({
    queryKey: queryKeys.adminTopics,
    queryFn: () => api.get("/api/admin/topics").then((r) => r.data),
  });
}

export function useAdminCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/api/admin/topics", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminTopics });
    },
  });
}

export function useAdminUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.put(`/api/admin/topics/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminTopics });
    },
  });
}

export function useAdminDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/topics/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminTopics });
    },
  });
}

export function useAdminConversations(topicId?: string) {
  return useQuery({
    queryKey: queryKeys.adminConversations(topicId),
    queryFn: () => {
      const q = topicId ? `?topic_id=${topicId}` : "";
      return api.get(`/api/admin/conversations${q}`).then((r) => r.data);
    },
  });
}

export function useAdminCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/api/admin/conversations", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
    },
  });
}

export function useAdminDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/conversations/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
    },
  });
}

export function useAdminGenerateAudio() {
  return useMutation({
    mutationFn: (convId: string) =>
      api
        .post(`/api/admin/conversations/${convId}/generate-audio`)
        .then((r) => r.data),
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: () => api.get("/api/admin/users").then((r) => r.data),
  });
}

export function useAdminToggleUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.put(`/api/admin/users/${userId}/toggle-active`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });
}
