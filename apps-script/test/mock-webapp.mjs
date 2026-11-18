// Local stand-in for the deployed Apps Script Web App, for end-to-end testing of the Next.js route.
// Runs the real Code.gs (with mocked Google services) and reproduces Google's response flow:
//   POST /exec  →  302 Location: /echo?key=…  →  GET /echo returns the JSON.
//
//   node apps-script/test/mock-webapp.mjs [port]
//   APPS_SCRIPT_WEB_APP_URL=http://127.0.0.1:3999/exec  APPS_SCRIPT_SHARED_SECRET=<printed secret>
//
// Test helpers: GET /__state (rows, files), POST /__fault?drive=1&sheet=1&mail=1&html=1 to simulate failures.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { createGas } from "./gas-mock.mjs";

const port = Number(process.argv[2] || 3999);
const gas = createGas({ quiet: true });
gas.setup();
const secret = process.env.MOCK_SECRET || gas.props.get("SHARED_SECRET");
gas.props.set("SHARED_SECRET", secret);
const outputs = new Map();
let htmlError = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/exec") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (htmlError) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<html><body>Script function not found: doPost</body></html>");
      }
      const out = gas.doPost({ postData: { contents: Buffer.concat(chunks).toString("utf8") } }).getContent();
      const key = randomUUID();
      outputs.set(key, out);
      res.writeHead(302, { Location: `/echo?user_content_key=${key}` });
      res.end();
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/echo") {
    const out = outputs.get(url.searchParams.get("user_content_key"));
    if (!out) return res.writeHead(404).end("gone");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(out);
  }

  if (url.pathname === "/__state") {
    const sheet = gas.sheet();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify(
        {
          spreadsheet: gas.spreadsheet().name,
          sheet: sheet.name,
          frozen: sheet.frozen,
          filter: !!sheet.filter,
          headers: sheet.rows[0],
          rows: sheet.rows.slice(1).map((r) => Object.fromEntries(sheet.rows[0].map((h, i) => [h, r[i]]))),
          folder: gas.folder().name,
          files: gas.files.map((f) => ({ name: f.name, mime: f.mime, size: f.size, sharing: f.sharing, trashed: f.trashed, url: f.getUrl() })),
          mail: gas.mail.map((m) => ({ to: m.to, subject: m.subject })),
        },
        null,
        2,
      ),
    );
  }

  if (req.method === "POST" && url.pathname === "/__fault") {
    gas.faults.drive = url.searchParams.get("drive") === "1";
    gas.faults.sheet = url.searchParams.get("sheet") === "1";
    gas.faults.mail = url.searchParams.get("mail") === "1";
    htmlError = url.searchParams.get("html") === "1";
    return res.writeHead(204).end();
  }

  res.writeHead(404).end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Apps Script Web App on http://127.0.0.1:${port}/exec`);
  console.log(`SHARED_SECRET=${secret}`);
});
