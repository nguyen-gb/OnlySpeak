import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type {
  AdminConversation,
  AdminStats,
  AdminUser,
  AudioGenerationResponse,
  ApiMessage,
  AuthResponse,
  ConversationMutationInput,
  FreeTalkInput,
  FreeTalkResponse,
  MasteryMap,
  PaginatedResponse,
  ProgressItem,
  ProgressSaveInput,
  ProgressSaveResponse,
  ProgressStats,
  ReviewItem,
  TopicDetailResponse,
  TopicMutationInput,
  TopicSummary,
} from "@/types/api";

export type {
  AdminConversation,
  AdminStats,
  AdminUser,
  AudioGenerationResponse,
  ConversationLineInput,
  ConversationMutationInput,
  ConversationRole,
  MasteryEntry,
  ModeScore,
  PaginatedResponse,
  ProgressItem,
  ProgressSummary,
  ProgressStats,
  ReviewItem,
  TopicDetailResponse,
  TopicLevel,
  TopicMutationInput,
  TopicSummary,
} from "@/types/api";

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
  progress: (userId: string) => ["users", userId, "progress"] as const,
  stats: (userId: string) => ["users", userId, "progress", "stats"] as const,
  masteryMap: (userId: string) =>
    ["users", userId, "progress", "mastery"] as const,
  reviewList: (userId: string) =>
    ["users", userId, "progress", "review"] as const,

  // Admin
  adminRoot: (userId: string) => ["users", userId, "admin"] as const,
  adminStats: (userId: string) =>
    ["users", userId, "admin", "stats"] as const,
  adminTopics: (userId: string, page: number, pageSize: number) =>
    ["users", userId, "admin", "topics", { page, pageSize }] as const,
  adminTopicOptions: (userId: string) =>
    ["users", userId, "admin", "topic-options"] as const,
  adminConversations: (
    userId: string,
    topicId: string | undefined,
    page: number,
    pageSize: number
  ) =>
    [
      "users",
      userId,
      "admin",
      "conversations",
      { topicId, page, pageSize },
    ] as const,
  adminConversation: (userId: string, id: string) =>
    ["users", userId, "admin", "conversations", id] as const,
  adminUsers: (userId: string, page: number, pageSize: number) =>
    ["users", userId, "admin", "users", { page, pageSize }] as const,
} as const;

export const ADMIN_PAGE_SIZE = 25;
export const HISTORY_PAGE_SIZE = 50;

function useCurrentUserId(): string {
  return useAuthStore((state) => state.user?.id ?? "anonymous");
}

// ── Auth Hooks ──────────────────────────────────────────────────────────────

export function useGoogleLogin() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<AuthResponse>("/api/auth/google", { token }).then((r) => r.data),
  });
}

// ── Topic Hooks ─────────────────────────────────────────────────────────────

export function useTopics(level?: string) {
  return useQuery<TopicSummary[]>({
    queryKey: queryKeys.topics(level),
    queryFn: () =>
      api
        .get<TopicSummary[]>("/api/topics", {
          params: level ? { level } : undefined,
        })
        .then((r) => r.data),
  });
}

export function useTopic(id: string) {
  return useQuery<TopicDetailResponse>({
    queryKey: queryKeys.topic(id),
    queryFn: () =>
      api.get<TopicDetailResponse>(`/api/topics/${id}`).then((r) => r.data),
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

export function useProgress(page = 0, pageSize = HISTORY_PAGE_SIZE) {
  const userId = useCurrentUserId();
  return useQuery<PaginatedResponse<ProgressItem>>({
    queryKey: [...queryKeys.progress(userId), { page, pageSize }],
    queryFn: async () => {
      const offset = page * pageSize;
      const response = await api.get<ProgressItem[]>("/api/progress", {
        params: { limit: pageSize, offset },
      });
      const parsedTotal = Number(response.headers["x-total-count"]);
      const total = Number.isFinite(parsedTotal)
        ? parsedTotal
        : offset + response.data.length;
      return {
        items: response.data,
        total,
        limit: pageSize,
        offset,
      };
    },
    enabled: userId !== "anonymous",
    placeholderData: (previous) => previous,
  });
}

export function useStats() {
  const userId = useCurrentUserId();
  return useQuery<ProgressStats>({
    queryKey: queryKeys.stats(userId),
    queryFn: () =>
      api.get<ProgressStats>("/api/progress/stats").then((r) => r.data),
    enabled: userId !== "anonymous",
  });
}

export function useMasteryMap() {
  const userId = useCurrentUserId();
  return useQuery<MasteryMap>({
    queryKey: queryKeys.masteryMap(userId),
    queryFn: () =>
      api.get<MasteryMap>("/api/progress/mastery").then((r) => r.data),
    enabled: userId !== "anonymous",
  });
}

export function useReviewList() {
  const userId = useCurrentUserId();
  return useQuery<ReviewItem[]>({
    queryKey: queryKeys.reviewList(userId),
    queryFn: () =>
      api.get<ReviewItem[]>("/api/progress/review").then((r) => r.data),
    retry: false, // graceful fail if no reviews
    enabled: userId !== "anonymous",
  });
}

export function useSaveProgress() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (data: ProgressSaveInput) =>
      api.post<ProgressSaveResponse>("/api/progress", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.progress(userId) });
    },
  });
}

