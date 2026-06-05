import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "공부인 스터디카페 오목 챔피언",
  description:
    "Gomocup 챔피언 엔진(Rapfi)과 대국하는 렌주(오목) 게임. 렌주룰·금수(삼삼·사사·장목) 적용. 설치형 PWA.",
  applicationName: "오목 챔피언",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "오목 챔피언",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
