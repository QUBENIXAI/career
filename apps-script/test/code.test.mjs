// Unit tests for apps-script/Code.gs against mocked Google services.  Run: npm run test:apps-script
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createGas } from "./gas-mock.mjs";

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2048, 0x20), Buffer.from("\n%%EOF")]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(1024, 1)]);
const DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(1024, 1)]);

function setupGas(faults) {
  const gas = createGas({ quiet: true, faults });
  gas.setup();
  return gas;
}

function body(gas, over = {}) {
  const { fields, resume, ...rest } = over;
  return {
    secret: gas.props.get("SHARED_SECRET"),
    submission_id: randomUUID(),
    website: "",
    fields: {
      full_name: "Asha Verma",
      email: "Asha.Verma@Example.test",
      phone: "+91 98765 43210",
      position: "AI & Automation Intern",
      location: "Pune, India",
      college: "Example Institute of Technology",
      education: "B.Tech, Computer Science",
      graduation_year: String(new Date().getFullYear() + 1),
      skills: "Python, APIs, prompt engineering",
      linkedin_url: "https://www.linkedin.com/in/example",
      portfolio_url: "https://github.com/example",
      motivation: "I want to build automation that ships.",
      availability: "20 hours/week",
      ...fields,
    },
    resume: resume === undefined ? { name: "resume.pdf", data: PDF.toString("base64") } : resume,
    ...rest,
  };
}

test("setup creates the sheet, folder and secret, and is idempotent", () => {
  const gas = setupGas();
  const sheet = gas.sheet();
  assert.equal(gas.spreadsheet().name, "Qubenix AI – Career Applications");
  assert.equal(sheet.name, "Applications");
  assert.deepEqual(sheet.rows[0], gas.HEADERS);
  assert.equal(sheet.rows[0].slice(0, 16).at(-1), "Application Status");
  assert.equal(sheet.frozen, 1, "header row frozen");
  assert.ok(sheet.filter, "filter enabled");
  assert.ok(sheet.validation.list.includes("New"));
  assert.equal(gas.folder().name, "Qubenix AI – Candidate Resumes");
  assert.equal(gas.folder().sharing, "PRIVATE/NONE");
  assert.match(gas.props.get("SHARED_SECRET"), /^[a-f0-9]{64}$/);

  const secret = gas.props.get("SHARED_SECRET");
  const ssId = gas.props.get("SPREADSHEET_ID");
  gas.setup();
  assert.equal(gas.props.get("SHARED_SECRET"), secret);
  assert.equal(gas.props.get("SPREADSHEET_ID"), ssId);
  assert.equal(gas.sheet().rows.length, 1);
});

test("valid application: resume in Drive, one row in Sheets, emails sent", () => {
  const gas = setupGas();
  const res = gas.post(body(gas));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.match(res.applicationId, /^QBX-\d{4}-00001$/);

  const rows = gas.sheet().rows;
  assert.equal(rows.length, 2);
  const row = Object.fromEntries(gas.HEADERS.map((h, i) => [h, rows[1][i]]));
  assert.equal(row["Application ID"], res.applicationId);
  assert.equal(Object.prototype.toString.call(row["Submission Date"]), "[object Date]"); // VM realm Date
  assert.equal(row["Candidate Name"], "Asha Verma");
  assert.equal(row["Email Address"], "asha.verma@example.test");
  assert.equal(row["Applied Position"], "AI & Automation Intern");
  assert.equal(row["Application Status"], "New");
  assert.equal(row["Resume Filename"], `${res.applicationId}_Asha-Verma_Resume.pdf`);

  assert.equal(gas.files.length, 1);
  const file = gas.files[0];
  assert.equal(row["Resume Drive Link"], file.getUrl());
  assert.equal(file.name, row["Resume Filename"]);
  assert.equal(file.mime, "application/pdf");
  assert.equal(file.size, PDF.length);
  assert.equal(file.sharing, "PRIVATE/NONE");
  assert.equal(file.folderId, gas.folder().id);

  assert.equal(gas.mail.length, 2);
  const team = gas.mail.find((m) => m.to === "hello.qubenix@gmail.com");
  assert.equal(team.subject, "New Career Application – AI & Automation Intern – Asha Verma");
  assert.equal(team.replyTo, "asha.verma@example.test");
  assert.ok(gas.mail.some((m) => m.to === "asha.verma@example.test" && m.htmlBody.includes(res.applicationId)));
});

