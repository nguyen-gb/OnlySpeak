"use client";

import { useState } from "react";
import Link from "next/link";
import { useTopics } from "@/hooks/useApi";
import { BookOpen, MessageSquare, ChevronRight } from "lucide-react";
import { QueryError } from "@/components/QueryState";
import styles from "./topics.module.css";

function TopicsSkeleton() {
  return (
    <div className={styles.topicGrid} role="status" aria-live="polite">
      <span className="sr-only">Loading conversation topics</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`${styles.topicCard} ${styles.topicSkeletonCard}`}
          style={{ animationDelay: `${i * 0.04}s` }}
          aria-hidden="true"
        >
          <div className={`skeleton ${styles.topicSkeletonIcon}`} />
          <div className={styles.topicContent}>
            <div className={`skeleton skeleton-title ${styles.skeletonTitle}`} />
            <div className={`skeleton skeleton-text ${styles.skeletonDesc}`} />
            <div className={styles.topicMeta}>
              <div className={`skeleton ${styles.skeletonBadge}`} />
              <div className={`skeleton skeleton-text ${styles.skeletonCount}`} />
            </div>
          </div>
          <div className={`skeleton ${styles.skeletonArrow}`} />
        </div>
      ))}
    </div>
  );
}

export default function TopicsPage() {
  const [levelFilter, setLevelFilter] = useState("");
  const {
    data: topics = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useTopics(levelFilter || undefined);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Conversation Topics</h1>
        <p>Choose a topic to start practicing</p>
      </div>

      <div className={styles.filters} role="group" aria-label="Filter topics by level">
        {["", "beginner", "intermediate", "advanced"].map((level) => (
          <button
            key={level}
            type="button"
            className={`btn btn-sm ${levelFilter === level ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setLevelFilter(level)}
            aria-pressed={levelFilter === level}
          >
            {level === "" ? "All Levels" : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} title="Topics are unavailable" />
      ) : loading ? (
        <TopicsSkeleton />
      ) : topics.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={64} aria-hidden="true" />
          <h3>No topics found</h3>
          <p>Check back later for new conversation topics!</p>
        </div>
      ) : (
        <div className={styles.topicGrid}>
          {topics.map((topic, i) => (
            <Link
              href={`/topics/${topic.id}`}
              key={topic.id}
              className={styles.topicCard}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className={styles.topicIcon}>{topic.icon}</div>
              <div className={styles.topicContent}>
                <h3>{topic.title}</h3>
                {topic.description && (
                  <p className={styles.topicDesc}>{topic.description}</p>
                )}
                <div className={styles.topicMeta}>
                  <span className={`badge badge-${topic.level}`}>
                    {topic.level}
                  </span>
                  <span className={styles.convCount}>
                    <MessageSquare size={14} aria-hidden="true" />
                    {topic.conversation_count} conversations
                  </span>
                </div>
              </div>
              <ChevronRight size={20} className={styles.topicArrow} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
