import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graduación · Ing. Alexander Mejía",
  description: "Acompáñame a celebrar este logro. Confirma tu asistencia y comparte los recuerdos de la graduación.",
  openGraph: {
    type: "website",
    locale: "es_GT",
    title: "🎓 Graduación · Ing. Alexander Mejía",
    description: "28 de octubre · 10:00 a. m. · Auditorio Francisco Vela. ¡Acompáñame! Confirma tu asistencia aquí.",
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

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ef6c2f" };

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
