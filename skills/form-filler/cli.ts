#!/usr/bin/env bun
// cli.ts — form-filler CLI
// Output: JSON to stdout. Errors to stderr, exit 1.

import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const HOME = process.env.HOME || "/home/hybridz";
const POSTULATIONS_DIR = join(HOME, ".zeroclaw/workspace/postulaciones");
const BW_SESSION_FILE = join(HOME, ".zeroclaw/workspace/.bw-session");
const COOKIES_DIR = join(HOME, ".zeroclaw/workspace/form-filler-cookies");
const KIRO_PROFILE = join(HOME, ".zeroclaw/browser/zeroclaw/user-data");

// --- Error helpers ---

function err(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ error: message, ...details }));
  process.exit(1);
}

async function ensureDir(dir: string = POSTULATIONS_DIR) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function slugify(url: string): string {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || "form";
    return `${u.hostname.replace(/\./g, "-")}-${lastPart.replace(/\.[^.]+$/, "")}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
  } catch {
    return `form-${Date.now()}`;
  }
}

function parseArgs(args: string[]): { command: string; subcommand: string; flags: Record<string, string>; positional: string[] } {
  const command = args[0] || "help";
  const subcommand = (args[1] && !args[1].startsWith("--")) ? args[1] : "";
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  const start = subcommand ? 2 : 1;
  for (let i = start; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      flags[key] = args[i + 1] || "true";
      if (args[i + 1] && !args[i + 1].startsWith("--")) i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { command, subcommand, flags, positional };
}

async function run(cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// --- Existing Commands ---

async function extract(url: string) {
  await ensureDir();
  const slug = slugify(url);
  const timestamp = new Date().toISOString();
  const filePath = join(POSTULATIONS_DIR, `${slug}.md`);

  const content = `# Postulación: ${slug}

**URL:** ${url}
**Extraído:** ${timestamp}
**Estado:** pendiente

---

## Preguntas

> (El agente llenará esta sección usando el browser tool)

---

## Respuestas Preparadas

> (Se generarán con \`form-filler prepare ${slug}\`)
`;

  await writeFile(filePath, content, "utf-8");

  console.log(JSON.stringify({
    ok: true,
    slug,
    file: filePath,
    url,
    message: `Archivo creado. El agente debe extraer las preguntas usando el browser tool y actualizar el archivo.`,
    instructions: [
      "1. Abrir browser con el URL",
      "2. Extraer TODAS las preguntas (usar respuestas temporales si es necesario para navegar)",
      "3. Actualizar el archivo MD con las preguntas",
      "4. Reportar a Enrique"
    ]
  }));
}

async function list() {
  await ensureDir();
  const files = await readdir(POSTULATIONS_DIR);
  const mdFiles = files.filter(f => f.endsWith(".md"));

  const postulaciones = await Promise.all(
    mdFiles.map(async f => {
      const content = await readFile(join(POSTULATIONS_DIR, f), "utf-8");
      const urlMatch = content.match(/\*\*URL:\*\* (.+)/);
      const estadoMatch = content.match(/\*\*Estado:\*\* (.+)/);
      return {
        slug: f.replace(".md", ""),
        url: urlMatch?.[1] || "N/A",
        estado: estadoMatch?.[1] || "desconocido"
      };
    })
  );

  console.log(JSON.stringify({ ok: true, count: postulaciones.length, postulaciones }));
}

async function show(slug: string) {
  const filePath = join(POSTULATIONS_DIR, `${slug}.md`);
  if (!existsSync(filePath)) {
    err(`Postulación no encontrada: ${slug}`);
  }
  const content = await readFile(filePath, "utf-8");
  console.log(JSON.stringify({ ok: true, slug, content, file: filePath }));
}

async function prepare(slug: string) {
  const filePath = join(POSTULATIONS_DIR, `${slug}.md`);
  if (!existsSync(filePath)) {
    err(`Postulación no encontrada: ${slug}`);
  }

  console.log(JSON.stringify({
    ok: true,
    slug,
    message: "Lanzar agente para preparar respuestas",
    instructions: [
      "1. Leer el archivo MD con las preguntas",
      "2. Usar perfil de Enrique para generar respuestas",
      "3. Actualizar el archivo MD con las respuestas",
      "4. Mostrar a Enrique para revisión - NO ENVIAR"
    ]
  }));
}

// --- Auth Commands ---

async function getBwSession(): Promise<string> {
  // 1. Check BW_SESSION env var
  if (process.env.BW_SESSION) return process.env.BW_SESSION;

  // 2. Check session file
  if (existsSync(BW_SESSION_FILE)) {
    const token = (await readFile(BW_SESSION_FILE, "utf-8")).trim();
    if (token) return token;
  }

  err("Bitwarden vault locked — no session found", {
    fix: `bw unlock --raw > ${BW_SESSION_FILE}`,
    hint: "Or export BW_SESSION=<token> in your environment"
  });
}

async function login(url: string) {
  const session = await getBwSession();
  const slug = slugify(url);

  // Find matching credentials
  const { stdout, exitCode, stderr } = await run([
    "bw", "list", "items", "--url", url, "--session", session
  ]);

  if (exitCode !== 0) {
    if (stderr.includes("locked") || stderr.includes("Invalid master password")) {
      err("Bitwarden vault is locked", {
        fix: `bw unlock --raw > ${BW_SESSION_FILE}`
      });
    }
    err(`bw list failed: ${stderr}`);
  }

  let items: Array<{
    id: string;
    name: string;
    login?: { username?: string; password?: string; totp?: string };
  }>;
  try {
    items = JSON.parse(stdout);
  } catch {
    err("Failed to parse bw output", { raw: stdout.slice(0, 200) });
  }

  if (!items.length) {
    err(`No credentials found in Bitwarden for: ${url}`, {
      hint: "Add the login in Bitwarden with this URL, then retry"
    });
  }

  const item = items[0];
  const username = item.login?.username;
  const password = item.login?.password;

  if (!username || !password) {
    err(`Credential "${item.name}" is missing username or password`);
  }

  // Check for TOTP
  let totp: string | undefined;
  let hasTotp = false;
  if (item.login?.totp) {
    const totpResult = await run(["bw", "get", "totp", item.id, "--session", session]);
    if (totpResult.exitCode === 0 && totpResult.stdout) {
      totp = totpResult.stdout;
      hasTotp = true;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    slug,
    username,
    password,
    has_totp: hasTotp,
    ...(totp ? { totp } : {}),
    bw_item: item.name,
    instructions: [
      "1. browser navigate to login URL",
      "2. browser snapshot -i (find username and password fields)",
      `3. browser fill @username "${username}"`,
      "4. browser fill @password with the password above",
      "5. browser snapshot -c (find submit button)",
      "6. browser click @submit",
      "7. browser snapshot -i (verify login succeeded)",
      "8. Proceed with form extraction"
    ]
  }));
}

