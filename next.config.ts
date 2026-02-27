import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: [
      "covers.openlibrary.org",
      "yoi075wr4krt9jfn.public.blob.vercel-storage.com",
    ],
  },
};

export default nextConfig;