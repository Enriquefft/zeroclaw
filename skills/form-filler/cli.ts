#!/usr/bin/env bun
// cli.ts — form-filler CLI v0.2.0
// Structured opportunity management. Output: JSON to stdout. Errors to stderr, exit 1.

import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { createDecipheriv, pbkdf2Sync } from "crypto";

const HOME = process.env.HOME || "/home/hybridz";
const BASE_DIR = join(HOME, ".zeroclaw/workspace/postulaciones");
const BW_SESSION_FILE = join(HOME, ".zeroclaw/workspace/.bw-session");
const COOKIES_DIR = join(HOME, ".zeroclaw/workspace/form-filler-cookies");
const KIRO_PROFILE = join(HOME, ".zeroclaw/browser/kiro/user-data");
const LEARNED_RESPONSES = "/etc/nixos/zeroclaw/reference/learned-responses.md";

// --- Types ---

interface Meta {
  slug: string;
  url: string;
  type: "job" | "scholarship" | "grant" | "fellowship" | "program";
  status: string;
  deadline: string | null;
  created: string;
}

interface Question {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "multi-select" | "checkbox" | "file" | "number" | "date";
  required: boolean;
  max_length: number | null;
  options: string[] | null;
  bucket: "auto" | "draft" | "user-input" | null;
  section: string | null;
}

interface Answers {
  [qid: string]: {
    draft: string | null;
    final: string | null;
  };
}

// --- Helpers ---

function err(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ error: message, ...details }));
  process.exit(1);
}

function ok(data: Record<string, unknown>) {
  console.log(JSON.stringify({ ok: true, ...data }));
}

function oppDir(slug: string): string {
  return join(BASE_DIR, slug);
}

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8"));
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

function slugify(url: string): string {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);
    const skip = new Set(["apply", "jobs", "careers", "posting", "opportunities", "application", "form", "register"]);
    const meaningful = pathParts.filter(p => !skip.has(p.toLowerCase()));
    const base = meaningful.length > 0 ? meaningful.join("-") : "form";
    const host = u.hostname.replace(/^www\./, "").replace(/\./g, "-");
    const hash = Math.abs(
      Array.from(new TextEncoder().encode(url)).reduce((a, b) => ((a << 5) - a + b) | 0, 0)
    ).toString(36).slice(0, 5);
    return `${host}-${base}-${hash}`.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 60);
  } catch {
    return `form-${Date.now()}`;
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ["extracting"],
  extracting: ["researching", "created"],
  researching: ["strategizing"],
  strategizing: ["drafting"],
  drafting: ["reviewing", "drafting"],
  reviewing: ["drafting", "ready"],
  ready: ["submitted", "drafting"],
  submitted: [],
};

function parseArgs(args: string[]): { command: string; subcommand: string; rest: string[]; flags: Record<string, string> } {
  const command = args[0] || "help";
  const subcommand = (args[1] && !args[1].startsWith("--")) ? args[1] : "";
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  const start = subcommand ? 2 : 1;
  for (let i = start; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      if (args[i + 1] && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      rest.push(args[i]);
    }
  }
  return { command, subcommand, rest, flags };
}