export function useSendFreeTalk() {
  return useMutation({
    mutationFn: (data: FreeTalkInput) =>
      api.post<FreeTalkResponse>("/api/chat/free-talk", data).then((r) => r.data),
  });
}

// ── Admin Hooks ─────────────────────────────────────────────────────────────

export function useAdminStats() {
  const userId = useCurrentUserId();
  return useQuery<AdminStats>({
    queryKey: queryKeys.adminStats(userId),
    queryFn: () => api.get<AdminStats>("/api/admin/stats").then((r) => r.data),
    enabled: userId !== "anonymous",
  });
}

export function useAdminTopics(page = 0, pageSize = ADMIN_PAGE_SIZE) {
  const userId = useCurrentUserId();
  return useQuery<PaginatedResponse<TopicSummary>>({
    queryKey: queryKeys.adminTopics(userId, page, pageSize),
    queryFn: () =>
      api
        .get<PaginatedResponse<TopicSummary>>("/api/admin/topics", {
          params: { limit: pageSize, offset: page * pageSize },
        })
        .then((r) => r.data),
    enabled: userId !== "anonymous",
    placeholderData: (previous) => previous,
  });
}

export function useAdminTopicOptions() {
  const userId = useCurrentUserId();
  return useQuery<TopicSummary[]>({
    queryKey: queryKeys.adminTopicOptions(userId),
    queryFn: async () => {
      const topics: TopicSummary[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const response = await api.get<PaginatedResponse<TopicSummary>>(
          "/api/admin/topics",
          { params: { limit, offset } }
        );
        topics.push(...response.data.items);
        offset += response.data.items.length;
        if (
          response.data.items.length === 0 ||
          offset >= response.data.total
        ) {
          return topics;
        }
      }
    },
    enabled: userId !== "anonymous",
  });
}

export function useAdminCreateTopic() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (data: TopicMutationInput) =>
      api.post<ApiMessage & { id: string }>("/api/admin/topics", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}

export function useAdminUpdateTopic() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TopicMutationInput }) =>
      api.put<ApiMessage>(`/api/admin/topics/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}

export function useAdminDeleteTopic() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiMessage>(`/api/admin/topics/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}

export function useAdminConversations(
  topicId?: string,
  page = 0,
  pageSize = ADMIN_PAGE_SIZE
) {
  const userId = useCurrentUserId();
  return useQuery<PaginatedResponse<AdminConversation>>({
    queryKey: queryKeys.adminConversations(
      userId,
      topicId,
      page,
      pageSize
    ),
    queryFn: () =>
      api
        .get<PaginatedResponse<AdminConversation>>("/api/admin/conversations", {
          params: {
            ...(topicId ? { topic_id: topicId } : {}),
            limit: pageSize,
            offset: page * pageSize,
          },
        })
        .then((r) => r.data),
    enabled: userId !== "anonymous",
    placeholderData: (previous) => previous,
  });
}

export function useAdminCreateConversation() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (data: ConversationMutationInput) =>
      api
        .post<ApiMessage & { id: string }>("/api/admin/conversations", data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
      qc.invalidateQueries({ queryKey: ["topics"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useAdminDeleteConversation() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .delete<ApiMessage>(`/api/admin/conversations/${id}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
      qc.invalidateQueries({ queryKey: ["topics"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useAdminGenerateAudio() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (convId: string) =>
      api
        .post<AudioGenerationResponse>(
          `/api/admin/conversations/${convId}/generate-audio`,
          {},
          { timeout: 150_000 }
        )
        .then((r) => r.data),
    onSuccess: (_data, convId) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversation(convId) });
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
    },
  });
}

export function useAdminUsers(page = 0, pageSize = ADMIN_PAGE_SIZE) {
  const userId = useCurrentUserId();
  return useQuery<PaginatedResponse<AdminUser>>({
    queryKey: queryKeys.adminUsers(userId, page, pageSize),
    queryFn: () =>
      api
        .get<PaginatedResponse<AdminUser>>("/api/admin/users", {
          params: { limit: pageSize, offset: page * pageSize },
        })
        .then((r) => r.data),
    enabled: userId !== "anonymous",
    placeholderData: (previous) => previous,
  });
}

export function useAdminToggleUser() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .put<ApiMessage>(`/api/admin/users/${userId}/toggle-active`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoot(userId) });
    },
  });
}
