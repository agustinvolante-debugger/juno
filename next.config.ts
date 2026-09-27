import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pin the workspace root — a stray lockfile in $HOME makes Turbopack infer the
  // wrong root and every API route 404s in dev
  turbopack: { root: __dirname },
  // dev only: lets a phone on the same Wi-Fi load localhost via the Mac's LAN address
  // (Next blocks dev assets from other origins otherwise, and the page never hydrates)
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
};

export default nextConfig;
