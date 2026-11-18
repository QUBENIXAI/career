import { Building2, Code, Cpu, GraduationCap, Globe, PenLine, Search, TrendingUp, Users, type LucideIcon } from "lucide-react";
import type { Role, RoleIcon } from "@/lib/careers";

const ROLE_ICONS: Record<RoleIcon, LucideIcon> = {
  cpu: Cpu,
  code: Code,
  trending: TrendingUp,
  search: Search,
  pen: PenLine,
};

export function DeptIcon({ role, className = "" }: { role: Role; className?: string }) {
  const Icon = ROLE_ICONS[role.icon];
  return (
    <span className={`dept-icon tone-${role.tone} ${className}`.trim()} aria-hidden="true">
      <Icon className="icon" />
    </span>
  );
}

/** Department · work type · experience (· openings) with small icons. */
export function JobMeta({ role, withOpenings = false }: { role: Role; withOpenings?: boolean }) {
  const items: [LucideIcon, string, string][] = [
    [Building2, role.department, "Department"],
    [Globe, role.type, "Work type"],
    [GraduationCap, role.experience, "Experience"],
  ];
  if (withOpenings && role.openings) items.push([Users, `${role.openings} positions`, "Open positions"]);

  return (
    <ul className="job-meta">
      {items.map(([Icon, value, label]) => (
        <li key={label} title={label}>
          <Icon className="icon" aria-hidden="true" />
          <span>
            <span className="sr-only">{label}: </span>
            {value}
          </span>
        </li>
      ))}
    </ul>
  );
}
