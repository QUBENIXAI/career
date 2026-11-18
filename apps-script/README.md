# Careers backend — Google Apps Script + Sheets + Drive

`Code.gs` receives applications from the Next.js route `/api/careers/apply`, saves the resume as a private
file in Google Drive, and appends one row per candidate to Google Sheets.

```
Browser ──multipart──▶ Next.js /api/careers/apply ──JSON + shared secret──▶ Apps Script doPost
          (validates, honeypot, spam token,          (validates again, lock, ID, Drive upload,
           rate limit, file type/size/content)        Sheets row, emails)
```

The browser never calls Google directly, so there is no CORS setup and the secret never reaches the browser.

## One-time setup (about 10 minutes)

Use the Google account that should **own** the candidate data (e.g. the Qubenix team account).

1. Go to <https://script.google.com> → **New project**. Name it `Qubenix Careers Backend`.
2. Replace the contents of `Code.gs` with [`Code.gs`](./Code.gs) from this folder.
3. **Project Settings** (gear) → tick **Show "appsscript.json" manifest file**. Open `appsscript.json` in the
   editor and replace it with [`appsscript.json`](./appsscript.json).
   Change `"timeZone"` if the team isn't in India; it sets the year in application IDs and email dates.
4. In the editor's function dropdown choose **`setup`** → **Run**. Approve the permissions
   (Sheets, Drive, send email as you). On a personal Gmail account you'll see "Google hasn't verified this app":
   choose **Advanced → Go to Qubenix Careers Backend**. It's your own script.
5. Open **Execution log**. `setup` prints:
   - the spreadsheet URL (**Qubenix AI – Career Applications**, tab **Applications**, header frozen, filters on,
     a status dropdown with New / Reviewing / Shortlisted / Interview / Offered / Hired / Rejected / Withdrawn)
   - the Drive folder URL (**Qubenix AI – Candidate Resumes**, private)
   - `SHARED_SECRET=…` → copy it.
6. **Deploy → New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**. This is required so the Next.js server can call it without a Google login.
     Requests without the shared secret are rejected and nothing is stored.
   Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
7. On the Next.js server set (e.g. `.env.local`, or your host's environment settings):

   ```bash
   APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/AKfy…/exec
   APPS_SCRIPT_SHARED_SECRET=<the SHARED_SECRET from step 5>
   ```

   Restart / redeploy the Next.js app.
8. Submit a test application on `/careers/apply`, then check the sheet, the Drive folder and the inbox
   `hello.qubenix@gmail.com`. Delete the test row and file afterwards.

**Updating the script later:** edit `Code.gs`, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
The `/exec` URL stays the same. Saving the file alone does not update the live web app.

## Settings (Project Settings → Script properties)

| Property | Default | Meaning |
| --- | --- | --- |
| `SHARED_SECRET` | generated | Must equal `APPS_SCRIPT_SHARED_SECRET` in Next.js. To rotate: change both, redeploy Next.js. |
| `NOTIFY_EMAIL` | `hello.qubenix@gmail.com` | Hiring-team notification address (comma-separate several). |
| `SEND_CANDIDATE_EMAIL` | `true` | Set to `false` to stop candidate confirmation emails. |
| `SPREADSHEET_ID`, `FOLDER_ID` | set by `setup` | Where data goes. Point them at an existing sheet/folder if you move them. |
| `APP_SEQ` | `0` | Last application number used (`QBX-2026-00042`). Don't lower it. |

## Who can see candidate data

Only people the owner shares the **spreadsheet** and the **resume folder** with. Share both with named
Qubenix team members (Viewer or Editor). Never use "Anyone with the link". Each resume is also explicitly
set to private (`setSharing(PRIVATE, NONE)`), and the Drive link in the sheet only opens for people who
have access to the folder.

## What the backend guarantees

- **No false success.** The candidate only sees "Application Submitted Successfully!" after the resume is
  in Drive *and* the row is in Sheets. If the sheet write fails, the uploaded resume is moved to the trash.
- **No duplicates.** A retried request (double click, network retry) carries the same submission ID and
  gets the original Application ID back for 6 hours. The same email applying to the same position again
  within 30 days is refused with a friendly message. A different position is allowed.
- **Concurrency-safe.** `LockService` serialises ID generation and writes, so simultaneous applicants never
  get the same ID or overwrite each other.
- **Files.** PDF, DOC and DOCX only, 5 MB max, checked by extension *and* by the file's actual content
  (a renamed `.exe` is rejected). Stored as `QBX-2026-00042_Candidate-Name_Resume.pdf`.
- **Sheets safety.** Cells starting with `= + - @` are stored as text so a candidate can't inject formulas.
- **Email is best effort.** Quota exhaustion or a mail error is logged but never fails a saved application.
  Consumer Gmail accounts can send about 100 emails a day from Apps Script; each application uses 2.

## Testing without Google

```bash
npm run test:apps-script   # 19 tests: runs Code.gs against in-memory Sheets/Drive/Lock/Properties/Cache/Mail
npm run mock:apps-script   # local fake Web App on :3999 that runs Code.gs and mimics Google's 302 redirect
```

To test the whole site against the fake, start the mock with a secret and point Next.js at it:

```bash
MOCK_SECRET=dev-secret npm run mock:apps-script
APPS_SCRIPT_WEB_APP_URL=http://127.0.0.1:3999/exec APPS_SCRIPT_SHARED_SECRET=dev-secret npm run dev
```

`GET http://127.0.0.1:3999/__state` shows the fake sheet rows and files;
`POST /__fault?drive=1` (or `sheet=1`, `mail=1`, `html=1`) simulates failures.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Form says "couldn't submit… try again in a few minutes"; server log shows `bad_response … <html` | Web app not deployed as *Anyone*, or the URL isn't the `/exec` one, or the latest code isn't deployed as a new version. |
| Server log shows `UNAUTHORIZED` | `APPS_SCRIPT_SHARED_SECRET` doesn't match the `SHARED_SECRET` script property. |
| Server log shows `NOT_CONFIGURED` | `setup` was never run in this script project. |
| Form says applications aren't being accepted yet | `APPS_SCRIPT_WEB_APP_URL` / `APPS_SCRIPT_SHARED_SECRET` missing on the Next.js server. |
| No emails | Check **Executions** in the Apps Script editor for mail warnings; daily quota may be used up. |
