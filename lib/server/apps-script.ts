import "server-only";
import type { ApplicationErrors, ApplicationInput, ResumeExt } from "@/lib/careers";

/** Shape returned by doPost in apps-script/Code.gs. */
export type AppsScriptResult =
  | { ok: true; applicationId: string; position: string }
  | {
      ok: false;
      code:
        | "NOT_CONFIGURED" | "BAD_REQUEST" | "UNAUTHORIZED" | "REJECTED" | "VALIDATION" | "DUPLICATE"
        | "BUSY" | "UPLOAD_FAILED" | "SAVE_FAILED" | "SERVER_ERROR";
      message: string;
      errors?: Record<string, string>;
    };

export class AppsScriptError extends Error {
  constructor(message: string, readonly kind: "config" | "network" | "timeout" | "bad_response") {
    super(message);
  }
}

export interface SubmitPayload {
  submissionId: string;
  fields: ApplicationInput & { position: string };
  resume: { name: string; ext: ResumeExt; bytes: Buffer };
}

export function appsScriptConfigured(): boolean {
  return !!(process.env.APPS_SCRIPT_WEB_APP_URL && process.env.APPS_SCRIPT_SHARED_SECRET);
}

/**
 * Calls the Apps Script Web App from the server. The browser never talks to Google directly, so there is
 * no CORS to deal with and the shared secret stays server-side.
 *
 * Apps Script answers a POST to /exec with a 302 to script.googleusercontent.com, where the JSON result
 * is served by GET. fetch's default redirect handling does exactly that (302 → GET, body dropped).
 */
export async function submitToAppsScript(p: SubmitPayload, timeoutMs = 50_000): Promise<AppsScriptResult> {
  const url = process.env.APPS_SCRIPT_WEB_APP_URL;
  const secret = process.env.APPS_SCRIPT_SHARED_SECRET;
  if (!url || !secret) throw new AppsScriptError("Apps Script is not configured", "config");

  const body = JSON.stringify({
    secret,
    submission_id: p.submissionId,
    fields: { ...p.fields },
    resume: { name: `resume.${p.resume.ext}`, data: p.resume.bytes.toString("base64") },
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    throw new AppsScriptError(`Apps Script request failed: ${String(err)}`, name === "TimeoutError" ? "timeout" : "network");
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Apps Script returns an HTML page for deployment/permission problems.
    throw new AppsScriptError(`Apps Script returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`, "bad_response");
  }
  if (!data || typeof data !== "object" || typeof (data as { ok?: unknown }).ok !== "boolean") {
    throw new AppsScriptError(`Apps Script returned an unexpected payload (HTTP ${res.status})`, "bad_response");
  }
  return data as AppsScriptResult;
}

/** Maps Apps Script field names back to the form's. */
export function mapErrors(errors?: Record<string, string>): ApplicationErrors {
  if (!errors) return {};
  const out: ApplicationErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    const key = (k === "position" ? "role" : k) as keyof ApplicationErrors;
    out[key] = v;
  }
  return out;
}
