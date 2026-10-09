import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opportunity Hub",
  description: "Private opportunity & application CRM",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#070d1c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body>{children}</body>
    </html>
  );
}
