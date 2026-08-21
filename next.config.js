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
  // HTML 页面禁止共享缓存（代理/CDN），否则发版后用户拿到旧页面引用旧 chunk。
  // 哈希化的 /_next/static 资源不受影响，仍可长缓存。
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
