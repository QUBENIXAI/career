// Runs the real apps-script/Code.gs inside a Node VM with in-memory fakes of the Google services it uses.
// Used by code.test.mjs and mock-webapp.mjs. Not deployed anywhere.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";

const CODE_PATH = new URL("../Code.gs", import.meta.url);

export function createGas(opts = {}) {
  const faults = { drive: false, sheet: false, mail: false, lockBusy: false, ...opts.faults };
  const props = new Map();
  const cache = new Map();
  const mail = [];
  const files = [];
  const spreadsheets = new Map();
  const folders = new Map();

  const chain = (target = {}) =>
    new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => chain(t)) });

  function makeSheet(ss, name) {
    const sheet = {
      name,
      rows: [], // 2D, row 0 = headers
      maxRows: 1000,
      frozen: 0,
      filter: null,
      validation: null,
      getName: () => sheet.name,
      setName: (n) => ((sheet.name = n), sheet),
      getParent: () => ss,
      getLastRow: () => sheet.rows.length,
      getMaxRows: () => sheet.maxRows,
      setFrozenRows: (n) => (sheet.frozen = n),
      getFilter: () => sheet.filter,
      setColumnWidth: () => sheet,
      insertRowsBefore: (_before, n) => ((sheet.maxRows += n), sheet),
      appendRow: (row) => {
        if (faults.sheet) throw new Error("Simulated Sheets failure");
        // Sheets treats a leading apostrophe as "force text" and hides it.
        sheet.rows.push(row.map((v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v)));
        return sheet;
      },
      getRange: (r, c, nr = 1, nc = 1) =>
        chain({
          setValues: (vals) => {
            vals.forEach((row, i) => (sheet.rows[r - 1 + i] = row.slice()));
            return chain();
          },
          getValues: () =>
            Array.from({ length: nr }, (_, i) => (sheet.rows[r - 1 + i] ?? []).slice(c - 1, c - 1 + nc)),
          createFilter: () => (sheet.filter = { range: [r, c, nr, nc] }),
          setDataValidation: (v) => ((sheet.validation = v), chain()),
        }),
    };
    return sheet;
  }

  function makeSpreadsheet(name) {
    const id = "ss_" + randomUUID();
    const ss = { id, name, sheets: [] };
    Object.assign(ss, {
      getId: () => id,
      getUrl: () => `https://docs.google.com/spreadsheets/d/${id}`,
      getSheets: () => ss.sheets,
      getSheetByName: (n) => ss.sheets.find((s) => s.name === n) ?? null,
      insertSheet: (n) => {
        const s = makeSheet(ss, n);
        ss.sheets.push(s);
        return s;
      },
    });
    ss.sheets.push(makeSheet(ss, "Sheet1"));
    spreadsheets.set(id, ss);
    return ss;
  }

  function makeFolder(name) {
    const id = "folder_" + randomUUID();
    const folder = {
      id,
      name,
      sharing: "default",
      getId: () => id,
      getUrl: () => `https://drive.google.com/drive/folders/${id}`,
      setDescription: () => folder,
      setSharing: (access, perm) => ((folder.sharing = `${access}/${perm}`), folder),
      createFile: (blob) => {
        if (faults.drive) throw new Error("Simulated Drive failure");
        const fid = "file_" + randomUUID();
        const file = {
          id: fid,
          name: blob.name,
          mime: blob.mime,
          size: blob.bytes.length,
          bytes: blob.bytes,
          trashed: false,
          sharing: "inherited",
          folderId: id,
          getId: () => fid,
          getUrl: () => `https://drive.google.com/file/d/${fid}/view`,
          setDescription: () => file,
          setSharing: (access, perm) => ((file.sharing = `${access}/${perm}`), file),
          setTrashed: (t) => ((file.trashed = t), file),
        };
        files.push(file);
        return file;
      },
    };
    folders.set(id, folder);
    return folder;
  }

  const globals = {
    console: opts.quiet ? { log() {}, warn() {}, error() {} } : console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
      }),
    },
    CacheService: {
      getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => !faults.lockBusy, releaseLock: () => {} }),
    },
    SpreadsheetApp: {
      create: (name) => makeSpreadsheet(name),
      openById: (id) => {
        const ss = spreadsheets.get(id);
        if (!ss) throw new Error("Not found");
        return ss;
      },
      flush: () => {},
      newDataValidation: () => {
        const v = { list: null };
        const b = {
          requireValueInList: (l) => ((v.list = l), b),
          setAllowInvalid: () => b,
          build: () => v,
        };
        return b;
      },
    },
    DriveApp: {
      Access: { PRIVATE: "PRIVATE", ANYONE: "ANYONE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK" },
      Permission: { NONE: "NONE", VIEW: "VIEW", EDIT: "EDIT" },
      createFolder: (name) => makeFolder(name),
      getFolderById: (id) => {
        const f = folders.get(id);
        if (!f) throw new Error("Not found");
        return f;
      },
    },
    Utilities: {
      getUuid: () => randomUUID(),
      base64Decode: (s) => {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("Invalid base64");
        return Array.from(new Int8Array(Buffer.from(s, "base64"))); // Apps Script bytes are signed
      },
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d, _tz, fmt) => {
        if (fmt !== "yyyy") throw new Error("unsupported format in mock: " + fmt);
        return String(d.getFullYear());
      },
    },
    Session: { getScriptTimeZone: () => "Asia/Kolkata" },
    MailApp: {
      getRemainingDailyQuota: () => (faults.mail === "quota" ? 0 : 100),
      sendEmail: (msg) => {
        if (faults.mail === true) throw new Error("Simulated mail failure");
        mail.push(msg);
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (s) => {
        const out = { content: s, mime: "text/plain" };
        out.setMimeType = (m) => ((out.mime = m), out);
        out.getContent = () => out.content;
        return out;
      },
    },
  };

  const ctx = vm.createContext(globals);
  const src = readFileSync(CODE_PATH, "utf8") + "\n;globalThis.__api = { doPost, doGet, setup, CONFIG, HEADERS };";
  vm.runInContext(src, ctx, { filename: "Code.gs" });
  const api = ctx.__api;

  return {
    ...api,
    props,
    cache,
    mail,
    files,
    faults,
    /** The "Applications" sheet (after setup). */
    sheet: () => {
      const ss = spreadsheets.get(props.get("SPREADSHEET_ID"));
      return ss?.getSheetByName("Applications") ?? null;
    },
    spreadsheet: () => spreadsheets.get(props.get("SPREADSHEET_ID")),
    folder: () => folders.get(props.get("FOLDER_ID")),
    /** doPost with a JS object body; returns the parsed JSON response. */
    post: (body) => JSON.parse(api.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } }).getContent()),
  };
}
