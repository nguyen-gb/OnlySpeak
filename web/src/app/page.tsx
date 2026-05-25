"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import {
  MessageCircle,
  Mic,
  Users,
  BarChart3,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  Volume2,
  RefreshCw,
} from "lucide-react";
import styles from "./landing.module.css";

export default function LandingPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={styles.landing}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <MessageCircle size={22} />
            </div>
            <span className={styles.logoText}>OnlySpeak</span>
          </div>
          <div className={styles.headerActions}>
            <button
              className="btn btn-icon btn-ghost btn-sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link href="/login" className="btn btn-sm btn-ghost">
              Sign In
            </Link>
            <Link href="/register" className="btn btn-sm btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <Sparkles size={14} />
            <span>Free English Speaking Practice</span>
          </div>
          <h1 className={styles.heroTitle}>
            Master English
            <br />
            <span className={styles.heroGradient}>Through Conversations</span>
          </h1>
          <p className={styles.heroDesc}>
            Practice real-world English dialogues by role-playing conversations.
            Choose a topic, pick a character, speak naturally, and get instant
            pronunciation feedback — all for free.
          </p>
          <div className={styles.heroCta}>
            <Link href="/register" className="btn btn-lg btn-primary">
              Start Speaking Now
              <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="btn btn-lg btn-secondary">
              I have an account
            </Link>
          </div>
        </div>

        {/* Conversation Preview */}
        <div className={styles.preview}>
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <div className={styles.dot} style={{ background: "#ef4444" }} />
              <div className={styles.dot} style={{ background: "#f59e0b" }} />
              <div className={styles.dot} style={{ background: "#10b981" }} />
              <span>At the Coffee Shop</span>
            </div>
            <div className={styles.previewBody}>
              <div className={`${styles.chatBubble} ${styles.chatA}`}>
                <span className={styles.chatRole}>☕ Barista</span>
                <p>Hi! Welcome to Daily Brew. What can I get for you today?</p>
                <Volume2 size={14} className={styles.chatAudio} />
              </div>
              <div className={`${styles.chatBubble} ${styles.chatB}`}>
                <span className={styles.chatRole}>🎤 You</span>
                <p>I&apos;d like a medium latte with oat milk, please.</p>
                <div className={styles.scoreTag}>
                  <Mic size={12} /> 92%
                </div>
              </div>
              <div className={`${styles.chatBubble} ${styles.chatA}`}>
                <span className={styles.chatRole}>☕ Barista</span>
                <p>Great choice! Would you like that hot or iced?</p>
                <Volume2 size={14} className={styles.chatAudio} />
              </div>
              <div className={styles.typingIndicator}>
                <Mic size={16} className={styles.micPulse} />
                <span>Your turn to speak...</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features}>
        <div className={styles.featuresInner}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <p className={styles.sectionDesc}>
            Three simple steps to improve your English speaking
          </p>
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Users size={28} />
              </div>
              <h3>Choose a Role</h3>
              <p>
                Pick from dozens of real-world conversation topics. Select
                Person A or B and jump right in.
              </p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Mic size={28} />
              </div>
              <h3>Speak Naturally</h3>
              <p>
                Listen to your partner&apos;s lines, then speak yours aloud. Our
                AI scores your pronunciation in real-time.
              </p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <RefreshCw size={28} />
              </div>
              <h3>Swap & Repeat</h3>
              <p>
                Swap roles to practice both sides. Track your progress and watch
                your confidence grow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className={styles.stats}>
        <div className={styles.statsInner}>
          <div className={styles.statItem}>
            <span className={styles.statNum}>100%</span>
            <span className={styles.statText}>Free to use</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNum}>50+</span>
            <span className={styles.statText}>Conversation topics</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNum}>AI</span>
            <span className={styles.statText}>Pronunciation scoring</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNum}>∞</span>
            <span className={styles.statText}>Practice sessions</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <MessageCircle size={18} />
            </div>
            <span className={styles.logoText}>OnlySpeak</span>
          </div>
          <p>Learn English by speaking. Free forever.</p>
        </div>
      </footer>
    </div>
  );
}
