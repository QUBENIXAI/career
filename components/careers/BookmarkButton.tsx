"use client";

import { Bookmark } from "lucide-react";
import type { Role } from "@/lib/careers";
import { useSavedRoles } from "./use-saved-roles";

export function BookmarkButton({ role }: { role: Role }) {
  const { isSaved, toggle } = useSavedRoles();
  const on = isSaved(role.slug);
  return (
    <button
      type="button"
      className="bookmark-btn"
      aria-pressed={on}
      aria-label={on ? `Remove ${role.title} from saved` : `Save ${role.title}`}
      title={on ? "Saved" : "Save"}
      onClick={() => toggle(role.slug)}
    >
      <Bookmark className="icon" aria-hidden="true" />
    </button>
  );
}
