import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // NOTE: cacheComponents + partialPrefetching (Next 16 experimental) were
  // disabled — on this dynamic client page with DB-backed server actions,
  // a failed prefetch ("TypeError: Failed to fetch") sent dev into an
  // endless prefetch/refresh/remount loop. Re-enable only once stable.
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
