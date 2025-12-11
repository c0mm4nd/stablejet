/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 完全禁用 SSR，纯客户端渲染
  output: 'export',
  // Turbopack 配置
  turbopack: {
    // Turbopack 相关配置
  },
}

module.exports = nextConfig
