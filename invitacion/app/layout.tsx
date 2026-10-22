import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graduación · Ing. Alexander Mejía",
  description: "Acompáñame a celebrar este logro. Confirma tu asistencia y comparte los recuerdos de la graduación.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

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
