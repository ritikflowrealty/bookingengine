import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // keeps preview screenshots clean
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations run at startup (demo DB) and fonts are read by the PDF renderer.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*", "./public/fonts/**/*"] },
};

export default nextConfig;
