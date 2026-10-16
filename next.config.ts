import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Next.js bootstraps with inline scripts, so script-src needs 'unsafe-inline' unless nonces are
// wired through the proxy. Everything else is locked to same-origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://appcenter.intuit.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["exceljs", "pdf-lib", "unpdf", "qrcode"],
  experimental: {
    serverActions: { bodySizeLimit: "16mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Document previews are framed by our own pages only.
      {
        source: "/api/v1/documents/:id/file",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
