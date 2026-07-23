import type { NextConfig } from "next";

const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
let apiSource = "";
try {
  const parsedApiUrl = new URL(configuredApiUrl);
  if (parsedApiUrl.protocol === "http:" || parsedApiUrl.protocol === "https:") {
    apiSource = ` ${parsedApiUrl.origin}`;
  }
} catch {
  // Relative API URLs are already covered by 'self'.
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  } https://accounts.google.com/gsi/client`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  `connect-src 'self'${apiSource} https://accounts.google.com/gsi/${
    process.env.NODE_ENV === "development" ? " ws:" : ""
  }`,
  "frame-src https://accounts.google.com/gsi/",
  `media-src 'self'${apiSource} blob: data:`,
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
