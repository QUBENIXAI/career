import type { Metadata } from "next";
import Link from "next/link";
import { PositionsList } from "@/components/careers/PositionsList";
import { SiteFooter, SiteHeader } from "@/components/careers/SiteChrome";
import { ROLES } from "@/lib/careers";

export const metadata: Metadata = {
  title: "Open Positions",
  description:
    "All open opportunities at Qubenix AI: remote, beginner-friendly roles in AI automation, engineering, marketing, operations and content.",
};

export default function PositionsPage() {
  return (
    <>
      <SiteHeader current="positions" />
      <main id="main">
        <section className="page-hero">
          <div className="container">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link href="/careers">Careers</Link>
              <span aria-hidden="true">/</span>
              <span>Open positions</span>
            </nav>
            <h1 className="section-title">All Open Positions</h1>
            <p className="section-lead">
              Every role is remote and beginner friendly. Pick a team, save the roles you like, and apply when
              you&apos;re ready. {ROLES.length} roles open.
            </p>
          </div>
        </section>
        <div className="container">
          <PositionsList />
        </div>
      </main>
      <SiteFooter link={{ href: "/careers", label: "← Back to careers" }} />
    </>
  );
}
