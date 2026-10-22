import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graduación · Ing. Alexander Mejía",
  description: "Cada persona invitada forma parte de quien soy hoy y de los logros que he alcanzado. Acompáñame a celebrar mi graduación como Ingeniero en Ciencias y Sistemas.",
  openGraph: {
    type: "website",
    locale: "es_GT",
    title: "🎓 Graduación · Ing. Alexander Mejía",
    description: "Formas parte de quien soy hoy y de mis logros. Acompáñame a mi graduación como Ingeniero en Ciencias y Sistemas. Miércoles 28 de octubre · 10:00 a. m.",
    images: [{ url: "https://alex-m21.github.io/Graduacion_Ing_Alexander/share-card.png", width: 1200, height: 630, alt: "Graduación del Ing. Alexander Mejía, 28 de octubre de 2026 a las 10:00 a. m." }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-GT">
      <body className="antialiased">{children}</body>
    </html>
  );
}
