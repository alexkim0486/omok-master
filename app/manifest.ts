import type { MetadataRoute } from "next";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "공부인 스터디카페";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteName} 오목 챔피언`,
    short_name: "오목 챔피언",
    description:
      "Gomocup 챔피언 엔진(Rapfi)과 대국하는 렌주(오목) 게임. 렌주룰·금수 적용.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c1917",
    theme_color: "#1c1917",
    lang: "ko",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
