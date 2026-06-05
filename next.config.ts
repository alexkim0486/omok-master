import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile lives in the home
  // directory, which would otherwise be inferred as the root).
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
