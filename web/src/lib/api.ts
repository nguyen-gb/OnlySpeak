import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export const API_URL =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(
    /\/+$/,
    ""
  );

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20_000,
  withCredentials: true,
});

const NON_REFRESHABLE = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/auth/logout",
];

type RefreshResult = "refreshed" | "invalid" | "unavailable";
type SessionAwareAxiosError = AxiosError & {
  sessionRefreshUnavailable?: boolean;
};
let refreshPromise: Promise<RefreshResult> | null = null;

async function tryRefresh(): Promise<RefreshResult> {
  try {
    await axios.post(
      `${API_URL}/api/auth/refresh`,
      {},
      { timeout: 20_000, withCredentials: true }
    );
    return "refreshed";
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 400 || status === 401 || status === 403) {
        return "invalid";
      }
    }

    // A timeout or temporary server outage must not destroy a valid session.
    return "unavailable";
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (!originalRequest) return Promise.reject(error);

    const endpoint = originalRequest.url || "";
    const wasRetried = originalRequest._retry === true;
    const relativeUrl = endpoint.startsWith("http")
      ? endpoint.replace(API_URL, "")
      : endpoint;
    const isNonRefreshable = NON_REFRESHABLE.some((path) =>
      relativeUrl.startsWith(path)
    );

    if (
      error.response?.status === 401 &&
      !isNonRefreshable &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = tryRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const result = await refreshPromise;
      if (result === "refreshed") {
        return api(originalRequest);
      }

      if (result === "invalid" && typeof window !== "undefined") {
        window.dispatchEvent(new Event("onlyspeak:session-expired"));
      }

      if (result === "unavailable") {
        (error as SessionAwareAxiosError).sessionRefreshUnavailable = true;
      }
    }

    if (
      error.response?.status === 401 &&
      !isNonRefreshable &&
      wasRetried &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event("onlyspeak:session-expired"));
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const validationMessages = detail
        .map((item) => {
          if (typeof item !== "object" || item === null) return null;
          const message = "msg" in item ? String(item.msg) : "Invalid value";
          const location =
            "loc" in item && Array.isArray(item.loc)
              ? item.loc.slice(1).map(String).join(".")
              : "";
          return location ? `${location}: ${message}` : message;
        })
        .filter((item): item is string => Boolean(item));
      if (validationMessages.length > 0) {
        return validationMessages.join("; ");
      }
    }

    const message = error.response?.data?.message;
    if (typeof message === "string") return message;

    return error.message;
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export function isTransientApiError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const sessionError = error as SessionAwareAxiosError;
  return (
    sessionError.sessionRefreshUnavailable === true ||
    !error.response ||
    error.response.status >= 500
  );
}

export { api };
export default api;
