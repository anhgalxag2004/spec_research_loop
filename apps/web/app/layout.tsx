import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpecResearch Loop",
  description: "Research idea to validated specification workflow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
