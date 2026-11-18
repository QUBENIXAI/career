/**
 * Single source of truth for the careers pages: roles and "Life at Qubenix" items.
 * Every page and the application API read from here.
 */

export type Tone = "purple" | "amber" | "pink" | "blue" | "orange";
export type RoleIcon = "cpu" | "code" | "trending" | "search" | "pen";

export interface Role {
  slug: string;
  title: string;
  department: string;
  type: string;
  experience: string;
  /** Shown as "Open positions: …" when set. */
  openings?: string;
  icon: RoleIcon;
  tone: Tone;
  featured?: boolean;
  /** Labels floating on the featured card's arc illustration. */
  tags?: string[];
  description: string;
}

export const ROLES: Role[] = [
  {
    slug: "ai-automation-intern",
    title: "AI & Automation Intern",
    department: "AI & Technology",
    type: "Remote",
    experience: "Beginner Friendly",
    openings: "Available",
    icon: "cpu",
    tone: "purple",
    featured: true,
    tags: ["Automation", "AI Agents", "APIs"],
    description:
      "Work on real-world AI automation projects, intelligent workflows, API integrations, chatbots, and AI-powered business systems.",
  },
  {
    slug: "full-stack-development",
    title: "Full Stack Development",
    department: "Engineering",
    type: "Remote",
    experience: "Beginner Friendly",
    icon: "code",
    tone: "amber",
    description:
      "Build modern web applications, backend systems, APIs, dashboards, and scalable digital products.",
  },
  {
    slug: "growth-marketing",
    title: "Growth & Marketing",
    department: "Marketing",
    type: "Remote",
    experience: "Beginner Friendly",
    icon: "trending",
    tone: "pink",
    description:
      "Help grow Qubenix through digital marketing, business development, branding, content strategy, and campaigns.",
  },
  {
    slug: "research-operations",
    title: "Research & Operations",
    department: "Operations",
    type: "Remote",
    experience: "Beginner Friendly",
    icon: "search",
    tone: "blue",
    description:
      "Research emerging technologies, identify opportunities, support business operations, and improve internal systems.",
  },
  {
    slug: "social-media-content",
    title: "Social Media & Content",
    department: "Content",
    type: "Remote",
    experience: "Beginner Friendly",
    icon: "pen",
    tone: "orange",
    description:
      "Create engaging content, manage social platforms, develop creative campaigns, and communicate technology ideas.",
  },
];

export function findRole(slug: string | null | undefined): Role | undefined {
  return slug ? ROLES.find((r) => r.slug === slug) : undefined;
}

export function applyHref(role: Role): string {
  return `/careers/apply?role=${encodeURIComponent(role.slug)}`;
}

export interface CultureItem {
  label: string;
  title: string;
  text: string;
  image: string;
  alt: string;
}

/**
 * "Life at Qubenix" — describes how the team works. No invented people, quotes or ratings.
 * Images are stock placeholders: replace with genuine team/project photos before launch.
 */
export const CULTURE: CultureItem[] = [
  {
    label: "Real projects",
    title: "Real Projects, Real Impact",
    text: "Contribute to AI automation and product work that ships to real users and businesses, not practice exercises.",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=70",
    alt: "A small team working together on laptops around a shared table",
  },
  {
    label: "Remote-first",
    title: "Collaborate From Anywhere",
    text: "Work with the team remotely and share ideas openly across engineering, marketing, content and operations.",
    image: "https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=1200&q=70",
    alt: "Two colleagues celebrating progress at a desk",
  },
  {
    label: "Learning",
    title: "Learn by Building",
    text: "Pick up practical industry skills by building, testing and iterating alongside people who do this every day.",
    image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=70",
    alt: "A team gathered for a knowledge-sharing session in an open workspace",
  },
  {
    label: "Experiment",
    title: "Room to Experiment",
    text: "Explore emerging technologies, try new ideas and help shape how Qubenix builds its products and systems.",
    image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1200&q=70",
    alt: "A team reviewing ideas together in a meeting room",
  },
];

export const STATS = [
  { value: "5+", label: "Open opportunities to explore and apply." },
  { value: "100%", label: "Hands-on learning through real projects." },
  { value: "Real-World", label: "Build practical products and technology solutions." },
  { value: "Global", label: "Collaborate with a growing technology community." },
];

export const STEPS = [
  {
    title: "Explore & Apply",
    text: "Browse available opportunities and find a position that matches your interests and skills.",
  },
  {
    title: "Interview & Connect",
    text: "Our team reviews your application and shortlisted candidates are invited for an interview or assessment.",
  },
  {
    title: "Start Building",
    text: "Join the Qubenix team, collaborate on real-world projects, and develop practical industry skills.",
  },
];

