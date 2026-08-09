import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "la vie", template: "%s · la vie" },
  description: "两个人的私人生活空间，记录日子、安排时间和一起完成的事情。",
  applicationName: "la vie",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f1d47d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AuthProvider><SiteHeader /><main>{children}</main><footer className="footer">la vie · 把日子一起过好</footer></AuthProvider></body></html>;
}