// --- Cookie Commands ---

async function cookiesBridge(domain?: string) {
  // Check kiro-browser is not running
  const pgrep = await run(["pgrep", "-f", KIRO_PROFILE]);
  if (pgrep.exitCode === 0 && pgrep.stdout) {
    err("kiro-browser is still running — close it first to avoid cookie lock conflicts", {
      hint: "Close the kiro-browser window, then retry"
    });
  }

  // Export cookies from kiro-browser profile
  const getArgs = ["agent-browser", "--profile", KIRO_PROFILE, "cookies", "get", "--json"];
  const { stdout, exitCode, stderr } = await run(getArgs);

  if (exitCode !== 0) {
    err(`Failed to get cookies from kiro profile: ${stderr}`);
  }

  let cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    expires?: number;
  }>;
  try {
    cookies = JSON.parse(stdout);
  } catch {
    err("Failed to parse cookies JSON", { raw: stdout.slice(0, 200) });
  }

  // Filter by domain if specified
  if (domain) {
    cookies = cookies.filter(c =>
      c.domain === domain || c.domain === `.${domain}` || c.domain.endsWith(`.${domain}`)
    );
  }

  if (!cookies.length) {
    err("No cookies found" + (domain ? ` for domain: ${domain}` : ""), {
      hint: domain
        ? "Open kiro-browser, log into the site, close kiro-browser, then retry"
        : "Open kiro-browser, log into sites, close kiro-browser, then retry"
    });
  }

  // Inject each cookie into the main agent-browser session
  let imported = 0;
  const domains = new Set<string>();

  for (const cookie of cookies) {
    const setArgs = [
      "agent-browser", "cookies", "set",
      cookie.name, cookie.value,
      "--domain", cookie.domain
    ];
    if (cookie.path) setArgs.push("--path", cookie.path);
    if (cookie.httpOnly) setArgs.push("--httpOnly");
    if (cookie.secure) setArgs.push("--secure");
    if (cookie.sameSite) setArgs.push("--sameSite", cookie.sameSite);
    if (cookie.expires) setArgs.push("--expires", String(cookie.expires));

    const result = await run(setArgs);
    if (result.exitCode === 0) {
      imported++;
      domains.add(cookie.domain.replace(/^\./, ""));
    }
  }

  // Save export for reference
  await ensureDir(COOKIES_DIR);
  const exportFile = join(COOKIES_DIR, `${domain || "all"}-${Date.now()}.json`);
  await writeFile(exportFile, JSON.stringify(cookies, null, 2), "utf-8");

  console.log(JSON.stringify({
    ok: true,
    imported_count: imported,
    total_found: cookies.length,
    domains: [...domains],
    export_file: exportFile
  }));
}

