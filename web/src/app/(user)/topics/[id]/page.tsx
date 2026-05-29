"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTopic, useMasteryMap } from "@/hooks/useApi";
import { ArrowLeft, Play, Users, MessageSquare, Trophy, Flame, Target, Zap } from "lucide-react";
import styles from "./topicDetail.module.css";

// ── Types and Helpers ────────────────────────────────────────────────────────
interface Topic {
  id: string;
  title: string;
  description?: string;
  level: string;
  icon: string;
}

interface Conversation {
  id: string;
  title: string;
  situation: string;
  role_a_name: string;
  role_b_name: string;
  line_count: number;
}

interface TopicData {
  topic: Topic;
  conversations: Conversation[];
}

interface MasteryData {
  mastery_level: number;
  practice_count: number;
  streak_perfect: number;
  current_mode: number;
  avg_response_time: number;
  mode_scores?: Record<string, {
    best?: number;
    streak?: number;
    success_count?: number;
    role_success_counts?: Record<string, number>;
    passed?: boolean;
  }>;
}

const ROLE_SUCCESS_CAP = 2;

function getRoleProgress(modeData?: { role_success_counts?: Record<string, number> }) {
  const roleCounts = modeData?.role_success_counts || {};
  return {
    a: Math.min(roleCounts.A || 0, ROLE_SUCCESS_CAP),
    b: Math.min(roleCounts.B || 0, ROLE_SUCCESS_CAP),
  };
}

function getMasteryLabel(level: number) {
  if (level >= 95) return { text: "Mastered", color: "#10b981", emoji: "🏆" };
  if (level >= 75) return { text: "Advanced", color: "#f59e0b", emoji: "🔥" };
  if (level >= 50) return { text: "Intermediate", color: "#3b82f6", emoji: "📈" };
  if (level >= 25) return { text: "Beginner", color: "#8b5cf6", emoji: "🌱" };
  if (level > 0) return { text: "Started", color: "#6b7280", emoji: "👣" };
  return { text: "New", color: "#cbd5e1", emoji: "" };
}

export default function TopicDetailPage() {
  const params = useParams();
  const topicId = params.id as string;
  const { data: rawData, isLoading: topicLoading } = useTopic(topicId);
  const data = rawData as TopicData | undefined;
  const { data: masteryMap = {}, isLoading: masteryLoading } = useMasteryMap();
  const loading = topicLoading || masteryLoading;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!data) {
    return <div className="empty-state"><h3>Topic not found</h3></div>;
  }

  const { topic, conversations } = data;

  return (
    <div className="animate-fade-in">
      <Link href="/topics" className={styles.backLink}>
        <ArrowLeft size={18} />
        Back to Topics
      </Link>

      <div className={styles.topicHeader}>
        <div className={styles.topicIconBig}>{topic.icon}</div>
        <div>
          <h1>{topic.title}</h1>
          {topic.description && <p>{topic.description}</p>}
          <div style={{ marginTop: 8 }}>
            <span className={`badge badge-${topic.level}`}>{topic.level}</span>
          </div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>
        <MessageSquare size={20} />
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
            const masteryLevel = mastery?.mastery_level || 0;
            const masteryInfo = getMasteryLabel(masteryLevel);
            const practiceCount = mastery?.practice_count || 0;
            const streak = mastery?.streak_perfect || 0;
            const currentMode = mastery?.current_mode || 1;
            const avgRT = mastery?.avg_response_time || 0;

            return (
              <div
                key={conv.id}
                className={styles.convCard}
                style={{ animationDelay: `${i * 0.05}s` } as React.CSSProperties}
              >
                <div className={styles.convInfo}>
                  <div className={styles.convTitleRow}>
                    <h3>{conv.title}</h3>
                    {masteryLevel >= 95 && (
                      <span className={styles.masteredBadge}>
                        <Trophy size={14} /> Mastered
                      </span>
                    )}
                    <span className={styles.modeBadge}>
                       Mode {currentMode}/5
                    </span>
                  </div>
                  {conv.situation && (
                    <p className={styles.situation}>{conv.situation}</p>
                  )}
                  <div className={styles.convMeta}>
                    <span className={styles.roles}>
                      <Users size={14} />
                      {conv.role_a_name} & {conv.role_b_name}
                    </span>
                    <span className={styles.lineCount}>
                      {conv.line_count} lines
                    </span>
                    {avgRT > 0 && (
                      <span className={styles.rtStat}>
                        <Zap size={12} /> {avgRT}s reflex
                      </span>
                    )}
                  </div>

                  {/* Mastery Progress Bar */}
                  <div className={styles.masterySection}>
                    <div className={styles.masteryHeader}>
                      <span className={styles.masteryLabel}>
                        {masteryInfo.emoji} {masteryInfo.text}
                      </span>
                      <span className={styles.masteryPercent} style={{ color: masteryInfo.color }}>
                        {masteryLevel.toFixed(1)}%
                      </span>
                    </div>
                    <div className={styles.masteryBar}>
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
                        <span><Target size={12} /> {practiceCount}x practiced</span>
                        {streak > 0 && (
                          <span className={styles.streakBadge}>
                            <Flame size={12} /> {streak} streak
                          </span>
                        )}
                        {masteryLevel < 95 && (() => {
                          const modeKey = String(currentMode);
                          const modeData = mastery?.mode_scores?.[modeKey];
                          const successCount = modeData?.success_count || 0;
                          const required = currentMode === 4 ? 5 : 3;
                          const remaining = Math.max(0, required - successCount);
                          const roleProgress = currentMode < 4 ? getRoleProgress(modeData) : null;
                          return (
                            <span className={styles.masteryHint}>
                              Need {remaining} more perfect sessions (≥90%) in Mode {currentMode}
                              {roleProgress && (
                                <span className={styles.roleProgressInline}>
                                  <span className={roleProgress.a > 0 ? styles.roleActive : styles.roleInactive}>Role A</span>
                                  <span className={roleProgress.b > 0 ? styles.roleActive : styles.roleInactive}>Role B</span>
                                </span>
                              )}
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
                  <Play size={16} />
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
