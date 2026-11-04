import type { Metadata } from "next";
import { AppSessionProvider } from "@/components/session-provider";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certificados Manager",
  description: "Consulta e gestão versionada de registros comerciais da Web Tech.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { var savedTheme = localStorage.getItem("web-cert-theme"); var initialTheme = savedTheme === "dark" ? "dark" : "light"; document.documentElement.dataset.theme = initialTheme; document.documentElement.style.colorScheme = initialTheme; } catch (_) { document.documentElement.dataset.theme = "light"; }` }} />
      </head>
      <body>
        <AppSessionProvider><KeyboardShortcuts />{children}</AppSessionProvider>
      </body>
    </html>
  );
}
