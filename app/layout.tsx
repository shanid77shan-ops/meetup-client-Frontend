import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "见面",
  description: "Free face-to-face video meetings for everyone",
  icons: {
    icon: "/dragon.png",
    apple: "/dragon.png",
  },
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