test("application IDs are sequential", () => {
  const gas = setupGas();
  const a = gas.post(body(gas));
  const b = gas.post(body(gas, { fields: { email: "other@example.test" } }));
  assert.match(a.applicationId, /-00001$/);
  assert.match(b.applicationId, /-00002$/);
});

test("DOC and DOCX are accepted with the right MIME type", () => {
  const gas = setupGas();
  const d1 = gas.post(body(gas, { resume: { name: "cv.docx", data: DOCX.toString("base64") } }));
  const d2 = gas.post(body(gas, { fields: { email: "b@example.test" }, resume: { name: "cv.DOC", data: DOC.toString("base64") } }));
  assert.ok(d1.ok && d2.ok);
  assert.equal(gas.files[0].mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(gas.files[1].mime, "application/msword");
  assert.ok(gas.files[1].name.endsWith(".doc"));
});

test("wrong or missing secret is rejected and nothing is stored", () => {
  const gas = setupGas();
  assert.equal(gas.post(body(gas, { secret: "nope" })).code, "UNAUTHORIZED");
  assert.equal(gas.post({ ...body(gas), secret: undefined }).code, "UNAUTHORIZED");
  assert.equal(gas.sheet().rows.length, 1);
  assert.equal(gas.files.length, 0);
});

test("malformed body and unconfigured script", () => {
  const gas = setupGas();
  assert.equal(gas.post("not json").code, "BAD_REQUEST");
  assert.equal(gas.post(body(gas, { submission_id: "short" })).code, "BAD_REQUEST");
  const fresh = createGas({ quiet: true });
  assert.equal(fresh.post({}).code, "NOT_CONFIGURED");
});

test("missing and invalid fields are rejected with field errors", () => {
  const gas = setupGas();
  const res = gas.post(
    body(gas, {
      fields: { full_name: "", email: "nope", phone: "abc", graduation_year: "1800", linkedin_url: "https://evil.example/in/x", skills: "x".repeat(501) },
    }),
  );
  assert.equal(res.code, "VALIDATION");
  assert.deepEqual(Object.keys(res.errors).sort(), ["email", "full_name", "graduation_year", "linkedin_url", "phone", "skills"]);
  assert.equal(gas.sheet().rows.length, 1);
  assert.equal(gas.files.length, 0);
});

test("resume: missing, wrong type, spoofed content, oversized, empty", () => {
  const gas = setupGas();
  const cases = [
    [null, /attach your resume/],
    [{ name: "resume.exe", data: PDF.toString("base64") }, /PDF, DOC or DOCX/],
    [{ name: "resume", data: PDF.toString("base64") }, /PDF, DOC or DOCX/],
    [{ name: "resume.pdf", data: Buffer.from("MZ\x90\x00 not a pdf").toString("base64") }, /valid PDF/],
    [{ name: "resume.docx", data: PDF.toString("base64") }, /valid DOCX/],
    [{ name: "resume.pdf", data: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]).toString("base64") }, /5 MB/],
    [{ name: "resume.pdf", data: "" }, /attach your resume/],
    [{ name: "resume.pdf", data: "!!!not base64!!!" }, /could not be read/],
  ];
  for (const [resume, re] of cases) {
    const res = gas.post(body(gas, { resume }));
    assert.equal(res.ok, false);
    assert.match(res.errors?.resume ?? res.message, re, JSON.stringify(resume?.name));
  }
  assert.equal(gas.files.length, 0);
  assert.equal(gas.sheet().rows.length, 1);
});

test("exactly 5 MB is accepted", () => {
  const gas = setupGas();
  const five = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5 * 1024 * 1024 - 5, 0x20)]);
  assert.equal(gas.post(body(gas, { resume: { name: "r.pdf", data: five.toString("base64") } })).ok, true);
});

