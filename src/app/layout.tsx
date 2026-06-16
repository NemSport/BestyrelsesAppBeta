import type { Metadata } from "next";

import "@/app/globals.css";
import { ServiceWorkerRegistration } from "@/components/offline/service-worker-registration";

export const metadata: Metadata = {
  title: {
    default: "Udvalgshukommelsen",
    template: "%s | Udvalgshukommelsen",
  },
  description: "Hjælper udvalg med at huske beslutninger og føre handlinger ud i livet.",
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