async function run(cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// --- Init ---

async function init(url: string, type: string, deadline: string | null) {
  await ensureDir(BASE_DIR);
  const existing = await readdir(BASE_DIR);
  for (const dir of existing) {
    const metaPath = join(BASE_DIR, dir, "meta.json");
    if (existsSync(metaPath)) {
      const meta = await readJson<Meta>(metaPath);
      if (meta.url === url) {
        err(`Opportunity already exists: ${meta.slug}`, {
          slug: meta.slug,
          status: meta.status,
          hint: `Use 'show ${meta.slug}' to see it`,
        });
      }
    }
  }

  const slug = slugify(url);
  const dir = oppDir(slug);
  await ensureDir(dir);

  const meta: Meta = {
    slug,
    url,
    type: (type as Meta["type"]) || "job",
    status: "created",
    deadline: deadline || null,
    created: new Date().toISOString(),
  };

  await writeJson(join(dir, "meta.json"), meta);
  await writeJson(join(dir, "questions.json"), []);
  await writeJson(join(dir, "answers.json"), {});

  ok({ slug, dir, url, type: meta.type });
}

// --- List ---

async function list() {
  await ensureDir(BASE_DIR);
  const dirs = await readdir(BASE_DIR);
  const opportunities: Array<Meta & { questions: number; drafted: number; finalized: number }> = [];

  for (const dir of dirs) {
    const metaPath = join(BASE_DIR, dir, "meta.json");
    if (!existsSync(metaPath)) continue;
    const meta = await readJson<Meta>(metaPath);
    const qPath = join(BASE_DIR, dir, "questions.json");
    const aPath = join(BASE_DIR, dir, "answers.json");
    let qCount = 0, drafted = 0, finalized = 0;
    if (existsSync(qPath)) qCount = (await readJson<Question[]>(qPath)).length;
    if (existsSync(aPath)) {
      const answers = await readJson<Answers>(aPath);
      drafted = Object.values(answers).filter(a => a.draft).length;
      finalized = Object.values(answers).filter(a => a.final).length;
    }
    opportunities.push({ ...meta, questions: qCount, drafted, finalized });
  }

  ok({ count: opportunities.length, opportunities });
}

// --- Show ---

async function show(slug: string) {
  const dir = oppDir(slug);
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) err(`Not found: ${slug}`);

  const meta = await readJson<Meta>(metaPath);
  const questions = existsSync(join(dir, "questions.json"))
    ? await readJson<Question[]>(join(dir, "questions.json"))
    : [];
  const answers = existsSync(join(dir, "answers.json"))
    ? await readJson<Answers>(join(dir, "answers.json"))
    : {};

  const files: Record<string, boolean | number> = {
    research_raw: existsSync(join(dir, "research-raw.md")),
    research: existsSync(join(dir, "research.md")),
    strategy: existsSync(join(dir, "strategy.md")),
  };
  if (existsSync(dir)) {
    files.reviews = (await readdir(dir)).filter(f => f.startsWith("review-")).length;
  }

  ok({ ...meta, dir, questions, answers, files });
}

// --- Status ---

async function status(slug: string, newStatus: string) {
  const dir = oppDir(slug);
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) err(`Not found: ${slug}`);

  const meta = await readJson<Meta>(metaPath);
  const allowed = VALID_TRANSITIONS[meta.status];
  if (allowed && !allowed.includes(newStatus)) {
    err(`Cannot go from '${meta.status}' to '${newStatus}'`, { allowed });
  }

  const previous = meta.status;
  meta.status = newStatus;
  await writeJson(metaPath, meta);
  ok({ slug, status: newStatus, previous });
}

// --- Questions ---

async function questionsAdd(slug: string, flags: Record<string, string>) {
  const dir = oppDir(slug);
  const qPath = join(dir, "questions.json");
  if (!existsSync(qPath)) err(`Not found: ${slug}`);
  if (!flags.label) err("--label is required");

  const questions = await readJson<Question[]>(qPath);
  const id = `q${questions.length + 1}`;
  const question: Question = {
    id,
    label: flags.label,
    type: (flags.type as Question["type"]) || "text",
    required: flags.required === "true",
    max_length: flags["max-length"] ? parseInt(flags["max-length"]) : null,
    options: flags.options ? flags.options.split("|") : null,
    bucket: null,
    section: flags.section || null,
  };

  questions.push(question);
  await writeJson(qPath, questions);
  ok({ slug, question, total: questions.length });
}

async function questionsBatch(slug: string, json: string) {
  const dir = oppDir(slug);
  const qPath = join(dir, "questions.json");
  if (!existsSync(qPath)) err(`Not found: ${slug}`);

  let input: Array<Partial<Question>>;
  try {
    input = JSON.parse(json);
  } catch {
    err("Invalid JSON");
  }

  const questions = await readJson<Question[]>(qPath);
  let added = 0;

  for (const q of input) {
    if (!q.label) continue;
    const id = `q${questions.length + 1}`;
    questions.push({
      id,
      label: q.label,
      type: q.type || "text",
      required: q.required ?? false,
      max_length: q.max_length ?? null,
      options: q.options ?? null,
      bucket: q.bucket ?? null,
      section: q.section ?? null,
    });
    added++;
  }

  await writeJson(qPath, questions);
  ok({ slug, added, total: questions.length });
}

