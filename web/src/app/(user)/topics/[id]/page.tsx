"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useTopic, useMasteryMap } from "@/hooks/useApi";
import { QueryError } from "@/components/QueryState";
import { ArrowLeft, Play, Users, MessageSquare, Trophy, Flame, Target, Zap } from "lucide-react";
import styles from "./topicDetail.module.css";

// ── Types and Helpers ────────────────────────────────────────────────────────
const ROLE_SUCCESS_CAP_BY_MODE: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 3,
  5: 1,
};
const RELEASED_MODE_COUNT = 4;

function getCompletedModeCount(modeScores?: Record<string, { passed?: boolean }>) {
  return Array.from({ length: RELEASED_MODE_COUNT }, (_, index) => String(index + 1))
    .filter((mode) => modeScores?.[mode]?.passed)
    .length;
}

function TopicDetailSkeleton() {
  return (
    <div className="animate-fade-in" role="status" aria-live="polite">
      <span className="sr-only">Loading topic and conversations</span>
      <div className={`skeleton skeleton-text ${styles.backSkeleton}`} />
      <div className={styles.topicHeader}>
        <div className={`skeleton ${styles.topicIconBig}`} />
        <div className={styles.headerSkeletonContent}>
          <div className={`skeleton skeleton-title ${styles.headerTitleSkeleton}`} />
          <div className={`skeleton skeleton-text ${styles.headerDescSkeleton}`} />
          <div className={`skeleton ${styles.headerBadgeSkeleton}`} />
        </div>
      </div>
      <div className={`skeleton skeleton-title ${styles.sectionTitleSkeleton}`} />
      <div className={styles.convList}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`${styles.convCard} ${styles.convSkeletonCard}`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className={styles.convInfo}>
              <div className={styles.convTitleRow}>
                <div className={`skeleton skeleton-title ${styles.convTitleSkeleton}`} />
                <div className={`skeleton ${styles.convModeSkeleton}`} />
              </div>
              <div className={`skeleton skeleton-text ${styles.convSituationSkeleton}`} />
              <div className={styles.convMeta}>
                <div className={`skeleton skeleton-text ${styles.convMetaSkeletonWide}`} />
                <div className={`skeleton skeleton-text ${styles.convMetaSkeleton}`} />
              </div>
              <div className={styles.masterySection}>
                <div className={styles.masteryHeader}>
                  <div className={`skeleton skeleton-text ${styles.masteryLabelSkeleton}`} />
                  <div className={`skeleton skeleton-text ${styles.masteryPercentSkeleton}`} />
                </div>
                <div className={`skeleton ${styles.masteryBar}`} />
              </div>
            </div>
            <div className={`skeleton ${styles.convButtonSkeleton}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function getRoleProgress(mode: number, modeData?: { role_success_counts?: Record<string, number> }) {
  const roleCounts = modeData?.role_success_counts || {};
  const cap = ROLE_SUCCESS_CAP_BY_MODE[mode] || 1;
  return {
    a: Math.min(roleCounts.A || 0, cap),
    b: Math.min(roleCounts.B || 0, cap),
  };
}

function getMasteryLabel(level: number) {
  if (level >= 95) return { text: "Mastered", color: "#10b981" };
  if (level >= 75) return { text: "Advanced", color: "#f59e0b" };
  if (level >= 50) return { text: "Intermediate", color: "#3b82f6" };
  if (level >= 25) return { text: "Beginner", color: "#8b5cf6" };
  if (level > 0) return { text: "Started", color: "#6b7280" };
  return { text: "New", color: "#64748b" };
}

export default function TopicDetailPage() {
  const params = useParams();
  const idParam = params.id;
  const topicId = Array.isArray(idParam) ? idParam[0] : (idParam ?? "");
  const topicQuery = useTopic(topicId);
  const masteryQuery = useMasteryMap();
  const data = topicQuery.data;
  const masteryMap = masteryQuery.data ?? {};
  const topicLoading = topicQuery.isLoading;
  const masteryLoading = masteryQuery.isLoading;
  const loading = topicLoading || masteryLoading;

  if (loading) return <TopicDetailSkeleton />;

  if (topicQuery.isError || masteryQuery.isError) {
    return (
      <QueryError
        error={topicQuery.error ?? masteryQuery.error}
        title="This topic couldn't be loaded"
        onRetry={() => {
          void topicQuery.refetch();
          void masteryQuery.refetch();
        }}
      />
    );
  }

  if (!data) {
    return <div className="empty-state"><h3>Topic not found</h3></div>;
  }

  const { topic, conversations } = data;

  return (
    <div className="animate-fade-in">
      <Link href="/topics" className={styles.backLink}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to Topics
      </Link>

      <div className={styles.topicHeader}>
        <div className={styles.topicIconBig} aria-hidden="true">{topic.icon}</div>
        <div>
          <h1>{topic.title}</h1>
          {topic.description && <p>{topic.description}</p>}
          <div style={{ marginTop: 8 }}>
            <span className={`badge badge-${topic.level}`}>{topic.level}</span>
          </div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>
        <MessageSquare size={20} aria-hidden="true" />
        Conversations ({conversations.length})
      </h2>

      {conversations.length === 0 ? (
        <div className="empty-state">
          <h3>No conversations yet</h3>
          <p>Conversations for this topic are coming soon!</p>
        </div>
      ) : (
        <div className={styles.convList}>
          {conversations.map((conv, i) => {
            const mastery = masteryMap[conv.id];
            const masteryLevel = Math.min(100, Math.max(0, mastery?.mastery_level ?? 0));
            const masteryInfo = getMasteryLabel(masteryLevel);
            const practiceCount = mastery?.practice_count ?? 0;
            const streak = mastery?.streak_perfect ?? 0;
            const currentMode = Math.min(mastery?.current_mode ?? 1, RELEASED_MODE_COUNT);
            const completedModeCount = getCompletedModeCount(mastery?.mode_scores);
            const avgRT = mastery?.avg_response_time ?? 0;

            return (
              <div
                key={conv.id}
                className={styles.convCard}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className={styles.convInfo}>
                  <div className={styles.convTitleRow}>
                    <h3>{conv.title}</h3>
                    {masteryLevel >= 95 && (
                      <span className={styles.masteredBadge}>
                        <Trophy size={14} aria-hidden="true" /> Mastered
                      </span>
                    )}
                    <span className={styles.modeBadge}>
                       Level {completedModeCount}/{RELEASED_MODE_COUNT}
                    </span>
                  </div>
                  {conv.situation && (
                    <p className={styles.situation}>{conv.situation}</p>
                  )}
                  <div className={styles.convMeta}>
                    <span className={styles.roles}>
                      <Users size={14} aria-hidden="true" />
                      {conv.role_a_name} & {conv.role_b_name}
                    </span>
                    <span className={styles.lineCount}>
                      {conv.line_count} lines
                    </span>
                    {avgRT > 0 && (
                      <span className={styles.rtStat}>
                        <Zap size={12} aria-hidden="true" /> {avgRT}s reflex
                      </span>
                    )}
                  </div>

                  {/* Mastery Progress Bar */}
                  <div className={styles.masterySection}>
                    <div className={styles.masteryHeader}>
                      <span className={styles.masteryLabel}>
                        {masteryInfo.text}
                      </span>
                      <span className={styles.masteryPercent} style={{ color: masteryInfo.color }}>
                        {masteryLevel.toFixed(1)}%
                      </span>
                    </div>
                    <div
                      className={styles.masteryBar}
                      role="progressbar"
                      aria-label={`Mastery for ${conv.title}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={masteryLevel}
                    >
                      <div
                        className={styles.masteryFill}
                        style={{
                          width: `${masteryLevel}%`,
                          background: masteryLevel >= 95
                            ? "linear-gradient(90deg, #10b981, #059669)"
                            : masteryLevel >= 50
                              ? "linear-gradient(90deg, #3b82f6, #2563eb)"
                              : "linear-gradient(90deg, var(--primary), var(--primary-600))",
                        }}
                      />
                    </div>
                    {practiceCount > 0 && (
                      <div className={styles.masteryMeta}>
                        <span><Target size={12} aria-hidden="true" /> {practiceCount} times practiced</span>
                        {streak > 0 && (
                          <span className={styles.streakBadge}>
                            <Flame size={12} aria-hidden="true" /> {streak} streak
                          </span>
                        )}
                        {masteryLevel < 95 && (() => {
                          const modeKey = String(currentMode);
                          const modeData = mastery?.mode_scores?.[modeKey];
                          const required = currentMode === 4 ? 5 : currentMode === 5 ? 2 : 3;
                          const successCount = Math.min(modeData?.success_count || 0, required);
                          const remaining = Math.max(0, required - successCount);
                          const roleProgress = getRoleProgress(currentMode, modeData);
                          return (
                            <span className={styles.masteryHint}>
                              {currentMode === 4
                                ? `Need ${remaining} more Speed Talker sessions (>=90% and tap within 3s)`
                                : currentMode === 5
                                  ? `Need ${remaining} more Fluent sessions (>=90%)`
                                : `Need ${remaining} more perfect sessions (>=90%) in Level ${currentMode}`}
                              <span className={styles.roleProgressInline}>
                                <span className={roleProgress.a > 0 ? styles.roleActive : styles.roleInactive}>Role A</span>
                                <span className={roleProgress.b > 0 ? styles.roleActive : styles.roleInactive}>Role B</span>
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                <Link
                  href={`/practice/${conv.id}`}
                  className="btn btn-primary"
                >
                  <Play size={16} aria-hidden="true" />
                  {practiceCount > 0 ? "Practice Again" : "Practice"}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
