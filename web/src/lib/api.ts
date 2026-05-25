const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface FetchOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }

  async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;
    const accessToken = token || this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401 && endpoint !== "/api/auth/login") {
      // Token expired - try refresh
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.getToken()}`;
        const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
          ...fetchOptions,
          headers,
        });
        if (!retryResponse.ok) {
          throw new ApiError(retryResponse.status, await retryResponse.text());
        }
        return retryResponse.json();
      }
      // Refresh failed - logout
      this.logout();
      throw new ApiError(401, "Session expired");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorData.detail || "Something went wrong"
      );
    }

    return response.json();
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;

    try {
      const response = await fetch(
        `${this.baseUrl}/api/auth/refresh?refresh_token=${refreshToken}`,
        { method: "POST" }
      );
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  private logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/login";
  }

  // ---- Auth ----
  async register(email: string, password: string, full_name: string) {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name }),
    });
  }

  async login(email: string, password: string) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async googleLogin(token: string) {
    return this.request("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async getMe() {
    return this.request("/api/auth/me");
  }

  // ---- Topics ----
  async getTopics(level?: string) {
    const q = level ? `?level=${level}` : "";
    return this.request(`/api/topics${q}`);
  }

  async getTopic(id: string) {
    return this.request(`/api/topics/${id}`);
  }

  // ---- Conversations ----
  async getConversation(id: string) {
    return this.request(`/api/conversations/${id}`);
  }

  // ---- Progress ----
  async saveProgress(data: {
    conversation_id: string;
    role_played: string;
    completed_lines: number;
    total_lines: number;
    is_completed: boolean;
    pronunciation_score?: number;
    practice_mode: number;
    response_times: number[];
  }) {
    return this.request("/api/progress", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getProgress() {
    return this.request("/api/progress");
  }

  async getStats() {
    return this.request("/api/progress/stats");
  }

  async getMasteryMap() {
    return this.request("/api/progress/mastery");
  }

  async getReviewList() {
    return this.request("/api/progress/review");
  }

  async sendFreeTalk(data: {
    conversation_id: string;
    user_input: string;
    history: { role: string; content: string }[];
    role_played: string;
  }) {
    return this.request("/api/chat/free-talk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---- Admin ----
  async adminGetStats() {
    return this.request("/api/admin/stats");
  }

  async adminGetTopics() {
    return this.request("/api/admin/topics");
  }

  async adminCreateTopic(data: Record<string, unknown>) {
    return this.request("/api/admin/topics", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async adminUpdateTopic(id: string, data: Record<string, unknown>) {
    return this.request(`/api/admin/topics/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async adminDeleteTopic(id: string) {
    return this.request(`/api/admin/topics/${id}`, { method: "DELETE" });
  }

  async adminGetConversations(topicId?: string) {
    const q = topicId ? `?topic_id=${topicId}` : "";
    return this.request(`/api/admin/conversations${q}`);
  }

  async adminGetConversation(id: string) {
    return this.request(`/api/admin/conversations/${id}`);
  }

  async adminCreateConversation(data: Record<string, unknown>) {
    return this.request("/api/admin/conversations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async adminUpdateConversation(id: string, data: Record<string, unknown>) {
    return this.request(`/api/admin/conversations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async adminDeleteConversation(id: string) {
    return this.request(`/api/admin/conversations/${id}`, { method: "DELETE" });
  }

  async adminAddLine(convId: string, data: Record<string, unknown>) {
    return this.request(`/api/admin/conversations/${convId}/lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async adminDeleteLine(lineId: string) {
    return this.request(`/api/admin/lines/${lineId}`, { method: "DELETE" });
  }

  async adminGenerateAudio(convId: string) {
    return this.request(`/api/admin/conversations/${convId}/generate-audio`, {
      method: "POST",
    });
  }

  async adminGetUsers() {
    return this.request("/api/admin/users");
  }

  async adminToggleUser(userId: string) {
    return this.request(`/api/admin/users/${userId}/toggle-active`, {
      method: "PUT",
    });
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const api = new ApiClient(API_URL);
export { API_URL };
