"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { getErrorMessage } from "@/lib/api";
import { AlertCircle, Mic, Sparkles, Volume2 } from "lucide-react";
import styles from "../auth.module.css";

interface GoogleCredentialResponse {
  credential?: string;
}

function getPostLoginPath(): string {
  if (typeof window === "undefined") return "/dashboard";
  const candidate = new URLSearchParams(window.location.search).get("next");
  if (candidate) {
    try {
      const destination = new URL(candidate, window.location.origin);
      if (
        destination.origin === window.location.origin &&
        !destination.pathname.startsWith("/login")
      ) {
        return `${destination.pathname}${destination.search}${destination.hash}`;
      }
    } catch {
      // Fall through to the safe default.
    }
  }
  return "/dashboard";
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: "outline" | "filled_blue" | "filled_black";
              size: "large" | "medium" | "small";
              text: "signin_with" | "signup_with" | "continue_with" | "signin";
              width: number;
            }
          ) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const sessionError = useAuthStore((state) => state.sessionError);
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.replace(getPostLoginPath());
    }
  }, [isAuthenticated, isInitialized, router]);

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError("Google did not return a login token.");
        return;
      }

      setError("");
      setGoogleLoading(true);
      try {
        await googleLogin(response.credential);
        router.replace(getPostLoginPath());
      } catch (loginError) {
        setError(getErrorMessage(loginError));
      } finally {
        setGoogleLoading(false);
      }
    },
    [googleLogin, router]
  );

  const renderGoogleButton = useCallback(() => {
      if (!window.google || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      });
      const availableWidth = Math.max(
        200,
        Math.min(340, googleButtonRef.current.clientWidth || 340)
      );
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        width: availableWidth,
      });
    }, [googleClientId, handleGoogleCredential]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;
    if (window.google) {
      renderGoogleButton();
    }
  }, [googleClientId, renderGoogleButton]);

  return (
    <div className={styles.authPage}>
      {googleClientId ? (
        <Script
          id="google-identity-services"
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={renderGoogleButton}
          onError={() => setError("Could not load Google sign in.")}
        />
      ) : null}
      <div className={styles.authGlow} />
      <div className={styles.authGlowSecondary} />
      <div className={styles.authShell}>
        <section className={styles.authAside} aria-hidden="true">
          <div className={styles.asideHeader}>
            <div className={styles.asideIcon}>
              <Sparkles size={20} />
            </div>
            <span>Speaking practice, ready when you are</span>
          </div>
          <div className={styles.dialoguePreview}>
            <div className={`${styles.previewBubble} ${styles.previewBubblePartner}`}>
              <div className={styles.previewBubbleMeta}>
                <Volume2 size={14} />
                Partner
              </div>
              <p>How was your commute this morning?</p>
            </div>
            <div className={`${styles.previewBubble} ${styles.previewBubbleUser}`}>
              <div className={styles.previewBubbleMeta}>
                <Mic size={14} />
                You
              </div>
              <p>It was smooth today. I got here a little early.</p>
            </div>
          </div>
          <div className={styles.asideStats}>
            <div>
              <strong>92%</strong>
              <span>score</span>
            </div>
            <div>
              <strong>5</strong>
              <span>modes</span>
            </div>
            <div>
              <strong>AI</strong>
              <span>feedback</span>
            </div>
          </div>
        </section>

        <section className={styles.authCard}>
          <div className={styles.authHeader}>
            <Link href="/" className={styles.logo}>
              <div className={styles.logoIcon}>
                <Image src="/logo.png" alt="OnlySpeak logo" width={36} height={36} className={styles.logoImage} priority />
                <Image src="/logo-dark.png" alt="" width={36} height={36} className={`${styles.logoImage} ${styles.logoImageDark}`} priority aria-hidden="true" />
              </div>
              <span className={styles.logoText}>
                <span className={styles.logoTextOnly}>Only</span>
                <span className={styles.logoTextSpeak}>Speak</span>
              </span>
            </Link>
            <h1>Welcome back</h1>
            <p>Continue your English practice with one secure Google sign-in.</p>
          </div>

          {(error || sessionError) && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} />
              {error || sessionError}
            </div>
          )}

          <div className={styles.googleSection}>
            {googleClientId ? (
              <div className={styles.googleButtonWrap}>
                <div ref={googleButtonRef} className={styles.googleButtonTarget} />
                {googleLoading ? (
                  <div className={styles.googleOverlay}>
                    <div className="spinner" />
                  </div>
                ) : null}
              </div>
            ) : (
              <button className={`btn btn-secondary btn-lg ${styles.googleBtn}`} disabled>
                Google sign in is not configured
              </button>
            )}
          </div>

          <p className={styles.authNote}>
            No password to remember. Your account is created automatically the first time you sign in.
          </p>
        </section>
      </div>
    </div>
  );
}
