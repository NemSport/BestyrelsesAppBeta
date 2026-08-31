import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { ServiceWorkerRegistration } from "@/components/offline/service-worker-registration";

export const metadata: Metadata = {
  applicationName: "BestyrelsesApp",
  title: {
    default: "BestyrelsesApp",
    template: "%s | BestyrelsesApp",
  },
  description:
    "Hjælper udvalg med at huske beslutninger og føre handlinger ud i livet.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BestyrelsesApp",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#18313e",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
