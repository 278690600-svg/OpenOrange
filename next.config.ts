import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline' https: http:; worker-src 'self' blob:; object-src 'none';",
          },
        ],
      },
    ];
  },
  // Prevent bundling of native Node.js modules that use C++ bindings
  // Only list packages that ARE installed (not optional platform-specific ones)
  serverExternalPackages: [
    "node-llama-cpp",
    "@node-llama-cpp/win-x64",
    "better-sqlite3",
  ],
  // @ts-ignore
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Treat all @node-llama-cpp/* platform packages as external
      // This prevents webpack from trying to bundle uninstalled platform binaries
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)
      externals.push(({ request }: any, callback: any) => {
        if (request && request.startsWith('@node-llama-cpp/')) {
          return callback(null, `commonjs ${request}`)
        }
        callback()
      })
      config.externals = externals
    }
    return config
  },
};

export default nextConfig;
