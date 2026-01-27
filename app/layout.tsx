'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { useEffect, Suspense } from 'react';
import { ConfigProvider } from '@/contexts/ConfigContext';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // 客户端设置页面标题和meta标签
    document.title = 'StableJet Monitor';

    // Description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', '跨链兑换监控工具');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = '跨链兑换监控工具';
      document.head.appendChild(meta);
    }

    // Viewport for mobile optimization
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      document.head.appendChild(metaViewport);
    }
    metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover');

    // Theme color for mobile browsers
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', '#ffffff');

    // Apple mobile web app
    let appleWebApp = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    if (!appleWebApp) {
      appleWebApp = document.createElement('meta');
      appleWebApp.setAttribute('name', 'apple-mobile-web-app-capable');
      document.head.appendChild(appleWebApp);
    }
    appleWebApp.setAttribute('content', 'yes');

    let appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!appleStatusBar) {
      appleStatusBar = document.createElement('meta');
      appleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
      document.head.appendChild(appleStatusBar);
    }
    appleStatusBar.setAttribute('content', 'default');
  }, []);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
          <ConfigProvider>
            {children}
          </ConfigProvider>
        </Suspense>
      </body>
    </html>
  );
}
