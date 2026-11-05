import type { Metadata } from "next";
import { AppSessionProvider } from "@/components/session-provider";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import "./globals.css";
import "./quality-layer.css";
import "./visual-system.css";

export const metadata: Metadata = {
  title: "WEB-CERT | Web Tech",
  description: "Gestão de vendas, certificados digitais, renovações e relatórios da Web Tech.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try {
  var savedTheme = localStorage.getItem("web-cert-theme");
  var initialTheme = savedTheme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme;
} catch (_) {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
}` }} />
      </head>
      <body>
        <AppSessionProvider><KeyboardShortcuts />{children}</AppSessionProvider>
      </body>
    </html>
  );
}
