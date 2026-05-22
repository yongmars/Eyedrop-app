import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.10.19"],
  output: isGithubActions ? "export" : undefined,
  basePath: isGithubActions ? "/Eyedrop-app" : "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
