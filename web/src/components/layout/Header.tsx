"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/authStore";
import {
  Sun,
  Moon,
  LogOut,
  User,
  MessageCircle,
} from "lucide-react";
import styles from "./Header.module.css";

export default function Header() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const isAdmin = pathname.startsWith("/admin");

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={user ? "/dashboard" : "/"} className={styles.logo}>
          <div className={styles.logoIcon}>
            <MessageCircle size={22} />
          </div>
          <span className={styles.logoText}>OnlySpeak</span>
        </Link>

        <nav className={styles.nav}>
          {user && !isAdmin && (
            <>
              <Link
                href="/dashboard"
                className={`${styles.navLink} ${pathname === "/dashboard" ? styles.active : ""}`}
              >
                Dashboard
              </Link>
              <Link
                href="/topics"
                className={`${styles.navLink} ${pathname.startsWith("/topics") ? styles.active : ""}`}
              >
                Topics
              </Link>
              <Link
                href="/history"
                className={`${styles.navLink} ${pathname === "/history" ? styles.active : ""}`}
              >
                History
              </Link>
            </>
          )}
          {user && isAdmin && (
            <>
              <Link
                href="/admin"
                className={`${styles.navLink} ${pathname === "/admin" ? styles.active : ""}`}
              >
                Dashboard
              </Link>
              <Link
                href="/admin/topics"
                className={`${styles.navLink} ${pathname.startsWith("/admin/topics") ? styles.active : ""}`}
              >
                Topics
              </Link>
              <Link
                href="/admin/conversations"
                className={`${styles.navLink} ${pathname.startsWith("/admin/conversations") ? styles.active : ""}`}
              >
                Conversations
              </Link>
              <Link
                href="/admin/users"
                className={`${styles.navLink} ${pathname === "/admin/users" ? styles.active : ""}`}
              >
                Users
              </Link>
            </>
          )}
        </nav>

        <div className={styles.actions}>
          {user && user.role === "admin" && (
            <Link
              href={isAdmin ? "/dashboard" : "/admin"}
              className="btn btn-sm btn-ghost"
            >
              {isAdmin ? "User View" : "Admin"}
            </Link>
          )}

          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <div className={styles.userMenu}>
              <div className={styles.avatar}>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.full_name} />
                ) : (
                  <User size={18} />
                )}
              </div>
              <span className={styles.userName}>{user.full_name}</span>
              <button
                className="btn btn-icon btn-ghost btn-sm"
                onClick={logout}
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
