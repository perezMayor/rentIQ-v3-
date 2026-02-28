import type { Metadata } from "next";
import "./globals.css";

// Metadatos globales de la aplicación.
export const metadata: Metadata = {
  title: "RentIQ Gestión",
  description: "App interna de gestión operativa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Layout raíz común a todas las rutas.
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
