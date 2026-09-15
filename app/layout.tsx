import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Billetera · Reserva Compartida",
  description:
    "Concepto de billetera virtual con reservas de dinero compartidas entre varias personas. Prototipo con fines demostrativos.",
  applicationName: "Billetera",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Billetera" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#009ee3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={nunito.variable}>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
