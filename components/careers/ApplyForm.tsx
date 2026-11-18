"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Copy, FileText, UploadCloud, X } from "lucide-react";
import {
  ROLES,
  RESUME_ACCEPT,
  findRole,
  graduationYears,
  validateApplication,
  validateResumeMeta,
  type ApplicationErrors,
  type ApplicationField,
  type ApplicationInput,
} from "@/lib/careers";
import { DeptIcon, JobMeta } from "./icons";

type Status = { kind: "" | "ok" | "warn"; msg: string };
type Phase = { name: "idle" } | { name: "uploading"; pct: number } | { name: "saving" } | { name: "done"; applicationId: string; position: string };

type FieldDef = {
  name: keyof ApplicationInput;
  label: string;
  hint?: string;
  type?: string;
  full?: boolean;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "text" | "email" | "tel" | "url";
};

// Order matters: it is also the focus order for the first invalid field.
const FIELDS: FieldDef[] = [
  { name: "full_name", label: "Full name", required: true, autoComplete: "name" },
  { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  { name: "phone", label: "Phone number", type: "tel", required: true, autoComplete: "tel", inputMode: "tel", placeholder: "+91 98765 43210" },
  { name: "role", label: "Role", required: true },
  { name: "location", label: "Location", hint: "(city, country)", required: true, autoComplete: "address-level2" },
  { name: "college", label: "College / University", required: true, autoComplete: "organization" },
  { name: "education", label: "Education", hint: "(degree & major)", required: true, placeholder: "e.g. B.Tech, Computer Science" },
  { name: "graduation_year", label: "Graduation year", required: true },
  { name: "skills", label: "Skills", full: true, required: true, placeholder: "e.g. Python, React, prompt engineering, content writing" },
  { name: "linkedin_url", label: "LinkedIn URL", hint: "(optional)", type: "url", inputMode: "url", placeholder: "https://linkedin.com/in/…" },
  { name: "portfolio_url", label: "GitHub or portfolio", hint: "(optional)", type: "url", inputMode: "url", placeholder: "https://" },
  { name: "motivation", label: "Why this role, and what would you like to build with us?", full: true, required: true },
  { name: "availability", label: "Availability", hint: "(optional)", full: true, placeholder: "e.g. Can start in two weeks, ~20 hours per week" },
];
const FIELD_ORDER: ApplicationField[] = [...FIELDS.slice(0, 9).map((f) => f.name), "resume", ...FIELDS.slice(9).map((f) => f.name)];

function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function RoleSummary({ slug }: { slug: string }) {
  const role = findRole(slug);
  if (!role) {
    return (
      <aside className="role-summary" aria-label="Role details">
        <span className="eyebrow">Open application</span>
        <h2 className="job-card__title">Choose a role</h2>
        <p className="job-card__desc">
          Pick the opportunity you&apos;re most interested in. You can browse every role before you decide.
        </p>
        <Link className="role-summary__link" href="/careers/positions">
          View all positions <ArrowRight className="icon" aria-hidden="true" />
        </Link>
      </aside>
    );
  }
  return (
    <aside className="role-summary" aria-label="Role details">
      <DeptIcon role={role} />
      <h2 className="job-card__title">{role.title}</h2>
      <p className="job-card__desc">{role.description}</p>
      <JobMeta role={role} withOpenings />
      <Link className="role-summary__link" href="/careers/positions">
        See other positions <ArrowRight className="icon" aria-hidden="true" />
      </Link>
    </aside>
  );
}

function SuccessState({ applicationId, position }: { applicationId: string; position: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="apply-form apply-success" ref={ref} tabIndex={-1} role="status" aria-live="polite">
      <span className="apply-success__icon" aria-hidden="true">
        <CheckCircle2 className="icon" />
      </span>
      <h2>Application Submitted Successfully!</h2>
      <p>
        Thank you for your interest in joining Qubenix AI. Our team has received your application and will review your
        profile.
      </p>
      <div className="apply-success__id">
        <div>
          <span>Application ID</span>
          <strong>{applicationId}</strong>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            navigator.clipboard?.writeText(applicationId).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          <Copy className="icon" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="apply-success__note">
        Applied for <b>{position}</b>. Keep this ID for your records; please mention it if you contact us about your
        application.
      </p>
      <div className="form-actions">
        <Link className="btn btn-primary" href="/careers/positions">
          Explore other roles
        </Link>
        <Link className="btn btn-outline" href="/careers">
          Back to careers
        </Link>
      </div>
    </div>
  );
}

export function ApplyForm({ initialRole, formToken }: { initialRole: string; formToken: string }) {
  const [role, setRole] = useState(findRole(initialRole) ? initialRole : "");
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "", msg: "" });
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [resume, setResume] = useState<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  // One ID per application attempt: retries after a network error reuse it, so the backend never stores it twice.
  const submissionId = useRef<string>("");
  const years = graduationYears();

  useEffect(() => {
    submissionId.current = newSubmissionId();
  }, []);

  const selected = findRole(role);
  const busy = phase.name === "uploading" || phase.name === "saving";

  function readForm(): Partial<ApplicationInput> {
    const fd = new FormData(formRef.current!);
    const out: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
    return out;
  }

  function validateOne(name: keyof ApplicationInput) {
    const { errors: all } = validateApplication(readForm());
    setErrors((e) => ({ ...e, [name]: all[name] }));
  }

  function changeRole(slug: string) {
    setRole(slug);
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("role", slug);
    else url.searchParams.delete("role");
    window.history.replaceState(null, "", url);
    const r = findRole(slug);
    document.title = r ? `Apply for ${r.title} — Qubenix AI Careers` : "Apply — Qubenix AI Careers";
  }

  function pickFile(file: File | null) {
    setResume(file);
    setErrors((e) => ({ ...e, resume: file ? validateResumeMeta(file) ?? undefined : undefined }));
  }

  function focusFirst(errs: ApplicationErrors) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
  }

  function send(fd: FormData): Promise<{ status: number; body: Record<string, unknown> }> {
    // XHR rather than fetch: it reports upload progress for the resume.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/careers/apply");
      xhr.timeout = 90_000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPhase({ name: "uploading", pct: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.upload.onload = () => setPhase({ name: "saving" });
      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error page */
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.ontimeout = () => reject(new Error("timeout"));
      xhr.send(fd);
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return; // ignore double clicks / repeated Enter
    const result = validateApplication(readForm());
    const fileError = validateResumeMeta(resume);
    const allErrors: ApplicationErrors = { ...result.errors, ...(fileError ? { resume: fileError } : {}) };
    setErrors(allErrors);
    if (!result.ok || fileError) {
      focusFirst(allErrors);
      setStatus({ kind: "warn", msg: "Please fix the highlighted fields." });
      return;
    }

    const fd = new FormData(formRef.current!);
    fd.set("resume", resume!, resume!.name);
    fd.set("submission_id", submissionId.current);

    inFlight.current = true;
    setPhase({ name: "uploading", pct: 0 });
    setStatus({ kind: "", msg: "" });
    try {
      const { status: code, body } = await send(fd);
      if (code === 201 && body.ok && typeof body.applicationId === "string") {
        setPhase({ name: "done", applicationId: body.applicationId, position: String(body.position ?? selected?.title ?? "") });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setPhase({ name: "idle" });
      const serverErrors = (body.errors ?? {}) as ApplicationErrors;
      if (Object.keys(serverErrors).length) {
        setErrors(serverErrors);
        focusFirst(serverErrors);
      }
      setStatus({
        kind: "warn",
        msg: typeof body.message === "string" ? body.message : "Something went wrong sending your application. Please try again.",
      });
    } catch (err) {
      setPhase({ name: "idle" });
      setStatus({
        kind: "warn",
        msg:
          (err as Error).message === "timeout"
            ? "Submitting took too long. Please try again — if it already went through, we'll recognise it and won't create a duplicate."
            : "Couldn't reach the server. Check your connection and try again.",
      });
    } finally {
      inFlight.current = false;
    }
  }

  if (phase.name === "done") {
    return (
      <div className="apply-layout">
        <RoleSummary slug={role} />
        <SuccessState applicationId={phase.applicationId} position={phase.position} />
      </div>
    );
  }

  const renderField = (f: FieldDef) => {
    const err = errors[f.name];
    const common = {
      id: f.name,
      name: f.name,
      required: f.required,
      disabled: busy,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? `${f.name}-error` : undefined,
      onBlur: () => validateOne(f.name),
      // Clear a stale error as soon as the field is edited.
      onInput: () => {
        if (errors[f.name]) validateOne(f.name);
      },
    };
    return (
      <div key={f.name} className={`field${f.full ? " field--full" : ""}`}>
        <label htmlFor={f.name}>
          {f.label} {f.hint && <span className="optional">{f.hint}</span>}
        </label>
        {f.name === "role" ? (
          <select {...common} value={role} onChange={(e) => changeRole(e.target.value)}>
            <option value="">Select a role</option>
            {ROLES.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.title}
              </option>
            ))}
          </select>
        ) : f.name === "graduation_year" ? (
          <select {...common} defaultValue="">
            <option value="">Select year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        ) : f.name === "motivation" ? (
          <textarea {...common} />
        ) : (
          <input
            {...common}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            inputMode={f.inputMode}
          />
        )}
        <p className="field__error" id={`${f.name}-error`}>
          {err}
        </p>
      </div>
    );
  };

  return (
    <div className="apply-layout">
      <RoleSummary slug={role} />

      <form className="apply-form" ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy}>
        <h2>{selected ? `Your application for ${selected.title}` : "Your application"}</h2>
        <p>Fields marked optional can be left blank.</p>

        {/* Spam protection: hidden from people, tempting to bots. */}
        <div className="hp-field" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <input type="hidden" name="form_token" value={formToken} />

        <div className="form-grid">
          {FIELDS.slice(0, 9).map(renderField)}

          <div className="field field--full">
            <label htmlFor="resume">
              Resume <span className="optional">(PDF, DOC or DOCX, max 5 MB)</span>
            </label>
            <div className={`file-drop${resume && !errors.resume ? " file-drop--has-file" : ""}`}>
              <input
                ref={fileRef}
                id="resume"
                name="resume"
                type="file"
                accept={RESUME_ACCEPT}
                required
                disabled={busy}
                aria-invalid={errors.resume ? true : undefined}
                aria-describedby={errors.resume ? "resume-error" : "resume-hint"}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {resume ? (
                <div className="file-drop__chosen">
                  <FileText className="icon" aria-hidden="true" />
                  <span className="file-drop__name">{resume.name}</span>
                  <span className="file-drop__size">{formatBytes(resume.size)}</span>
                  {!busy && (
                    <button
                      type="button"
                      className="file-drop__clear"
                      aria-label="Remove resume"
                      onClick={() => {
                        if (fileRef.current) fileRef.current.value = "";
                        pickFile(null);
                      }}
                    >
                      <X className="icon" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="file-drop__prompt" id="resume-hint">
                  <UploadCloud className="icon" aria-hidden="true" />
                  <span>
                    <b>Choose a file</b> or drag it here
                  </span>
                </div>
              )}
            </div>
            <p className="field__error" id="resume-error">
              {errors.resume}
            </p>
          </div>

          {FIELDS.slice(9).map(renderField)}
        </div>

        {busy && (
          <div className="submit-progress" role="status" aria-live="polite">
            <div className="submit-progress__bar">
              <span style={{ width: `${phase.name === "uploading" ? Math.max(4, phase.pct) : 100}%` }} className={phase.name === "saving" ? "is-saving" : ""} />
            </div>
            <p>
              {phase.name === "uploading" ? `Uploading your resume… ${phase.pct}%` : "Saving your application… this can take a few seconds."}
            </p>
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </button>
          <p className={`form-status${status.kind ? ` form-status--${status.kind}` : ""}`} role="alert">
            {status.msg}
          </p>
        </div>
      </form>
    </div>
  );
}