async function questionsList(slug: string) {
  const dir = oppDir(slug);
  const qPath = join(dir, "questions.json");
  if (!existsSync(qPath)) err(`Not found: ${slug}`);

  const questions = await readJson<Question[]>(qPath);
  ok({ slug, count: questions.length, questions });
}

async function questionsTriage(slug: string, qid: string, bucket: string) {
  const dir = oppDir(slug);
  const qPath = join(dir, "questions.json");
  if (!existsSync(qPath)) err(`Not found: ${slug}`);
  if (!["auto", "draft", "user-input"].includes(bucket)) {
    err(`Invalid bucket: ${bucket}`, { valid: ["auto", "draft", "user-input"] });
  }

  const questions = await readJson<Question[]>(qPath);
  const q = questions.find(q => q.id === qid);
  if (!q) err(`Question not found: ${qid}`);
  q.bucket = bucket as Question["bucket"];
  await writeJson(qPath, questions);
  ok({ slug, qid, bucket });
}

// --- Answers ---

async function answerSet(slug: string, qid: string, flags: Record<string, string>) {
  const dir = oppDir(slug);
  const aPath = join(dir, "answers.json");
  if (!existsSync(aPath)) err(`Not found: ${slug}`);

  const qPath = join(dir, "questions.json");
  const questions = await readJson<Question[]>(qPath);
  if (!questions.find(q => q.id === qid)) err(`Question not found: ${qid}`);

  let draftText = flags.draft ?? null;
  let finalText = flags.final ?? null;

  if (flags["draft-file"]) {
    if (!existsSync(flags["draft-file"])) err(`File not found: ${flags["draft-file"]}`);
    draftText = (await readFile(flags["draft-file"], "utf-8")).trim();
  }
  if (flags["final-file"]) {
    if (!existsSync(flags["final-file"])) err(`File not found: ${flags["final-file"]}`);
    finalText = (await readFile(flags["final-file"], "utf-8")).trim();
  }

  if (!draftText && !finalText) err("Provide --draft, --final, --draft-file, or --final-file");

  const answers = await readJson<Answers>(aPath);
  if (!answers[qid]) answers[qid] = { draft: null, final: null };
  if (draftText) answers[qid].draft = draftText;
  if (finalText) answers[qid].final = finalText;

  await writeJson(aPath, answers);
  ok({ slug, qid, answer: answers[qid] });
}

async function answersList(slug: string) {
  const dir = oppDir(slug);
  const aPath = join(dir, "answers.json");
  if (!existsSync(aPath)) err(`Not found: ${slug}`);

  const answers = await readJson<Answers>(aPath);
  const questions = await readJson<Question[]>(join(dir, "questions.json"));

  const merged = questions.map(q => ({
    ...q,
    draft: answers[q.id]?.draft || null,
    final: answers[q.id]?.final || null,
  }));

  const stats = {
    total: questions.length,
    drafted: Object.values(answers).filter(a => a.draft).length,
    finalized: Object.values(answers).filter(a => a.final).length,
    missing: questions.length - Object.values(answers).filter(a => a.draft || a.final).length,
  };

  ok({ slug, stats, questions: merged });
}

// --- Report ---

