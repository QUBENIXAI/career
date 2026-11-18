import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, timestamped token rendered into the apply form. Bots that post straight to the API
 * (no token) or submit faster than a person can fill the form are rejected.
 */
const MIN_FILL_MS = 3_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Falls back to a per-process key in development so the form works before env vars are set.
const fallbackKey = randomBytes(32).toString("hex");
function key(): string {
  return process.env.CAREERS_FORM_SECRET || process.env.APPS_SCRIPT_SHARED_SECRET || fallbackKey;
}

function sign(ts: string): string {
  return createHmac("sha256", key()).update(`careers-form:${ts}`).digest("base64url");
}

export function issueFormToken(now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts)}`;
}

export type TokenCheck = { ok: true } | { ok: false; reason: "missing" | "invalid" | "too_fast" | "expired" };

export function checkFormToken(token: unknown, now = Date.now()): TokenCheck {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "missing" };
  const [ts, sig] = token.split(".", 2);
  if (!/^\d{10,16}$/.test(ts)) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(ts));
  const given = Buffer.from(sig ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  const age = now - Number(ts);
  if (age < MIN_FILL_MS) return { ok: false, reason: "too_fast" };
  if (age > MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}
