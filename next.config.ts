import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Monthly campaign posters can easily exceed the default action payload size.
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
