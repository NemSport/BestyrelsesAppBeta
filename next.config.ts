import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep live development chunks isolated from production builds. Mixing
  // these artifacts can leave webpack's
  // client module table out of sync with an already rendered server response.
  distDir:
    process.env.NODE_ENV === "development"
      ? ".next-dev"
      : ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
