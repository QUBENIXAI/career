import type { Metadata } from "next";
import Link from "next/link";
import { ApplyForm } from "@/components/careers/ApplyForm";
import { SiteFooter, SiteHeader } from "@/components/careers/SiteChrome";
import { findRole } from "@/lib/careers";
import { issueFormToken } from "@/lib/server/form-token";

type Props = { searchParams: Promise<{ role?: string | string[] }> };

async function roleParam(searchParams: Props["searchParams"]) {
  const { role } = await searchParams;
  return Array.isArray(role) ? role[0] : role;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const role = findRole(await roleParam(searchParams));
  return {
    title: role ? `Apply for ${role.title}` : "Apply",
    robots: { index: false },
  };
}

export default async function ApplyPage({ searchParams }: Props) {
  const slug = (await roleParam(searchParams)) ?? "";

  return (
    <>
      <SiteHeader current="apply" />
      <main id="main">
        <section className="page-hero">
          <div className="container">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link href="/careers">Careers</Link>
              <span aria-hidden="true">/</span>
              <Link href="/careers/positions">Open positions</Link>
              <span aria-hidden="true">/</span>
              <span>Apply</span>
            </nav>
            <h1 className="section-title">Apply to Qubenix AI</h1>
            <p className="section-lead">
              Tell us a little about yourself and the role you&apos;re interested in. It only takes a few minutes.
            </p>
          </div>
        </section>
        <div className="container">
          {/* key: remount with the new role when navigating between apply links */}
          <ApplyForm key={slug} initialRole={slug} formToken={issueFormToken()} />
        </div>
      </main>
      <SiteFooter link={{ href: "/careers/positions", label: "← All open positions" }} />
    </>
  );
}
