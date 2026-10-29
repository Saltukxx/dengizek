import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Bunny CDN, R2 public URL ve kendi origin'imiz medya kaynakları — CSP media/img
// yönergelerinde https: genel bırakıldı (CDN hostname'leri env'e bağlı).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js inline runtime + Mantine style-props için gerekli. Google
      // etiketi (gtag.js) yalnız analitik onayından sonra yüklenir (lib/ad-tags).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      // Google Ads dönüşüm ölçümü gizli iframe kullanabilir.
      "frame-src 'self' https://td.doubleclick.net https://www.googletagmanager.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/**
 * Panelden yüklenen görseller R2 public URL'inde, video kapakları Bunny
 * Stream CDN'inde durur. Bu host'lar env'e bağlı olduğu için remotePatterns
 * çalışma zamanında türetilir; aksi halde next/image gerçek otel görsellerini
 * (yalnızca demo/stok görselleri değil) reddeder.
 */
function mediaHostPatterns() {
  const hosts = [
    process.env.R2_PUBLIC_URL,
    process.env.BUNNY_STREAM_CDN_HOSTNAME,
    process.env.NEXT_PUBLIC_MEDIA_HOST,
  ]
    .filter((v): v is string => Boolean(v))
    .map((value) => {
      try {
        return new URL(value.startsWith("http") ? value : `https://${value}`).hostname;
      } catch {
        return null;
      }
    })
    .filter((v): v is string => Boolean(v));

  return [...new Set(hosts)].map((hostname) => ({
    protocol: "https" as const,
    hostname,
    pathname: "/**",
  }));
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // VPS/Docker dağıtımı için: minimal server.js + gerekli node_modules alt
  // kümesi üretir, imaja tam node_modules kopyalamayı gereksiz kılar.
  output: "standalone",
  // Kökte apps/web/pnpm-lock.yaml + kök package-lock.json birlikte bulununca
  // Turbopack workspace root'u yanlış tahmin ediyordu — sabitle.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      ...mediaHostPatterns(),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const hasSentrySourceMapConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default hasSentrySourceMapConfig
  ? withSentryConfig(nextConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      release: {
        name: process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      },
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
    })
  : nextConfig;
