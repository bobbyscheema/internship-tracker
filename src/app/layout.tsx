import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Internship Radar — Summer 2027",
  description: "A local-first SWE, ML, and quant internship tracker.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
