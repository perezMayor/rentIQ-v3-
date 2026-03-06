import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Metadatos globales de la aplicación.
export const metadata: Metadata = {
  title: "RentIQ Gestión",
  description: "App interna de gestión operativa",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }, { url: "/icon.png", type: "image/png" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
};

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInitScript = `
    (function() {
      try {
        var stored = window.localStorage.getItem("rentiq-theme-setting");
        var setting = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
        var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var resolved = setting === "system" ? (dark ? "dark" : "light") : setting;
        document.documentElement.dataset.theme = resolved;
      } catch (e) {
        document.documentElement.dataset.theme = "light";
      }
    })();
  `;

  // Layout raíz común a todas las rutas.
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={poppins.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
