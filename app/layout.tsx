import type { Metadata, Viewport } from "next";
import "./globals.css";

const assetBase = process.env.GITHUB_ACTIONS === "true" ? "/mark-six-simulator" : "";

export const metadata: Metadata = {
  title: "六合彩模擬器",
  description: "按香港六合彩規則模擬隨機投注，統計注數、成本、獎級與派彩。",
  manifest: `${assetBase}/manifest.webmanifest`,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "六合彩模擬器" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: `${assetBase}/icon-192.png`, sizes: "192x192", type: "image/png" }, { url: `${assetBase}/icon-512.png`, sizes: "512x512", type: "image/png" }],
    apple: [{ url: `${assetBase}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#07152d" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-HK"><body>{children}</body></html>; }
