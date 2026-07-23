"use client";

import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";
import { useStats, useReviewList } from "@/hooks/useApi";
import { QueryError } from "@/components/QueryState";
import {
  BookOpen,
  Target,
  ArrowRight,
  MessageCircle,
  Award,
  Trophy,
  Flame,
  Calendar,
  Clock,
  Zap,
} from "lucide-react";
import styles from "./dashboard.module.css";

const RELEASED_MODE_COUNT = 4;

function getCompletedModeCount(modeScores?: Record<string, { passed?: boolean }>) {
  return Array.from({ length: RELEASED_MODE_COUNT }, (_, index) => String(index + 1))
    .filter((mode) => modeScores?.[mode]?.passed)
    .length;
}

function getMasteryLabel(level: number) {
  if (level >= 95) return { text: "Mastered", color: "#10b981" };
  if (level >= 75) return { text: "Advanced", color: "#f59e0b" };
  if (level >= 50) return { text: "Intermediate", color: "#3b82f6" };
  if (level >= 25) return { text: "Beginner", color: "#8b5cf6" };
  if (level > 0) return { text: "Started", color: "#6b7280" };
  return { text: "New", color: "#cbd5e1" };
}

function DashboardSkeleton() {
  return (
    <>
      <div className={styles.statsGrid} aria-label="Loading stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className={`skeleton ${styles.statIconSkeleton}`} />
            <div className={`skeleton ${styles.statValueSkeleton}`} />
            <div className={`skeleton skeleton-text ${styles.statLabelSkeleton}`} />
          </div>
        ))}
      </div>
      <div className={styles.masteryOverview}>
        <div className={styles.masteryOverviewHeader}>
          <div className={`skeleton skeleton-title ${styles.masteryTitleSkeleton}`} />
          <div className={`skeleton ${styles.masteryBadgeSkeleton}`} />
        </div>
        <div className={styles.masteryBarContainer}>
          <div className={`skeleton ${styles.masteryBar}`} />
          <div className={`skeleton ${styles.masteryPercentSkeleton}`} />
        </div>
      </div>
      <div className={styles.recent}>
        <div className={`skeleton skeleton-title ${styles.recentHeadingSkeleton}`} />
        <div className={styles.recentList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${styles.recentItem} ${styles.recentSkeletonItem}`}>
              <div className={styles.recentInfo}>
                <div className={`skeleton skeleton-title ${styles.recentTitleSkeleton}`} />
                <div className={`skeleton skeleton-text ${styles.recentRoleSkeleton}`} />
                <div className={`skeleton skeleton-text ${styles.recentDateSkeleton}`} />
              </div>
              <div className={styles.recentMeta}>
                <div className={`skeleton ${styles.recentPillSkeleton}`} />
                <div className={`skeleton ${styles.recentPillSkeletonWide}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const statsQuery = useStats();
  const reviewsQuery = useReviewList();
  const stats = statsQuery.data;
  const reviewList = reviewsQuery.data ?? [];
  const statsLoading = statsQuery.isLoading;
  const reviewsLoading = reviewsQuery.isLoading;

  const loading = statsLoading || reviewsLoading;
  const hasError = statsQuery.isError || reviewsQuery.isError;

  const overallMastery = stats?.overall_mastery ?? 0;
  const masteryInfo = getMasteryLabel(overallMastery);
  const streakCount = user?.streak_count ?? 0;
  const totalXp = user?.total_xp ?? 0;

  return (
    <div className="animate-fade-in">
      <div className={styles.welcome}>
        <div className={styles.welcomeInfo}>
          <h1 className={styles.welcomeTitle}>
            Welcome back, {user?.full_name?.split(" ")[0]}! 👋
          </h1>
          <div className={styles.userStatusRow}>
             <div className={styles.streakBadge}>
                <Flame size={16} fill="currentColor" aria-hidden="true" />
                <span>{streakCount} Day Streak</span>
             </div>
             <div className={styles.levelBadge}>
                <Zap size={16} fill="currentColor" aria-hidden="true" />
                <span>Level {Math.floor(totalXp / 100) + 1}</span>
                <small>({totalXp} XP)</small>
             </div>
          </div>
          <p className={styles.welcomeDesc}>
            {reviewsLoading
              ? "Checking your review schedule..."
              : reviewList.length > 0
              ? `You have ${reviewList.length} reviews due today. Keep your streak alive!`
              : "Ready to practice your English speaking skills?"}
          </p>
        </div>
        <Link href="/topics" className="btn btn-primary">
          <BookOpen size={18} aria-hidden="true" />
          Browse Topics
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {hasError ? (
        <QueryError
          error={statsQuery.error ?? reviewsQuery.error}
          title="Your dashboard couldn't be loaded"
          onRetry={() => {
            void statsQuery.refetch();
            void reviewsQuery.refetch();
          }}
        />
      ) : null}

      {/* Daily Review Section (SRS) */}
      {!loading && !hasError && reviewList.length > 0 && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewHeader}>
            <div className={styles.reviewTitle}>
              <Calendar size={20} aria-hidden="true" />
              <h2>Daily Review Session</h2>
              <span className={styles.reviewBadge}>{reviewList.length}</span>
            </div>
            <p>Mastery requires repetition. Review these to maintain your reflex speed.</p>
          </div>
          <div className={styles.reviewGrid}>
            {reviewList.slice(0, 3).map((item) => (
              <div key={item.progress.id} className={styles.reviewCard}>
                <div className={styles.reviewCardInfo}>
                   <h3>{item.conversation_title}</h3>
                   <div className={styles.reviewMeta}>
                      <span className={styles.modeIndicator}>Level {getCompletedModeCount(item.progress.mode_scores)}/{RELEASED_MODE_COUNT}</span>
                      <span className={styles.overdueText}>
                        <Clock size={12} aria-hidden="true" /> {item.overdue_days > 0 ? `${Math.ceil(item.overdue_days)}d overdue` : "Due today"}
                      </span>
                   </div>
                </div>
                <Link 
                  href={`/practice/${item.progress.conversation_id}`} 
                  className="btn btn-secondary btn-sm"
                >
                  Review Now
                </Link>
              </div>
            ))}
            {reviewList.length > 3 && (
              <div className={styles.moreReviews}>
                And {reviewList.length - 3} more conversations...
              </div>
            )}
          </div>
        </div>
      )}

      {hasError ? null : loading ? (
        <DashboardSkeleton />
      ) : (
        <>
      <div className={styles.statsGrid}>
        <div className="stat-card">
          <div className="stat-icon"><MessageCircle size={22} aria-hidden="true" /></div>
          <div className="stat-value">{stats?.total_practiced ?? 0}</div>
          <div className="stat-label">Practiced</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-light)", color: "var(--success)" }}>
            <Target size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">{stats?.total_completed ?? 0}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--warning-light)", color: "var(--warning)" }}>
            <Award size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">
            {stats?.average_score !== null && stats?.average_score !== undefined
              ? `${stats.average_score}%`
              : "—"}
          </div>
          <div className="stat-label">Avg. Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dcfce7", color: "#10b981" }}>
            <Trophy size={22} aria-hidden="true" />
          </div>
          <div className="stat-value">{stats?.total_mastered ?? 0}</div>
          <div className="stat-label">Mastered</div>
        </div>
      </div>

      {/* Overall Mastery Progress */}
      {!loading && stats && stats.total_practiced > 0 && (
        <div className={styles.masteryOverview}>
          <div className={styles.masteryOverviewHeader}>
            <h2><Flame size={20} aria-hidden="true" /> Overall Mastery</h2>
            <span className={styles.masteryBadge} style={{ background: masteryInfo.color }}>
              {masteryInfo.text}
            </span>
          </div>
          <div className={styles.masteryBarContainer}>
            <div
              className={styles.masteryBar}
              role="progressbar"
              aria-label="Overall conversation mastery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallMastery}
            >
              <div
                className={styles.masteryFill}
                style={{
                  width: `${overallMastery}%`,
                  background: overallMastery >= 95
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : overallMastery >= 50
                      ? "linear-gradient(90deg, #3b82f6, #2563eb)"
                      : "linear-gradient(90deg, var(--primary), var(--primary-600))",
                }}
              />
            </div>
            <span className={styles.masteryPercent}>{overallMastery.toFixed(1)}%</span>
          </div>
          {stats.due_for_review > 0 && (
            <div className={styles.srsHint}>
              <Zap size={14} aria-hidden="true" /> You have <strong>{stats.due_for_review}</strong> conversations due for review to maintain your mastery.
            </div>
          )}
        </div>
      )}

      {stats?.recent_progress && stats.recent_progress.length > 0 && (
        <div className={styles.recent}>
          <h2>Recent History</h2>
          <div className={styles.recentList}>
            {stats.recent_progress.slice(0, 5).map((p) => {
              const mInfo = getMasteryLabel(p.mastery_level ?? 0);
              return (
                <Link key={p.id} href={`/practice/${p.conversation_id}`} className={styles.recentItem}>
                  <div className={styles.recentInfo}>
                    <span className={styles.recentTitle}>
                      {p.conversation_title || `Conversation ${String(p.conversation_id).slice(0, 8)}`}
                    </span>
                    <span className={styles.recentRole}>Role {p.role_played} (Level {getCompletedModeCount(p.mode_scores)}/{RELEASED_MODE_COUNT})</span>
                    <time className={styles.recentDate} dateTime={p.last_practiced_at}>
                      {new Date(p.last_practiced_at).toLocaleDateString()}
                    </time>
                  </div>
                  <div className={styles.recentMeta}>
                    {typeof p.avg_response_time === "number" && p.avg_response_time > 0 && (
                       <span className={styles.rtBadgeSmall}>⚡ {p.avg_response_time}s</span>
                    )}
                    <span
                      className={styles.masterySmallBadge}
                      style={{ color: mInfo.color, borderColor: mInfo.color }}
                    >
                      {mInfo.text} {(p.mastery_level ?? 0).toFixed(0)}%
                    </span>
                    <span className={`badge ${p.is_completed ? 'badge-success' : 'badge-warning'}`}>
                      {p.is_completed ? 'Completed' : 'Partial'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(!stats?.recent_progress || stats.recent_progress.length === 0) && !loading && (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>🎤</div>
          <h3>No practice sessions yet</h3>
          <p>Start your first conversation to track your progress!</p>
          <Link href="/topics" className="btn btn-primary">
            Explore Topics <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
        </>
      )}
    </div>
  );
}
