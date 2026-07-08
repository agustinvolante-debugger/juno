import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pin the workspace root — a stray lockfile in $HOME makes Turbopack infer the
  // wrong root and every API route 404s in dev
  turbopack: { root: __dirname },
};

export default nextConfig;
