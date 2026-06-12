"use client";

import { useEffect, useState } from "react";

export default function LineBrowserBanner() {
  const [isLine, setIsLine] = useState(false);
  const [os, setOs] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      
      // LINEブラウザの判定
      if (/Line/i.test(ua)) {
        setIsLine(true);
        
        // OSの判定
        if (/iPhone|iPad|iPod/i.test(ua)) {
          setOs("ios");
        } else if (/Android/i.test(ua)) {
          setOs("android");
        } else {
          setOs("other");
        }
      }
    }
  }, []);

  if (!isLine) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-3.5 text-xs md:text-sm font-bold flex items-start gap-2.5 shadow-md border-b border-amber-600 animate-slide-in-fast relative z-50">
      <span className="text-base flex-shrink-0">⚠️</span>
      <div className="flex-1 leading-relaxed">
        {os === "ios" ? (
          <>
            LINEの中で開いています。ホーム画面にアプリを追加（インストール）したり、通知を正しく受け取るために、<strong>画面右下の「ブラウザで開く」またはメニューから「Safariで開く」</strong>を選んで開き直してください。
          </>
        ) : os === "android" ? (
          <>
            LINEの中で開いています。ホーム画面にアプリを追加（インストール）したり、通知を正しく受け取るために、<strong>画面右上のメニューから「他のブラウザで開く」または「Chromeで開く」</strong>を選んで開き直してください。
          </>
        ) : (
          <>
            LINEの中で開いています。ホーム画面にアプリを追加（インストール）したり、通知を正しく受け取るために、<strong>右上（または右下）のメニューから「Chromeで開く」または「Safariで開く」</strong>を選んで開き直してください。
          </>
        )}
      </div>
    </div>
  );
}
