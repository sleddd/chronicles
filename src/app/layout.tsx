import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import SessionProvider from "@/components/providers/SessionProvider";
import { EncryptionProvider } from "@/components/providers/EncryptionProvider";
import { BackgroundImage } from "@/components/layout/BackgroundImage";
import { DevToolsBlocker } from "@/components/providers/DevToolsBlocker";
import { AccentColorInitializer } from "@/components/providers/AccentColorInitializer";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chronicles",
  description: "Privacy-first encrypted journaling",
  icons: {
    icon: "/chronicles-favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body
        className={`${montserrat.variable} font-sans antialiased`}
      >
        <DevToolsBlocker />
        <SessionProvider session={session}>
          <BackgroundImage />
          <EncryptionProvider>
            <AccentColorInitializer />
            {children}
          </EncryptionProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
