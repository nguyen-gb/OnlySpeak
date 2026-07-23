"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/api";

interface QueryErrorProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

export function QueryError({
  error,
  onRetry,
  title = "We couldn't load this content",
}: QueryErrorProps) {
  return (
    <div className="query-error" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <div className="query-error-content">
        <strong>{title}</strong>
        <span>{getErrorMessage(error)}</span>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

interface PageLoaderProps {
  label?: string;
}

export function PageLoader({ label = "Loading" }: PageLoaderProps) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="spinner spinner-lg" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
