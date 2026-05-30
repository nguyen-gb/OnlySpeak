import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── Axios instance ──────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

// ── Request interceptor: attach access token ────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

// ── Response interceptor: auto-refresh on 401 ──────────────────────────────
const NON_REFRESHABLE = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/refresh",
];

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;

  try {
    const res = await axios.post(
      `${API_URL}/api/auth/refresh`,
      { refresh_token: rt }
    );
    setTokens(res.data.access_token, res.data.refresh_token);
    return true;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!originalRequest) return Promise.reject(error);

    const endpoint = originalRequest.url || "";
    const relativeUrl = endpoint.startsWith("http")
      ? endpoint.replace(API_URL, "")
      : endpoint;
    const isNonRefreshable = NON_REFRESHABLE.some((p) =>
      relativeUrl.startsWith(p)
    );

    if (error.response?.status === 401 && !isNonRefreshable && !originalRequest._retry) {
      originalRequest._retry = true;

      // Deduplicate concurrent refresh calls
      if (!refreshPromise) {
        refreshPromise = tryRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;

      if (refreshed) {
        const newToken = getAccessToken();
        if (originalRequest.headers) {
          originalRequest.headers.set("Authorization", `Bearer ${newToken}`);
        }
        return api(originalRequest);
      }

      // Refresh failed → force logout
      clearTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// ── Export a typed error helper ─────────────────────────────────────────────
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message
    );
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export { api };
export default api;
