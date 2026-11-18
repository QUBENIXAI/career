import Link from "next/link";
import { ArrowRight, Database, MessageSquare, Zap } from "lucide-react";
import { applyHref, type Role } from "@/lib/careers";
import { BookmarkButton } from "./BookmarkButton";
import { DeptIcon, JobMeta } from "./icons";

function ApplyLink({ role, block = true, arrow = false }: { role: Role; block?: boolean; arrow?: boolean }) {
  return (
    <Link className={`btn btn-primary${block ? " btn-block" : ""}`} href={applyHref(role)}>
      Apply Now
      {arrow && <ArrowRight className="icon icon-arrow" aria-hidden="true" />}
      <span className="sr-only"> for {role.title}</span>
    </Link>
  );
}

export function FeaturedJobCard({ role }: { role: Role }) {
  const id = `job-${role.slug}`;
  return (
    <article className="job-card job-card--featured reveal" aria-labelledby={id}>
      <div className="job-card__top">
        <DeptIcon role={role} />
        <BookmarkButton role={role} />
      </div>
      <h3 className="job-card__title" id={id}>
        {role.title}
      </h3>
      <p className="job-card__desc">{role.description}</p>
      {role.openings && <p className="openings">Open positions: {role.openings}</p>}
      <JobMeta role={role} />

      <div className="job-arc" aria-hidden="true">
        <span className="job-arc__ring job-arc__ring--outer" />
        <span className="job-arc__ring job-arc__ring--inner" />
        <span className="job-arc__badge job-arc__badge--l">
          <Database className="icon" />
        </span>
        <span className="job-arc__badge job-arc__badge--t">
          <Zap className="icon" />
        </span>
        <span className="job-arc__badge job-arc__badge--r">
          <MessageSquare className="icon" />
        </span>
        {(role.tags ?? []).slice(0, 3).map((t, i) => (
          <span key={t} className={`job-arc__pill job-arc__pill--${i + 1}`}>
            {t}
          </span>
        ))}
      </div>

      <div className="job-card__actions">
        <ApplyLink role={role} />
      </div>
    </article>
  );
}

export function JobCard({ role }: { role: Role }) {
  const id = `job-${role.slug}`;
  return (
    <article className="job-card job-card--small reveal" aria-labelledby={id}>
      <DeptIcon role={role} />
      <h3 className="job-card__title" id={id}>
        {role.title}
      </h3>
      <p className="job-card__desc">{role.description}</p>
      <JobMeta role={role} />
      <div className="job-card__actions">
        <ApplyLink role={role} />
        <BookmarkButton role={role} />
      </div>
    </article>
  );
}

export function PositionRow({ role }: { role: Role }) {
  const id = `pos-${role.slug}`;
  return (
    <article className="position-row reveal" aria-labelledby={id}>
      <DeptIcon role={role} />
      <div>
        <h2 className="job-card__title" id={id}>
          {role.title}
        </h2>
        <p className="job-card__desc">{role.description}</p>
        <JobMeta role={role} withOpenings />
      </div>
      <div className="position-row__actions">
        <ApplyLink role={role} block={false} arrow />
        <BookmarkButton role={role} />
      </div>
    </article>
  );
}
