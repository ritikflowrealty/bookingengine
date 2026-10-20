import type { Metadata } from "next";
import { Outfit, Work_Sans } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Flow Inventory",
  description: "Live inventory, pricing and booking for Flow Realty projects",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${workSans.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
