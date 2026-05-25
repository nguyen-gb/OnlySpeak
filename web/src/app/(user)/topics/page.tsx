"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { BookOpen, MessageSquare, ChevronRight } from "lucide-react";
import styles from "./topics.module.css";

export default function TopicsPage() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .getTopics(levelFilter || undefined)
      .then((data: any) => setTopics(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [levelFilter]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Conversation Topics</h1>
        <p>Choose a topic to start practicing</p>
      </div>

      <div className={styles.filters}>
        {["", "beginner", "intermediate", "advanced"].map((level) => (
          <button
            key={level}
            className={`btn btn-sm ${levelFilter === level ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setLevelFilter(level)}
          >
            {level === "" ? "All Levels" : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : topics.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={64} />
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
                    <MessageSquare size={14} />
                    {topic.conversation_count} conversations
                  </span>
                </div>
              </div>
              <ChevronRight size={20} className={styles.topicArrow} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