/** Text fields the application form sends and both the API route and Apps Script validate. */
export interface ApplicationInput {
  full_name: string;
  email: string;
  phone: string;
  role: string;
  location: string;
  college: string;
  education: string;
  graduation_year: string;
  skills: string;
  linkedin_url?: string;
  portfolio_url?: string;
  motivation: string;
  availability?: string;
}

export type ApplicationField = keyof ApplicationInput | "resume";
export type ApplicationErrors = Partial<Record<ApplicationField, string>>;

const REQUIRED: (keyof ApplicationInput)[] = [
  "full_name", "email", "phone", "role", "location", "college", "education", "graduation_year", "skills", "motivation",
];

// Keep in sync with LIMITS in apps-script/Code.gs.
export const FIELD_LIMITS: Record<keyof ApplicationInput, number> = {
  full_name: 120, email: 200, phone: 30, role: 80, location: 120, college: 150, education: 150, graduation_year: 4,
  skills: 500, linkedin_url: 500, portfolio_url: 500, motivation: 4000, availability: 300,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{7,30}$/;

function httpUrlHost(v: string): string | null {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname : null;
  } catch {
    return null;
  }
}

/** Graduation years offered in the form, newest first. */
export function graduationYears(now = new Date()): string[] {
  const y = now.getFullYear();
  return Array.from({ length: 6 + 1 + 25 }, (_, i) => String(y + 6 - i));
}

/** Shared by the client form and the API route so both enforce the same rules. */
export function validateApplication(input: Partial<Record<keyof ApplicationInput, unknown>>) {
  const errors: ApplicationErrors = {};
  const str = (k: keyof ApplicationInput) =>
    typeof input[k] === "string" ? (input[k] as string).replace(/\u0000/g, "").trim() : "";

  for (const k of REQUIRED) if (!str(k)) errors[k] = "This field is required.";
  if (str("email") && !EMAIL_RE.test(str("email"))) errors.email = "Enter a valid email address.";
  if (str("phone") && (!PHONE_RE.test(str("phone")) || str("phone").replace(/\D/g, "").length < 7)) {
    errors.phone = "Enter a valid phone number.";
  }
  if (str("role") && !findRole(str("role"))) errors.role = "Choose one of the open roles.";
  if (str("graduation_year")) {
    const y = Number(str("graduation_year"));
    const now = new Date().getFullYear();
    if (!/^\d{4}$/.test(str("graduation_year")) || y < now - 40 || y > now + 8) errors.graduation_year = "Choose your graduation year.";
  }
  if (str("linkedin_url")) {
    const host = httpUrlHost(str("linkedin_url"));
    if (!host || !/(^|\.)linkedin\.com$/i.test(host)) errors.linkedin_url = "Enter a valid LinkedIn profile URL.";
  }
  if (str("portfolio_url") && !httpUrlHost(str("portfolio_url"))) {
    errors.portfolio_url = "Enter a valid URL, starting with https://";
  }

  for (const [k, max] of Object.entries(FIELD_LIMITS) as [keyof ApplicationInput, number][]) {
    if (str(k).length > max) errors[k] = `Please keep this under ${max} characters.`;
  }

  const value: ApplicationInput = {
    full_name: str("full_name"),
    email: str("email").toLowerCase(),
    phone: str("phone"),
    role: str("role"),
    location: str("location"),
    college: str("college"),
    education: str("education"),
    graduation_year: str("graduation_year"),
    skills: str("skills"),
    linkedin_url: str("linkedin_url") || undefined,
    portfolio_url: str("portfolio_url") || undefined,
    motivation: str("motivation"),
    availability: str("availability") || undefined,
  };
  return { ok: Object.keys(errors).length === 0, errors, value };
}

/* ---------------- Resume file rules (client + server) ---------------- */

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const RESUME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type ResumeExt = keyof typeof RESUME_TYPES;

export function resumeExt(name: string): ResumeExt | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  const ext = m?.[1].toLowerCase();
  return ext && ext in RESUME_TYPES ? (ext as ResumeExt) : null;
}

/** Name/size checks. The server additionally checks the file's real content (magic bytes). */
export function validateResumeMeta(file: { name: string; size: number } | null | undefined): string | null {
  if (!file || !file.name || file.size === 0) return file && file.size === 0 ? "Resume file is empty." : "Please attach your resume.";
  if (!resumeExt(file.name)) return "Resume must be a PDF, DOC or DOCX file.";
  if (file.size > RESUME_MAX_BYTES) return "Resume must be 5 MB or smaller.";
  return null;
}
