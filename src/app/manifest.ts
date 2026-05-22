import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ノクトのまいにち点眼管理アプリ",
    short_name: "まいにち点眼",
    description: "楽しく目薬の習慣をつけるアプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0284c7",
    icons: [
      {
        src: "/Daily_eyedrops192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/Daily_eyedrops512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
