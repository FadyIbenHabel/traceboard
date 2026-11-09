import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Traceboard — Find the why. Fix it faster.",
  description:
    "An evidence-first debugging workspace. Turn bug reports, code and logs into cited hypotheses and a practical investigation plan.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
