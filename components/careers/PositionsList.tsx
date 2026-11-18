"use client";

import { useState } from "react";
import { ROLES } from "@/lib/careers";
import { PositionRow } from "./JobCards";
import { useSavedRoles } from "./use-saved-roles";

const SAVED = "__saved";

export function PositionsList() {
  const [filter, setFilter] = useState("All");
  const { isSaved } = useSavedRoles();
  const departments = ["All", ...Array.from(new Set(ROLES.map((r) => r.department)))];

  const rows = ROLES.filter((r) =>
    filter === "All" ? true : filter === SAVED ? isSaved(r.slug) : r.department === filter,
  );

  const chips = [...departments.map((d) => ({ key: d, label: d })), { key: SAVED, label: "Saved" }];

  return (
    <>
      <div className="filters" role="group" aria-label="Filter by team">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className="filter-chip"
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {rows.length} {rows.length === 1 ? "role" : "roles"} shown
      </p>

      <div className="positions-list">
        {rows.length ? (
          rows.map((role) => <PositionRow key={role.slug} role={role} />)
        ) : (
          <p className="positions-empty">
            {filter === SAVED
              ? "You haven't saved any roles yet. Use the bookmark icon on a role to keep it here."
              : "No open roles in this team right now."}
          </p>
        )}
      </div>
    </>
  );
}