async function cookiesClear() {
  const { exitCode, stderr } = await run(["agent-browser", "cookies", "clear"]);
  if (exitCode !== 0) {
    err(`Failed to clear cookies: ${stderr}`);
  }
  console.log(JSON.stringify({ ok: true, message: "All cookies cleared" }));
}

// --- Main ---

const USAGE = `Usage: form-filler <command> [args]

Commands:
  help                    Show this help
  extract <url>           Extrae preguntas de un form y crea archivo MD
  list                    Lista todas las postulaciones procesadas
  show <slug>             Muestra preguntas de una postulación
  prepare <slug>          Prepara respuestas (lanza agente)
  login <url>             Busca credenciales en Bitwarden y las guarda en auth vault
  cookies bridge          Importa cookies de kiro-browser al agent-browser
  cookies clear           Limpia todas las cookies del agent-browser

Examples:
  form-filler extract "https://forms.gle/abc123"
  form-filler list
  form-filler show google-form-abc123
  form-filler prepare google-form-abc123
  form-filler login "https://becas.example.com/login"
  form-filler cookies bridge --domain google.com
  form-filler cookies clear
`;

async function main() {
  const { command, subcommand, flags, positional } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;

    case "extract":
      if (!positional[0] && !subcommand) err("URL requerido", { usage: "form-filler extract <url>" });
      await extract(subcommand || positional[0]);
      break;

    case "list":
      await list();
      break;

    case "show":
      if (!subcommand && !positional[0]) err("Slug requerido", { usage: "form-filler show <slug>" });
      await show(subcommand || positional[0]);
      break;

    case "prepare":
      if (!subcommand && !positional[0]) err("Slug requerido", { usage: "form-filler prepare <slug>" });
      await prepare(subcommand || positional[0]);
      break;

    case "login":
      if (!subcommand && !positional[0]) err("URL requerido", { usage: "form-filler login <url>" });
      await login(subcommand || positional[0]);
      break;

    case "cookies":
      if (subcommand === "bridge") {
        await cookiesBridge(flags.domain);
      } else if (subcommand === "clear") {
        await cookiesClear();
      } else {
        err(`Unknown cookies subcommand: ${subcommand || "(none)"}`, {
          usage: "form-filler cookies <bridge|clear>"
        });
      }
      break;

    default:
      err(`Comando desconocido: ${command}`, { usage: USAGE });
  }
}

main();
