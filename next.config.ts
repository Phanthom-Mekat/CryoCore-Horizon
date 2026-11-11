import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the scene catalogue moved into the Chattogram case
  async redirects() {
    return [{ source: "/explore", destination: "/chattogram/catalogue", permanent: false }];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
