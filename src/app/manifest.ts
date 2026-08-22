import type { MetadataRoute } from "next";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
} from "../lib/siteMetadata";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: `${basePath}/`,
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0284c7",
    icons: [
      {
        src: `${basePath}/Daily_eyedrops192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${basePath}/Daily_eyedrops512.png`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `${basePath}/Daily_eyedrops192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${basePath}/Daily_eyedrops512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
