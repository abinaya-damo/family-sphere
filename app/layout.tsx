import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Sphere",
  description: "Your family, ready when it matters.",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