async function report(slug: string) {
  const dir = oppDir(slug);
  if (!existsSync(join(dir, "meta.json"))) err(`Not found: ${slug}`);

  const meta = await readJson<Meta>(join(dir, "meta.json"));
  const questions = await readJson<Question[]>(join(dir, "questions.json"));
  const answers = await readJson<Answers>(join(dir, "answers.json"));

  let md = `# ${slug}\n\n`;
  md += `**URL:** ${meta.url}\n`;
  md += `**Type:** ${meta.type}\n`;
  md += `**Status:** ${meta.status}\n`;
  if (meta.deadline) md += `**Deadline:** ${meta.deadline}\n`;
  md += `\n---\n\n`;

  // Include research summary if available
  const researchPath = join(dir, "research.md");
  if (existsSync(researchPath)) {
    const research = await readFile(researchPath, "utf-8");
    // Extract just the Kill Shot section for the report header
    const killMatch = research.match(/## Kill Shot\n+([\s\S]*?)(?=\n## |\n---|\Z)/);
    if (killMatch) {
      md += `## Angle\n\n${killMatch[1].trim()}\n\n---\n\n`;
    }
  }

  const warnings: string[] = [];

  for (const q of questions) {
    const a = answers[q.id];
    const answer = a?.final || a?.draft;

    md += `### ${q.id}: ${q.label}\n`;
    const meta_parts: string[] = [];
    if (q.required) meta_parts.push("required");
    if (q.max_length) meta_parts.push(`max ${q.max_length} chars`);
    if (q.type !== "text" && q.type !== "textarea") meta_parts.push(q.type);
    if (meta_parts.length) md += `*${meta_parts.join(", ")}*\n`;
    md += `\n`;

    if (answer) {
      md += `${answer}\n\n`;
      if (q.max_length && answer.length > q.max_length) {
        warnings.push(`${q.id}: ${answer.length} chars exceeds max ${q.max_length}`);
      }
      if (!a?.final) {
        warnings.push(`${q.id}: DRAFT only (not finalized)`);
      }
    } else {
      warnings.push(`${q.id}: NO ANSWER${q.required ? " (REQUIRED)" : ""}`);
      md += `[no answer]\n\n`;
    }
  }

  if (warnings.length) {
    md += `---\n\n## Warnings\n\n`;
    for (const w of warnings) md += `- ${w}\n`;
  }

  const reportPath = join(dir, "final-report.md");
  await writeFile(reportPath, md, "utf-8");
  ok({ slug, file: reportPath, question_count: questions.length, warnings });
}

// --- Auth ---

async function getBwSession(): Promise<string> {
  if (process.env.BW_SESSION) return process.env.BW_SESSION;
  if (existsSync(BW_SESSION_FILE)) {
    const token = (await readFile(BW_SESSION_FILE, "utf-8")).trim();
    if (token) return token;
  }
  err("Bitwarden vault locked", { fix: `bw unlock --raw > ${BW_SESSION_FILE}` });
}

async function login(url: string) {
  const session = await getBwSession();
  const slug = slugify(url);
  const { stdout, exitCode, stderr } = await run(["bw", "list", "items", "--url", url, "--session", session]);

  if (exitCode !== 0) {
    if (stderr.includes("locked") || stderr.includes("Invalid master password")) {
      err("Bitwarden vault is locked", { fix: `bw unlock --raw > ${BW_SESSION_FILE}` });
    }
    err(`bw list failed: ${stderr}`);
  }

  let items: Array<{ id: string; name: string; login?: { username?: string; password?: string; totp?: string } }>;
  try { items = JSON.parse(stdout); } catch { err("Failed to parse bw output"); }
  if (!items.length) err(`No credentials for: ${url}`, { hint: "Add login in Bitwarden" });

  const item = items[0];
  const username = item.login?.username;
  const password = item.login?.password;
  if (!username || !password) err(`"${item.name}" missing username or password`);

  let totp: string | undefined;
  let hasTotp = false;
  if (item.login?.totp) {
    const r = await run(["bw", "get", "totp", item.id, "--session", session]);
    if (r.exitCode === 0 && r.stdout) { totp = r.stdout; hasTotp = true; }
  }

  ok({ slug, username, password, has_totp: hasTotp, ...(totp ? { totp } : {}), bw_item: item.name });
}

// --- Cookies ---

const HMAC_PREFIX_LEN = 32; // Chrome prepends 32-byte HMAC to plaintext before encrypting

function deriveV10Key(password: string | Buffer): Buffer {
  return pbkdf2Sync(password, "saltysalt", 1, 16, "sha1");
}

function tryDecryptV10(payload: Buffer, key: Buffer): string | null {
  const iv = Buffer.alloc(16, 0x20); // 16 spaces
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const dec = Buffer.concat([decipher.update(payload), decipher.final()]);
    return dec.subarray(HMAC_PREFIX_LEN).toString("utf-8");
  } catch {
    return null;
  }
}

function findSecretTool(): string | null {
  // Try PATH first, then known nix locations
  for (const candidate of ["secret-tool"]) {
    const r = Bun.spawnSync(["which", candidate], { stdout: "pipe", stderr: "pipe" });
    if (r.exitCode === 0) return candidate;
  }
  // Search nix store for libsecret
  const r = Bun.spawnSync(["bash", "-c", "ls /nix/store/*-libsecret-*/bin/secret-tool 2>/dev/null | head -1"], { stdout: "pipe", stderr: "pipe" });
  const path = new TextDecoder().decode(r.stdout).trim();
  if (path && existsSync(path)) return path;
  return null;
}

