import type { Metadata } from "next";
import { CareersStats } from "@/components/careers/CareersStats";
import { HowItWorks } from "@/components/careers/HowItWorks";
import { JobCategories } from "@/components/careers/JobCategories";
import { SiteFooter, SiteHeader } from "@/components/careers/SiteChrome";
import { TeamExperience } from "@/components/careers/TeamExperience";

export const metadata: Metadata = {
  title: { absolute: "Careers — Qubenix AI" },
  openGraph: {
    title: "Careers at Qubenix AI",
    description: "Remote, beginner-friendly opportunities to build real-world AI automation and technology products.",
  },
};

export default function CareersPage() {
  return (
    <>
      <SiteHeader current="home" />
      <main id="main">
        <CareersStats />
        <JobCategories />
        <HowItWorks />
        <TeamExperience />
      </main>
      <SiteFooter link={{ href: "/careers/positions", label: "View all open positions →" }} />
    </>
  );
}
