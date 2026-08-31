import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages ? {
    output: "export" as const,
    assetPrefix: "/mark-six-simulator",
    trailingSlash: true,
  } : {}),
};

export default nextConfig;
