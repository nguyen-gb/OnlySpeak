"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Mail, Menu, Moon, Sun, User, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import styles from "./Header.module.css";

interface NavigationItem {
  href: string;
  label: string;
  exact?: boolean;
}

const USER_NAVIGATION: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/topics", label: "Topics" },
  { href: "/history", label: "History", exact: true },
];

const ADMIN_NAVIGATION: NavigationItem[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/topics", label: "Topics" },
  { href: "/admin/conversations", label: "Conversations" },
  { href: "/admin/users", label: "Users", exact: true },
];

function isNavigationItemActive(pathname: string, item: NavigationItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function safeAvatarUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.hostname === "lh3.googleusercontent.com"
      ? value
      : null;
  } catch {
    return null;
  }
}

export default function Header() {
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user, logout } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const menuOpen = openMenuPath === pathname;

  const isAdmin = pathname.startsWith("/admin");
  const navigation = isAdmin ? ADMIN_NAVIGATION : USER_NAVIGATION;
  const viewLabel = isAdmin ? "User view" : "Admin view";
  const viewHref = isAdmin ? "/dashboard" : "/admin";
  const avatarUrl = safeAvatarUrl(user?.avatar_url);
  const closeMenu = () => setOpenMenuPath(null);

  return (
    <header className={styles.header} onKeyDown={(event) => event.key === "Escape" && closeMenu()}>
      <div className={styles.inner}>
        <Link
          href={user ? "/dashboard" : "/"}
          className={styles.logo}
          onClick={closeMenu}
          aria-label="OnlySpeak home"
        >
          <span className={styles.logoIcon} aria-hidden="true">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className={styles.logoImage}
              priority
            />
            <Image
              src="/logo-dark.png"
              alt=""
              width={36}
              height={36}
              className={`${styles.logoImage} ${styles.logoImageDark}`}
              priority
            />
          </span>
          <span className={styles.logoText}>
            <span className={styles.logoTextOnly}>Only</span>
            <span className={styles.logoTextSpeak}>Speak</span>
          </span>
        </Link>

        <nav
          className={styles.nav}
          aria-label={isAdmin ? "Admin navigation" : "Main navigation"}
        >
          {user
            ? navigation.map((item) => {
                const active = isNavigationItemActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })
            : null}
        </nav>

        <div className={styles.actions}>
          {user && !isAdmin ? (
            <a
              href="mailto:vannguyen.tran.164@gmail.com?subject=OnlySpeak%20Feedback"
              className={`btn btn-sm btn-ghost ${styles.feedbackLink} ${styles.desktopAction}`}
            >
              <Mail size={16} aria-hidden="true" />
              <span>Feedback</span>
            </a>
          ) : null}

          {user?.role === "admin" ? (
            <Link
              href={viewHref}
              className={`btn btn-sm btn-ghost ${styles.desktopAction}`}
            >
              {viewLabel}
            </Link>
          ) : null}

          <button
            className="btn btn-icon btn-ghost btn-sm"
            type="button"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            aria-label="Toggle color theme"
          >
            <Sun className={styles.themeIconSun} size={18} aria-hidden="true" />
            <Moon className={styles.themeIconMoon} size={18} aria-hidden="true" />
          </button>

          {user ? (
            <div className={styles.userMenu}>
              <div className={styles.avatar}>
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${user.full_name}'s avatar`}
                    width={32}
                    height={32}
                  />
                ) : (
                  <User size={18} aria-hidden="true" />
                )}
              </div>
              <span className={styles.userName}>{user.full_name}</span>
              <button
                className="btn btn-icon btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  setLogoutError("");
                  setIsLoggingOut(true);
                  void logout()
                    .catch(() => {
                      setLogoutError(
                        "Could not log out. Check your connection and try again."
                      );
                    })
                    .finally(() => setIsLoggingOut(false));
                }}
                aria-label="Log out"
                disabled={isLoggingOut}
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign In
            </Link>
          )}

          {user ? (
            <button
              type="button"
              className={`btn btn-icon btn-ghost btn-sm ${styles.menuButton}`}
              onClick={() => setOpenMenuPath(menuOpen ? null : pathname)}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {menuOpen ? (
                <X size={20} aria-hidden="true" />
              ) : (
                <Menu size={20} aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {user && menuOpen ? (
        <nav
          id="mobile-navigation"
          className={styles.mobileNav}
          aria-label={isAdmin ? "Admin mobile navigation" : "Mobile navigation"}
        >
          {navigation.map((item) => {
            const active = isNavigationItemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.mobileNavLink} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            );
          })}

          {!isAdmin ? (
            <a
              href="mailto:vannguyen.tran.164@gmail.com?subject=OnlySpeak%20Feedback"
              className={styles.mobileNavLink}
              onClick={closeMenu}
            >
              <Mail size={16} aria-hidden="true" />
              Feedback
            </a>
          ) : null}

          {user.role === "admin" ? (
            <Link href={viewHref} className={styles.mobileNavLink} onClick={closeMenu}>
              {viewLabel}
            </Link>
          ) : null}
        </nav>
      ) : null}
      {logoutError ? (
        <div className={styles.headerError} role="alert">
          {logoutError}
        </div>
      ) : null}
    </header>
  );
}
