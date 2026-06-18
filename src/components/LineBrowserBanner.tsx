"use client";

export default function LineBrowserBanner() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || navigator.vendor;
  const isLine = /Line/i.test(ua);

  if (!isLine) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-3.5 text-xs md:text-sm font-bold flex items-start gap-2.5 shadow-md border-b border-amber-600 animate-slide-in-fast relative z-50">
      <span className="text-base flex-shrink-0">⚠️</span>
      <div className="flex-1 leading-relaxed">
        LINEの中で開いています。ホーム画面にアプリを追加（インストール）する場合は、<strong>画面の端（右上、または右下）にあるメニュー</strong>から『他のブラウザで開く』『Chromeで開く』『Safariで開く』などを選んで開き直してください。
      </div>
    </div>
  );
}
