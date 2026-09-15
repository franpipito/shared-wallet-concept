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

const TITLE = "Reserva Compartida · Concepto de billetera virtual";
const DESCRIPTION =
  "Una reserva de dinero compartida entre varias personas: ambos depositan, ambos gastan, " +
  "ven los movimientos del otro en tiempo real y al cerrarla el sobrante vuelve en proporción " +
  "a lo que aportó cada uno. Prototipo con fines demostrativos.";

/**
 * Las URLs de Open Graph tienen que ser absolutas para que las previsualice
 * LinkedIn. En Vercel, VERCEL_PROJECT_PRODUCTION_URL ya trae el dominio; si no,
 * se puede fijar NEXT_PUBLIC_SITE_URL a mano.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Billetera",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Billetera" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Reserva Compartida",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Dos celulares mostrando la misma reserva compartida; en uno llega el aviso del pago hecho desde el otro.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
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
