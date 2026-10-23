import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "ws",
    "@react-pdf/renderer",
  ],
  // The PDF route loads the bundled fonts from the filesystem at runtime, so
  // they must be traced into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/invoices/[id]/pdf": ["./src/assets/fonts/**"],
  },
};

export default nextConfig;
