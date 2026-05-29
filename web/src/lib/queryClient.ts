import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes before data is considered stale
      gcTime: 10 * 60 * 1000,           // 10 minutes garbage collection time
      retry: 1,                          // Retry failed requests once
      refetchOnWindowFocus: true,        // Refetch when user returns to tab
      refetchOnReconnect: true,          // Refetch on network reconnect
    },
    mutations: {
      retry: 0,
    },
  },
});
