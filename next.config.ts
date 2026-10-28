import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live study data, so Cache Components / partial prerendering stay off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