let _secretToolPath: string | null | undefined;
function getKeyringPassword(app: string): string | null {
  if (_secretToolPath === undefined) _secretToolPath = findSecretTool();
  if (!_secretToolPath) return null;

  try {
    const r = Bun.spawnSync([_secretToolPath, "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2", "application", app], { stdout: "pipe", stderr: "pipe" });
    if (r.exitCode === 0) {
      const pwd = new TextDecoder().decode(r.stdout).trim();
      if (pwd) return pwd;
    }
  } catch { /* secret-tool not available */ }
  return null;
}

// Cache keyring keys to avoid repeated secret-tool calls
let _keyringKeys: Buffer[] | null = null;
function getKeyringKeys(): Buffer[] {
  if (_keyringKeys) return _keyringKeys;
  _keyringKeys = [];
  for (const app of ["brave", "chrome", "chromium"]) {
    const pwd = getKeyringPassword(app);
    if (pwd) _keyringKeys.push(deriveV10Key(pwd));
  }
  return _keyringKeys;
}

function decryptCookie(encrypted: Buffer): string | null {
  const prefix = encrypted.subarray(0, 3).toString();
  const payload = encrypted.subarray(3);

  if (prefix === "v10") {
    // v10: try "peanuts" first (headless --password-store=basic), then keyring keys
    const val = tryDecryptV10(payload, deriveV10Key("peanuts"));
    if (val !== null) return val;
    for (const key of getKeyringKeys()) {
      const result = tryDecryptV10(payload, key);
      if (result !== null) return result;
    }
  } else if (prefix === "v11") {
    // v11: keyring-encrypted only (Brave/Chrome GUI on Linux)
    for (const key of getKeyringKeys()) {
      const result = tryDecryptV10(payload, key);
      if (result !== null) return result;
    }
  }

  return null;
}

interface BraveCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  expires: number;
}

function readBraveCookies(profileDir: string, domain?: string): BraveCookie[] {
  const cookieDb = join(profileDir, "Default", "Cookies");
  if (!existsSync(cookieDb)) err(`Cookie DB not found: ${cookieDb}`);

  const db = new Database(cookieDb, { readonly: true });
  let query = "SELECT host_key, name, encrypted_value, path, is_httponly, is_secure, samesite, expires_utc FROM cookies";
  const params: string[] = [];
  if (domain) {
    query += " WHERE (host_key = ? OR host_key = ? OR host_key LIKE ?)";
    params.push(domain, `.${domain}`, `%.${domain}`);
  }

  const rows = db.query(query).all(...params) as Array<{
    host_key: string; name: string; encrypted_value: Buffer;
    path: string; is_httponly: number; is_secure: number;
    samesite: number; expires_utc: number;
  }>;
  db.close();

  const sameSiteMap: Record<number, string> = { [-1]: "None", 0: "None", 1: "Lax", 2: "Strict" };
  const cookies: BraveCookie[] = [];

  for (const row of rows) {
    const enc = Buffer.from(row.encrypted_value);
    let value = "";
    const prefix = enc.length > 3 ? enc.subarray(0, 3).toString() : "";
    if (prefix === "v10" || prefix === "v11") {
      const decrypted = decryptCookie(enc);
      if (!decrypted) continue; // skip undecryptable cookies
      value = decrypted;
    } else if (enc.length > 0) {
      value = enc.toString("utf-8");
    } else {
      continue;
    }

    // Chrome stores expires_utc as microseconds since 1601-01-01
    // Convert to Unix timestamp (seconds since 1970-01-01)
    const chromeEpochOffset = 11644473600n;
    const expiresUnix = row.expires_utc > 0
      ? Number(BigInt(row.expires_utc) / 1000000n - chromeEpochOffset)
      : 0;

    cookies.push({
      name: row.name,
      value,
      domain: row.host_key,
      path: row.path,
      httpOnly: row.is_httponly === 1,
      secure: row.is_secure === 1,
      sameSite: sameSiteMap[row.samesite] || "None",
      expires: expiresUnix,
    });
  }

  return cookies;
}

