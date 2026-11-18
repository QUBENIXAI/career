import Link from "next/link";
import { ROLES } from "@/lib/careers";
import { FeaturedJobCard, JobCard } from "./JobCards";

export function JobCategories() {
  const featured = ROLES.find((r) => r.featured) ?? ROLES[0];
  const others = ROLES.filter((r) => r !== featured).slice(0, 4);

  return (
    <section className="job-categories" id="opportunities" aria-labelledby="opportunities-title">
      <div className="container">
        <div className="job-categories__head">
          <h2 className="section-title" id="opportunities-title">
            Explore Opportunities at Qubenix
          </h2>
          <Link className="btn btn-light" href="/careers/positions">
            View All Positions
          </Link>
        </div>

        <div className="jobs-layout">
          <FeaturedJobCard role={featured} />
          <div className="jobs-grid">
            {others.map((role) => (
              <JobCard key={role.slug} role={role} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
