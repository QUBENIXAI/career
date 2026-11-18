import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RevealOnScroll } from "@/components/careers/RevealOnScroll";
import "./careers/careers.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: { default: "Careers — Qubenix AI", template: "%s — Qubenix AI Careers" },
  description:
    "Join Qubenix AI. Explore remote, beginner-friendly opportunities in AI automation, engineering, marketing, operations and content.",
};

export const viewport: Viewport = { themeColor: "#3C32A3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/* Opt in to the fade-in starting state only when JS runs, so content is never hidden without it. */}
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js")' }} />
      </head>
      <body>
        <a className="sr-only" href="#main">
          Skip to content
        </a>
        {children}
        <RevealOnScroll />
      </body>
    </html>
  );
}