async function cookiesBridge(domain?: string) {
  const pgrep = await run(["pgrep", "-f", `class=kiro-browser`]);
  if (pgrep.exitCode === 0 && pgrep.stdout) {
    err("kiro-browser still running — close it first");
  }

  const cookies = readBraveCookies(KIRO_PROFILE, domain);
  if (!cookies.length) err("No cookies found" + (domain ? ` for: ${domain}` : ""));

  let imported = 0;
  const domains = new Set<string>();

  for (const cookie of cookies) {
    const url = `http${cookie.secure ? "s" : ""}://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
    const args = ["agent-browser", "cookies", "set", cookie.name, cookie.value, "--url", url];
    if (cookie.httpOnly) args.push("--httpOnly");
    if (cookie.secure) args.push("--secure");
    if (cookie.sameSite) args.push("--sameSite", cookie.sameSite);
    if (cookie.expires > 0) args.push("--expires", String(cookie.expires));
    const r = await run(args);
    if (r.exitCode === 0) { imported++; domains.add(cookie.domain.replace(/^\./, "")); }
    else { console.error(JSON.stringify({ warn: "cookie_set_failed", name: cookie.name, domain: cookie.domain, error: r.stderr.replace(/\x1b\[[0-9;]*m/g, "").trim() })); }
  }

  await ensureDir(COOKIES_DIR);
  const exportFile = join(COOKIES_DIR, `${domain || "all"}-${Date.now()}.json`);
  const safeExport = cookies.map(c => ({ ...c, value: c.value.slice(0, 8) + "..." }));
  await writeFile(exportFile, JSON.stringify(safeExport, null, 2), "utf-8");
  ok({ imported, total: cookies.length, domains: [...domains], export_file: exportFile });
}

async function cookiesCdp(port: string = "9222") {
  // Verify kiro-browser is running with remote debugging
  const check = await run(["curl", "-s", `http://127.0.0.1:${port}/json/version`]);
  if (check.exitCode !== 0 || !check.stdout.includes("Browser")) {
    err("kiro-browser not reachable on CDP port", { port, fix: "Run: kiro-browser" });
  }

  // List available pages
  const list = await run(["curl", "-s", `http://127.0.0.1:${port}/json/list`]);
  let pages: Array<{ title: string; url: string; webSocketDebuggerUrl: string; type: string }> = [];
  try { pages = JSON.parse(list.stdout).filter((p: { type: string }) => p.type === "page"); } catch {}

  ok({
    message: "kiro-browser reachable via CDP",
    port,
    pages: pages.map(p => ({ title: p.title, url: p.url.slice(0, 100) })),
    hint: "Use 'form_filler cdp-extract <slug> <url>' to extract form data from the open tab",
  });
}

// --- CDP Direct ---

function cdpEval(wsUrl: string, expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => { ws.close(); reject(new Error("CDP timeout")); }, 10000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    });
    ws.addEventListener("message", (ev) => {
      const data = JSON.parse(ev.data as string);
      if (data.id === 1) {
        clearTimeout(timeout);
        ws.close();
        if (data.result?.exceptionDetails) reject(new Error(data.result.exceptionDetails.text));
        else resolve(data.result?.result?.value);
      }
    });
    ws.addEventListener("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

async function findCdpPage(port: string, urlMatch: string): Promise<string> {
  const { stdout, exitCode } = await run(["curl", "-s", `http://127.0.0.1:${port}/json/list`]);
  if (exitCode !== 0) err("kiro-browser not reachable on CDP port", { port, fix: "Run: kiro-browser" });

  let pages: Array<{ url: string; webSocketDebuggerUrl: string; type: string }>;
  try { pages = JSON.parse(stdout); } catch { err("Failed to parse CDP page list"); }

  const match = pages.find(p => p.type === "page" && p.url.includes(urlMatch));
  if (!match) {
    err(`No tab found matching "${urlMatch}"`, {
      open_tabs: pages.filter(p => p.type === "page").map(p => p.url.slice(0, 80)),
      hint: "Open the URL in kiro-browser first",
    });
  }
  return match.webSocketDebuggerUrl;
}

const GFORM_TYPE_MAP: Record<number, Question["type"]> = {
  0: "text", 1: "textarea", 2: "select", 3: "select", 4: "multi-select",
  5: "select", 6: "select", 7: "textarea", 9: "date", 10: "date",
};

async function cdpExtract(slug: string, url: string, port: string = "9222") {
  const dir = oppDir(slug);
  if (!existsSync(join(dir, "meta.json"))) err(`Not found: ${slug}`);

  // Find the tab with this URL
  const wsUrl = await findCdpPage(port, url);

  // Navigate to the URL in the existing tab (in case it's a different page)
  await cdpEval(wsUrl, `if (!window.location.href.includes("${url.replace(/"/g, '\\"').slice(0, 60)}")) window.location.href = "${url.replace(/"/g, '\\"')}"`);

  // Wait a moment for any navigation
  await new Promise(r => setTimeout(r, 1000));

  // Extract FB_PUBLIC_LOAD_DATA_
  const raw = await cdpEval(wsUrl, "JSON.stringify(FB_PUBLIC_LOAD_DATA_)") as string;
  if (!raw) err("FB_PUBLIC_LOAD_DATA_ not found — is this a Google Form?");

  const data = JSON.parse(raw);
  const formTitle = data[1]?.[8] || "Unknown form";
  const items = data[1]?.[1] || [];

  const questions: Question[] = [];
  let currentSection: string | null = null;

  for (const item of items) {
    const label = item[1] as string;
    const qData = item[4];

    if (!qData) {
      // Section header
      currentSection = label;
      continue;
    }

    const entryId = qData[0]?.[0];
    const typeCode = qData[0]?.[3] ?? 0;
    const required = qData[0]?.[2] === 1;
    const options = qData[0]?.[1]?.map((o: string[]) => o[0]).filter(Boolean) || null;

    const id = `q${questions.length + 1}`;
    questions.push({
      id,
      label,
      type: GFORM_TYPE_MAP[typeCode] || "text",
      required,
      max_length: null,
      options: options?.length ? options : null,
      bucket: null,
      section: currentSection,
    });

    // Store the Google Form entry ID for later submission
    (questions[questions.length - 1] as Question & { entry_id?: number }).entry_id = entryId;
  }

  await writeJson(join(dir, "questions.json"), questions);

  ok({ slug, form_title: formTitle, questions_extracted: questions.length, sections: [...new Set(questions.map(q => q.section).filter(Boolean))] });
}

async function cookiesClear() {
  const { exitCode, stderr } = await run(["agent-browser", "cookies", "clear"]);
  if (exitCode !== 0) err(`Failed to clear cookies: ${stderr}`);
  ok({ message: "Cookies cleared" });
}

// --- Evolve ---

async function evolve(slug: string) {
  const dir = oppDir(slug);
  if (!existsSync(join(dir, "meta.json"))) err(`Not found: ${slug}`);

  const meta = await readJson<Meta>(join(dir, "meta.json"));
  const questions = await readJson<Question[]>(join(dir, "questions.json"));
  const answers = await readJson<Answers>(join(dir, "answers.json"));

  // Read existing learned-responses to check for dupes
  let existing = "";
  if (existsSync(LEARNED_RESPONSES)) {
    existing = await readFile(LEARNED_RESPONSES, "utf-8");
  }

  const today = new Date().toISOString().slice(0, 10);
  const entries: Array<{ qid: string; label: string; bucket: string; answer: string }> = [];
  let appended = 0;

  for (const q of questions) {
    const a = answers[q.id];
    const finalAnswer = a?.final;
    if (!finalAnswer) continue;
    if (q.bucket !== "user-input" && q.bucket !== "draft") continue;

    // Dedup: skip if slug+question combo already exists
    const dedupMarker = `slug: ${slug}`;
    const dedupQuestion = `**Q:** ${q.label}`;
    if (existing.includes(dedupMarker) && existing.includes(dedupQuestion)) continue;

    const entry = `\n<!-- slug: ${slug} | date: ${today} | type: ${meta.type} | bucket: ${q.bucket} -->\n\n**Q:** ${q.label}\n\n**A:** ${finalAnswer}\n\n---\n`;

    existing += entry;
    entries.push({ qid: q.id, label: q.label, bucket: q.bucket!, answer: finalAnswer });
    appended++;
  }

  if (appended > 0) {
    await writeFile(LEARNED_RESPONSES, existing, "utf-8");
  }

  ok({ slug, appended, entries: entries.map(e => ({ qid: e.qid, label: e.label, bucket: e.bucket })) });
}

// --- Main ---

const USAGE = `form-filler v0.2.0 — Opportunity form management

Opportunity:
  init <url> [--type T] [--deadline D]    Create opportunity (T: job|scholarship|grant|fellowship|program)
  list                                     List all opportunities
  show <slug>                              Full state + file inventory
  status <slug> <new-status>               Transition status

Questions:
  questions <slug> add --label "..." [--type T] [--required] [--max-length N] [--options "a|b|c"] [--section S]
  questions <slug> batch '<json-array>'    Batch add questions
  questions <slug> list                    List extracted questions
  questions <slug> triage <qid> <bucket>   Classify: auto | draft | user-input

Answers:
  answers <slug> set <qid> --draft "..."   Set draft answer
  answers <slug> set <qid> --final "..."   Set final answer
  answers <slug> set <qid> --draft-file F  Draft from file (for long answers)
  answers <slug> set <qid> --final-file F  Final from file
  answers <slug> list                      Questions + answers + stats

Report:
  report <slug>                            Compile final report

Evolution:
  evolve <slug>                            Save novel answers to learned-responses.md

Extract (CDP):
  cdp-extract <slug> <url> [--port P]     Extract Google Form questions via kiro-browser CDP (default: 9222)
  cookies cdp [--port P]                   Check kiro-browser CDP connection & list open tabs
  cookies bridge [--domain D]              Import kiro-browser cookies (for non-OAuth sites)
  cookies clear                            Clear agent-browser cookies

Auth:
  login <url>                              Bitwarden credential lookup
`;

async function main() {
  const { command, subcommand, rest, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "help": case "--help": case "-h":
      console.log(USAGE);
      break;

    case "init":
      if (!subcommand && !rest[0]) err("URL required");
      await init(subcommand || rest[0], flags.type || "job", flags.deadline || null);
      break;

    case "list":
      await list();
      break;

    case "show":
      if (!subcommand) err("Slug required");
      await show(subcommand);
      break;

    case "status":
      if (!subcommand || !rest[0]) err("Usage: status <slug> <new-status>");
      await status(subcommand, rest[0]);
      break;

    case "questions": {
      if (!subcommand) err("Slug required");
      const action = rest[0];
      if (action === "add") await questionsAdd(subcommand, flags);
      else if (action === "batch") {
        if (!rest[1]) err("JSON array required");
        await questionsBatch(subcommand, rest[1]);
      }
      else if (action === "list") await questionsList(subcommand);
      else if (action === "triage") {
        if (!rest[1] || !rest[2]) err("Usage: questions <slug> triage <qid> <bucket>");
        await questionsTriage(subcommand, rest[1], rest[2]);
      }
      else err(`Unknown action: ${action}`, { valid: ["add", "batch", "list", "triage"] });
      break;
    }

    case "answers": {
      if (!subcommand) err("Slug required");
      const action = rest[0];
      if (action === "set") {
        if (!rest[1]) err("Question ID required");
        await answerSet(subcommand, rest[1], flags);
      }
      else if (action === "list") await answersList(subcommand);
      else err(`Unknown action: ${action}`, { valid: ["set", "list"] });
      break;
    }

    case "report":
      if (!subcommand) err("Slug required");
      await report(subcommand);
      break;

    case "evolve":
      if (!subcommand) err("Slug required");
      await evolve(subcommand);
      break;

    case "login":
      if (!subcommand && !rest[0]) err("URL required");
      await login(subcommand || rest[0]);
      break;

    case "cdp-extract":
      if (!subcommand || !rest[0]) err("Usage: cdp-extract <slug> <url> [--port P]");
      await cdpExtract(subcommand, rest[0], flags.port || "9222");
      break;

    case "cookies":
      if (subcommand === "bridge") await cookiesBridge(flags.domain);
      else if (subcommand === "cdp") await cookiesCdp(flags.port || "9222");
      else if (subcommand === "clear") await cookiesClear();
      else err(`Unknown: ${subcommand || "(none)"}`, { valid: ["bridge", "cdp", "clear"] });
      break;

    default:
      err(`Unknown command: ${command}`);
  }
}

main();
