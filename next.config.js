/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prevent automatic 308 redirects between /path and /path/
  // This avoids browser-cached redirect loops for API routes.
  skipTrailingSlashRedirect: true,
  // Turbopack 配置
  turbopack: {
    // Turbopack 相关配置
  },
}

module.exports = nextConfig
