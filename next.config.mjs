import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // "sitemap.xml" is a reserved metadata file name in the app router, so the
  // gallery sitemap route lives at /designs/sitemap-xml and is served here.
  async rewrites() {
    return [{ source: "/designs/sitemap.xml", destination: "/designs/sitemap-xml" }]
  },
}

export default nextConfig

