import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "OnlySpeak - Learn English Through Conversations",
  description:
    "Practice English speaking skills with interactive role-play conversations. Choose a topic, pick a role, and start speaking naturally.",
  keywords: ["English learning", "speaking practice", "conversation", "pronunciation"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
