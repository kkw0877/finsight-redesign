import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts buffers request bodies (default 10MB cap) for routes it matches,
    // including /api/upload, which needs to accept files up to 20MB.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