test("honeypot filled is rejected", () => {
  const gas = setupGas();
  assert.equal(gas.post(body(gas, { website: "http://spam.example" })).code, "REJECTED");
  assert.equal(gas.files.length, 0);
});

test("retrying the same submission returns the same ID without a second row", () => {
  const gas = setupGas();
  const b = body(gas);
  const first = gas.post(b);
  const again = gas.post(b);
  assert.deepEqual(again, first);
  assert.equal(gas.sheet().rows.length, 2);
  assert.equal(gas.files.length, 1);
  assert.equal(gas.mail.length, 2, "emails not re-sent");
});

test("same email + position within 30 days is a duplicate; another position is fine", () => {
  const gas = setupGas();
  assert.equal(gas.post(body(gas)).ok, true);
  const dup = gas.post(body(gas, { fields: { email: "ASHA.verma@example.test" } }));
  assert.equal(dup.code, "DUPLICATE");
  assert.equal(gas.files.length, 1);
  assert.equal(gas.post(body(gas, { fields: { position: "Full Stack Development" } })).ok, true);

  // An application older than the window doesn't block a new one.
  gas.sheet().rows[1][1] = new Date(Date.now() - 31 * 24 * 3600 * 1000);
  assert.equal(gas.post(body(gas)).ok, true);
});

test("Drive failure: no row, no success", () => {
  const gas = setupGas({ drive: true });
  const res = gas.post(body(gas));
  assert.equal(res.code, "UPLOAD_FAILED");
  assert.equal(gas.sheet().rows.length, 1);
});

test("Sheets failure: resume is trashed, no success, retry later works", () => {
  const gas = setupGas({ sheet: true });
  const b = body(gas);
  const res = gas.post(b);
  assert.equal(res.code, "SAVE_FAILED");
  assert.equal(gas.files.length, 1);
  assert.equal(gas.files[0].trashed, true);
  assert.equal(gas.mail.length, 0);

  gas.faults.sheet = false;
  const retry = gas.post(b);
  assert.equal(retry.ok, true, "failed attempt is not cached as success");
  assert.equal(gas.sheet().rows.length, 2);
});

test("lock contention returns BUSY", () => {
  const gas = setupGas({ lockBusy: true });
  assert.equal(gas.post(body(gas)).code, "BUSY");
});

test("mail failure or exhausted quota does not fail a saved application", () => {
  for (const mail of [true, "quota"]) {
    const gas = setupGas({ mail });
    const res = gas.post(body(gas));
    assert.equal(res.ok, true);
    assert.equal(gas.sheet().rows.length, 2);
  }
});

test("formula injection is neutralised", () => {
  const gas = setupGas();
  gas.post(body(gas, { fields: { full_name: '=HYPERLINK("http://evil","x")', skills: "+cmd", motivation: "@SUM(A1)" } }));
  const sheet = gas.sheet();
  // The mock strips the apostrophe like Sheets does; check what Code.gs actually sent.
  const sent = [];
  const orig = sheet.appendRow;
  sheet.appendRow = (row) => (sent.push(row), orig(row));
  gas.post(body(gas, { fields: { email: "c@example.test", full_name: "=1+1", skills: "-2" } }));
  assert.equal(sent[0][2], "'=1+1");
  assert.equal(sent[0][9], "'-2");
});

test("emails escape candidate-provided HTML", () => {
  const gas = setupGas();
  gas.post(body(gas, { fields: { full_name: "<img src=x onerror=alert(1)>", motivation: "<script>x</script>" } }));
  for (const m of gas.mail) {
    assert.ok(!m.htmlBody.includes("<script>"));
    assert.ok(!m.htmlBody.includes("<img src=x"));
  }
});

test("doGet is a harmless health check", () => {
  const gas = setupGas();
  const out = JSON.parse(gas.doGet().getContent());
  assert.deepEqual(out, { ok: true, service: "qubenix-careers", configured: true });
});
