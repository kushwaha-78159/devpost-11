import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NapaSathi AI — Smart Measurement & Fabric Planning",
  description:
    "An accessible material measurement and fabric cutting planner designed to help small makers and artisans estimate fabric use and reduce waste.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
