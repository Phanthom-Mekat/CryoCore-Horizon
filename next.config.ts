import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the scene catalogue moved into the Chattogram case
  async redirects() {
    return [{ source: "/explore", destination: "/chattogram/catalogue", permanent: false }];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Keep React debug data in the RSC response: preview proxies may not forward
  // the separate dev WebSocket, which otherwise leaves hydration waiting.
  experimental: { reactDebugChannel: false },
  turbopack: {
    rules: {
      "*.css": {
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
