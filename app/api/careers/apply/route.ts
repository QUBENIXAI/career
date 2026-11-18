import { NextResponse } from "next/server";
import { findRole, resumeExt, validateApplication, validateResumeMeta, RESUME_MAX_BYTES, type ApplicationErrors } from "@/lib/careers";
import { AppsScriptError, appsScriptConfigured, mapErrors, submitToAppsScript } from "@/lib/server/apps-script";
import { checkFormToken } from "@/lib/server/form-token";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = RESUME_MAX_BYTES + 512 * 1024; // resume + text fields
const SUBMISSION_ID_RE = /^[A-Za-z0-9-]{16,64}$/;

/** Real file content must match the extension (stops renamed executables etc.). */
const MAGIC: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP container
  doc: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE2
};

function fail(status: number, message: string, errors?: ApplicationErrors, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, message, ...(errors ? { errors } : {}) }, { status, headers });
}

/**
 * POST /api/careers/apply (multipart/form-data)
 * Validates the application, then forwards it to the Google Apps Script Web App, which stores the resume
 * in Drive and the candidate in Sheets. Success is only reported when Apps Script confirms both.
 */
export async function POST(req: Request) {
  if (!appsScriptConfigured()) {
    console.error("[careers] APPS_SCRIPT_WEB_APP_URL / APPS_SCRIPT_SHARED_SECRET not set");
    return fail(503, "Applications aren't being accepted through this form yet. Please check back soon.");
  }

  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    return fail(429, "Too many attempts. Please wait a few minutes and try again.", undefined, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return fail(413, "Resume must be 5 MB or smaller.", { resume: "Resume must be 5 MB or smaller." });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Invalid submission. Please refresh the page and try again.");
  }

  // Spam: honeypot field must be empty, and the signed form token must be present and not too fresh.
  if (String(form.get("website") ?? "").trim()) return fail(400, "Submission rejected.");
  const token = checkFormToken(form.get("form_token"));
  if (!token.ok) {
    return token.reason === "too_fast"
      ? fail(429, "That was quick! Please take a moment to review your application, then submit again.")
      : fail(400, "This form has expired. Please refresh the page and try again.");
  }

  const submissionId = String(form.get("submission_id") ?? "");
  if (!SUBMISSION_ID_RE.test(submissionId)) return fail(400, "Invalid submission. Please refresh the page and try again.");

  const text: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") text[k] = v;
  const { ok, errors, value } = validateApplication(text);

  const file = form.get("resume");
  const resumeFile = file instanceof File ? file : null;
  const fileError = validateResumeMeta(resumeFile);
  const allErrors: ApplicationErrors = { ...errors, ...(fileError ? { resume: fileError } : {}) };
  if (!ok || fileError) return fail(422, "Please fix the highlighted fields.", allErrors);

  const ext = resumeExt(resumeFile!.name)!;
  const bytes = Buffer.from(await resumeFile!.arrayBuffer());
  if (bytes.length > RESUME_MAX_BYTES) return fail(413, "Resume must be 5 MB or smaller.", { resume: "Resume must be 5 MB or smaller." });
  if (!MAGIC[ext].every((b, i) => bytes[i] === b)) {
    const msg = `The resume doesn't look like a valid ${ext.toUpperCase()} file. Please export it again and re-upload.`;
    return fail(422, msg, { resume: msg });
  }

  const role = findRole(value.role)!;
  try {
    const result = await submitToAppsScript({
      submissionId,
      fields: { ...value, position: role.title },
      resume: { name: resumeFile!.name, ext, bytes },
    });

    if (result.ok) {
      return NextResponse.json({ ok: true, applicationId: result.applicationId, position: result.position }, { status: 201 });
    }

    switch (result.code) {
      case "VALIDATION":
        return fail(422, result.message, mapErrors(result.errors));
      case "DUPLICATE":
        return fail(409, result.message);
      case "BUSY":
        return fail(503, result.message);
      case "REJECTED":
        return fail(400, "Submission rejected.");
      case "UPLOAD_FAILED":
      case "SAVE_FAILED":
        return fail(502, result.message);
      default:
        // UNAUTHORIZED / NOT_CONFIGURED / BAD_REQUEST / SERVER_ERROR are our problems, not the candidate's.
        console.error(`[careers] Apps Script refused submission: ${result.code} ${result.message}`);
        return fail(502, "We couldn't submit your application right now. Please try again in a few minutes.");
    }
  } catch (err) {
    console.error("[careers] Apps Script call failed:", err instanceof AppsScriptError ? `${err.kind}: ${err.message}` : err);
    const timeout = err instanceof AppsScriptError && err.kind === "timeout";
    return fail(
      timeout ? 504 : 502,
      timeout
        ? "Submitting took too long. Please try again — if your application already went through, we'll recognise it and won't create a duplicate."
        : "We couldn't submit your application right now. Please try again in a few minutes.",
    );
  }
}
