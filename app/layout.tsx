'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { useEffect } from 'react';
import { ConfigProvider } from '@/contexts/ConfigContext';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // 客户端设置页面标题
    document.title = 'StableJet Monitor';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'USDC/USDT 跨链兑换监控工具');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'USDC/USDT 跨链兑换监控工具';
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ConfigProvider>
          {children}
        </ConfigProvider>
      </body>
    </html>
  );
}
