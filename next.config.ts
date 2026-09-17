import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/FAMILY_SPHERE.html",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
