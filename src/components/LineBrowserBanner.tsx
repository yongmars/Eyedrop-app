"use client";

import { useEffect, useState } from "react";

export default function LineBrowserBanner() {
  const [isLine, setIsLine] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      
      // LINEブラウザの判定
      if (/Line/i.test(ua)) {
        setIsLine(true);
      }
    }
  }, []);

  if (!isLine) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-3.5 text-xs md:text-sm font-bold flex items-start gap-2.5 shadow-md border-b border-amber-600 animate-slide-in-fast relative z-50">
      <span className="text-base flex-shrink-0">⚠️</span>
      <div className="flex-1 leading-relaxed">
        LINEの中で開いています。ホーム画面にアプリを追加（インストール）したり、通知を正しく受け取るために、<strong>画面の端（右上、または右下）にあるメニュー</strong>から『他のブラウザで開く』『Chromeで開く』『Safariで開く』などを選んで開き直してください。
      </div>
    </div>
  );
}
