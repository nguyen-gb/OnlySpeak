export type TopicLevel = "beginner" | "intermediate" | "advanced";
export type ConversationRole = "A" | "B";

export interface ApiMessage {
  message: string;
}

export interface AudioGenerationResponse extends ApiMessage {
  generated_count: number;
  failed_count: number;
  failed_line_ids: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  provider: string;
  is_active: boolean;
  streak_count: number;
  total_xp: number;
  daily_goal_count: number;
  created_at: string;
}

export interface AuthResponse {
  token_type: "bearer" | string;
  user: ApiUser;
}

export interface TopicSummary {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  level: TopicLevel;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  conversation_count: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  description?: string | null;
  situation: string | null;
  role_a_name: string;
  role_b_name: string;
  level?: TopicLevel;
  line_count: number;
}

export interface TopicDetailResponse {
  topic: Omit<TopicSummary, "conversation_count">;
  conversations: ConversationSummary[];
}

export interface ModeScore {
  passed?: boolean;
  success_count?: number;
  best?: number;
  role_success_counts?: Partial<Record<ConversationRole, number>>;
}

export interface ProgressItem {
  id: string;
  attempt_id: string;
  user_id: string;
  conversation_id: string;
  conversation_title: string;
  conversation_situation: string;
  role_played: string;
  completed_lines: number;
  total_lines: number;
  is_completed: boolean;
  pronunciation_score: number | null;
  practice_mode: number;
  response_times: number[];
  avg_response_time: number;
  xp_gained: number;
  practice_count: number;
  is_legacy: boolean;
  last_practiced_at: string;
  created_at: string;
}

export interface ProgressSummary {
  id: string;
  user_id: string;
  conversation_id: string;
  conversation_title: string;
  conversation_situation: string;
  role_played: string;
  completed_lines: number;
  total_lines: number;
  is_completed: boolean;
  pronunciation_score: number | null;
  practice_count: number;
  best_score: number;
  streak_perfect: number;
  mastery_level: number;
  scores_history: number[];
  current_mode: number;
  mode_scores: Record<string, ModeScore>;
  avg_response_time: number;
  next_review_at: string | null;
  last_practiced_at: string;
  created_at: string;
}

export interface ProgressStats {
  total_practiced: number;
  total_completed: number;
  average_score: number | null;
  streak_days: number;
  total_mastered: number;
  overall_mastery: number;
  due_for_review: number;
  recent_progress: ProgressSummary[];
}

export interface ReviewItem {
  progress: ProgressSummary;
  conversation_title: string;
  conversation_situation: string;
  overdue_days: number;
}

export interface MasteryEntry {
  mastery_level: number;
  practice_count: number;
  best_score: number;
  streak_perfect: number;
  pronunciation_score: number;
  current_mode: number;
  avg_response_time: number;
  mode_scores: Record<string, ModeScore>;
}

export type MasteryMap = Record<string, MasteryEntry>;

export interface ProgressSaveInput {
  attempt_id: string;
  conversation_id: string;
  role_played: ConversationRole;
  completed_lines: number;
  total_lines: number;
  is_completed: boolean;
  pronunciation_score?: number;
  practice_mode: number;
  response_times: number[];
}

export interface ProgressSaveResponse extends ProgressSummary {
  attempt_id: string;
  xp_gained: number;
  was_duplicate: boolean;
}

export interface FreeTalkInput {
  conversation_id: string;
  user_input: string;
  history: { role: "user" | "model"; content: string }[];
  role_played: ConversationRole;
}

export interface FreeTalkResponse {
  reply: string;
  evaluation: {
    score: number;
    grammar_feedback: string;
    vocabulary_tip: string;
    overall_feedback: string;
  };
}

export interface AdminStats {
  users: number;
  topics: number;
  conversations: number;
  total_practices: number;
}

export interface AdminConversation {
  id: string;
  topic_id: string;
  title: string;
  description: string | null;
  role_a_name: string;
  role_b_name: string;
  level: TopicLevel;
  sort_order: number;
  is_published: boolean;
  line_count: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  provider: string;
  is_active: boolean;
  created_at: string;
}

export interface TopicMutationInput {
  title: string;
  description: string;
  icon: string;
  level: TopicLevel;
  sort_order: number;
  is_published: boolean;
}

export interface ConversationLineInput {
  speaker: ConversationRole;
  text_en: string;
  pronunciation_hint: string;
  line_order?: number;
}

export interface ConversationMutationInput {
  topic_id: string;
  title: string;
  description: string;
  situation: string;
  role_a_name: string;
  role_b_name: string;
  level: TopicLevel;
  sort_order: number;
  is_published: boolean;
  lines: ConversationLineInput[];
}
