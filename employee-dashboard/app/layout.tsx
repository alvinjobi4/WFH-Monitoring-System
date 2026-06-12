import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: "WFH Monitor",
  description: "Enterprise Work From Home Telemetry Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased theme-light"
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
