import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeetUp - Video Meetings",
  description: "Simple video meetings for everyone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0f0f0f] text-white">
        {children}
      </body>
    </html>
  );
}
