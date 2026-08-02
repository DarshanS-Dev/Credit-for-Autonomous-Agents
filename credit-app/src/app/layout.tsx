import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { Nav } from "@/components/layout/Nav";
import { LenisProvider } from "@/components/layout/LenisProvider";

export const metadata: Metadata = {
  title: "Credit for Autonomous Agents | Ledger Editorial",
  description:
    "Real-time, automated credit underwriting infrastructure and delegation mandate enforcement for autonomous AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <QueryProvider>
          <SessionProvider>
            <RouteGuard>
              <LenisProvider />
              <div className="flex flex-col relative z-0 min-h-screen">
                <Nav />
                <main className="flex-1 flex flex-col">{children}</main>
              </div>
            </RouteGuard>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
