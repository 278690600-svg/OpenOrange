import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["node-llama-cpp"],
  // @ts-ignore - Turbopack compatibility
  turbopack: {},
};

export default nextConfig;
