#!/usr/bin/env bun
/**
 * Unified calendar CLI for ZeroClaw
 * Wraps `gog calendar` for full Google Calendar control.
 *
 * Usage:
 *   cli.ts <command> [options]
 *
 * Commands:
 *   calendars, events, get, create, update, delete, search,
 *   freebusy, conflicts, rsvp, focus, ooo, batch
 *
 * Output: JSON on stdout, errors on stderr.
 */

import { $ } from "bun";
import { existsSync, readFileSync } from "fs";

// ─── Secrets ─────────────────────────────────────────────────────────────────

const envFile = "/run/secrets/rendered/zeroclaw.env";
if (existsSync(envFile)) {
  const content = readFileSync(envFile, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        process.env[key] = valueParts.join("=");
      }
    }
  }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { email: "enriquefft2001@gmail.com", label: "Personal" },
  { email: "enrique.flores@utec.edu.pe", label: "UTEC" },
];

function getAccount(email: string) {
  const acc = ACCOUNTS.find((a) => a.email === email);
  if (!acc)
    err(
      `Unknown account: ${email}. Known: ${ACCOUNTS.map((a) => a.email).join(", ")}`,
    );
  return acc;
}

function targetAccounts(email?: string) {
  if (email) return [getAccount(email)];
  return ACCOUNTS;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function err(msg: string): never {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { args, positional };
}

async function gog(cmdArgs: string[]): Promise<string> {
  const result = await $`gog calendar ${cmdArgs}`.quiet();
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    err(`gog calendar failed: ${stderr}`);
  }
  return result.stdout.toString().trim();
}

/** Like gog() but returns {ok, data} | {ok, error} instead of throwing. */
async function gogSafe(
  cmdArgs: string[],
): Promise<{ ok: true; data: string } | { ok: false; error: string; retryable: boolean }> {
  const result = await $`gog calendar ${cmdArgs}`.quiet();
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    const retryable = stderr.includes("rateLimitExceeded") || stderr.includes("429");
    return { ok: false, error: stderr, retryable };
  }
  return { ok: true, data: result.stdout.toString().trim() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    err(`Failed to parse gog output as JSON: ${raw.slice(0, 200)}`);
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function listCalendars(account: string): Promise<unknown> {
  const out = await gog([
    "calendars",
    "-a",
    account,
    "-j",
    "--results-only",
  ]);
  return parseJSON(out);
}

async function listEvents(
  account: string,
  calendar: string,
  from?: string,
  to?: string,
  max?: string,
  query?: string,
): Promise<unknown> {
  const cmd = ["events", calendar, "-a", account, "-j", "--results-only"];
  if (from) cmd.push("--from", from);
  if (to) cmd.push("--to", to);
  if (max) cmd.push("--max", max);
  if (query) cmd.push("--query", query);
  const out = await gog(cmd);
  return parseJSON(out);
}

async function getEvent(
  account: string,
  calendar: string,
  eventId: string,
): Promise<unknown> {
  const out = await gog(["event", calendar, eventId, "-a", account, "-j"]);
  return parseJSON(out);
}

async function createEvent(
  account: string,
  calendar: string,
  opts: Record<string, string | boolean>,
): Promise<unknown> {
  const cmd = ["create", calendar, "-a", account, "-j", "--no-input"];
  if (opts.summary) cmd.push("--summary", opts.summary as string);
  if (opts.from) cmd.push("--from", opts.from as string);
  if (opts.to) cmd.push("--to", opts.to as string);
  if (opts.description) cmd.push("--description", opts.description as string);
  if (opts.location) cmd.push("--location", opts.location as string);
  if (opts.attendees) cmd.push("--attendees", opts.attendees as string);
  if (opts["all-day"] === true) cmd.push("--all-day");
  if (opts.rrule) cmd.push("--rrule", opts.rrule as string);
  if (opts.reminder) cmd.push("--reminder", opts.reminder as string);
  if (opts.visibility) cmd.push("--visibility", opts.visibility as string);
  if (opts.transparency)
    cmd.push("--transparency", opts.transparency as string);
  if (opts["with-meet"] === true) cmd.push("--with-meet");
  if (opts["event-color"])
    cmd.push("--event-color", opts["event-color"] as string);
  if (opts["send-updates"])
    cmd.push("--send-updates", opts["send-updates"] as string);
  const out = await gog(cmd);
  return parseJSON(out);
}

async function updateEvent(
  account: string,
  calendar: string,
  eventId: string,
  opts: Record<string, string | boolean>,
): Promise<unknown> {
  const cmd = [
    "update",
    calendar,
    eventId,
    "-a",
    account,
    "-j",
    "--no-input",
  ];
  if (opts.summary !== undefined) cmd.push("--summary", opts.summary as string);
  if (opts.from) cmd.push("--from", opts.from as string);
  if (opts.to) cmd.push("--to", opts.to as string);
  if (opts.description !== undefined)
    cmd.push("--description", opts.description as string);
  if (opts.location !== undefined)
    cmd.push("--location", opts.location as string);
  if (opts.attendees) cmd.push("--attendees", opts.attendees as string);
  if (opts["add-attendee"])
    cmd.push("--add-attendee", opts["add-attendee"] as string);
  if (opts["all-day"] === true) cmd.push("--all-day");
  if (opts.rrule) cmd.push("--rrule", opts.rrule as string);
  if (opts.reminder) cmd.push("--reminder", opts.reminder as string);
  if (opts.visibility) cmd.push("--visibility", opts.visibility as string);
  if (opts.transparency)
    cmd.push("--transparency", opts.transparency as string);
  if (opts["event-color"])
    cmd.push("--event-color", opts["event-color"] as string);
  if (opts.scope) cmd.push("--scope", opts.scope as string);
  if (opts["original-start"])
    cmd.push("--original-start", opts["original-start"] as string);
  if (opts["send-updates"])
    cmd.push("--send-updates", opts["send-updates"] as string);
  const out = await gog(cmd);
  return parseJSON(out);
}

async function deleteEvent(
  account: string,
  calendar: string,
  eventId: string,
  scope?: string,
  sendUpdates?: string,
): Promise<unknown> {
  const cmd = [
    "delete",
    calendar,
    eventId,
    "-a",
    account,
    "-j",
    "-y",
  ];
  if (scope) cmd.push("--scope", scope);
  if (sendUpdates) cmd.push("--send-updates", sendUpdates);
  const out = await gog(cmd);
  if (!out) return { ok: true, action: "deleted", calendar, eventId };
  return parseJSON(out);
}

async function searchEvents(
  account: string,
  query: string,
  calendar?: string,
  from?: string,
  to?: string,
  max?: string,
): Promise<unknown> {
  const cmd = ["search", query, "-a", account, "-j", "--results-only"];
  if (calendar) cmd.push("--calendar", calendar);
  if (from) cmd.push("--from", from);
  if (to) cmd.push("--to", to);
  if (max) cmd.push("--max", max);
  const out = await gog(cmd);
  return parseJSON(out);
}

async function freeBusy(
  account: string,
  calendars: string,
  from: string,
  to: string,
): Promise<unknown> {
  const out = await gog([
    "freebusy",
    calendars,
    "-a",
    account,
    "-j",
    "--from",
    from,
    "--to",
    to,
  ]);
  return parseJSON(out);
}

async function findConflicts(
  account: string,
  from?: string,
  to?: string,
  calendars?: string,
): Promise<unknown> {
  const cmd = ["conflicts", "-a", account, "-j"];
  if (from) cmd.push("--from", from);
  if (to) cmd.push("--to", to);
  if (calendars) cmd.push("--calendars", calendars);
  const out = await gog(cmd);
  return parseJSON(out);
}

async function rsvp(
  account: string,
  calendar: string,
  eventId: string,
  status: string,
  comment?: string,
): Promise<unknown> {
  const cmd = [
    "respond",
    calendar,
    eventId,
    "-a",
    account,
    "-j",
    "--status",
    status,
  ];
  if (comment) cmd.push("--comment", comment);
  const out = await gog(cmd);
  if (!out)
    return { ok: true, action: "rsvp", calendar, eventId, status };
  return parseJSON(out);
}

async function focusTime(
  account: string,
  from: string,
  to: string,
  calendar?: string,
  summary?: string,
): Promise<unknown> {
  const cmd = ["focus-time", "-a", account, "-j", "--from", from, "--to", to];
  if (calendar) cmd.push(calendar);
  if (summary) cmd.push("--summary", summary);
  const out = await gog(cmd);
  return parseJSON(out);
}

async function outOfOffice(
  account: string,
  from: string,
  to: string,
  calendar?: string,
  summary?: string,
  allDay?: boolean,
): Promise<unknown> {
  const cmd = [
    "out-of-office",
    "-a",
    account,
    "-j",
    "--from",
    from,
    "--to",
    to,
  ];
  if (calendar) cmd.push(calendar);
  if (summary) cmd.push("--summary", summary);
  if (allDay) cmd.push("--all-day");
  const out = await gog(cmd);
  return parseJSON(out);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const { args, positional } = parseArgs(argv);
const cmd = positional[0];

if (!cmd)
  err(
    "No command. Use: calendars, events, get, create, update, delete, search, freebusy, conflicts, rsvp, focus, ooo, batch",
  );

const account = args.account as string | undefined;

switch (cmd) {
  // ─── calendars ───────────────────────────────────────────────────────────
  case "calendars": {
    const targets = targetAccounts(account);
    const results = await Promise.all(
      targets.map(async (a) => ({
        account: a.email,
        label: a.label,
        calendars: await listCalendars(a.email),
      })),
    );
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  // ─── events ──────────────────────────────────────────────────────────────
  case "events": {
    const calendar = (args.calendar as string) ?? "primary";
    const targets = targetAccounts(account);
    const results = await Promise.all(
      targets.map(async (a) => ({
        account: a.email,
        label: a.label,
        events: await listEvents(
          a.email,
          calendar,
          args.from as string,
          args.to as string,
          args.max as string,
          args.query as string,
        ),
      })),
    );
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  // ─── get ─────────────────────────────────────────────────────────────────
  case "get": {
    const calendar = positional[1];
    const eventId = positional[2];
    if (!calendar || !eventId) err("get requires: <calendarId> <eventId>");
    if (!account) err("get requires --account");
    const result = await getEvent(account, calendar, eventId);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── create ──────────────────────────────────────────────────────────────
  case "create": {
    if (!account) err("create requires --account");
    const calendar = (args.calendar as string) ?? "primary";
    if (!args.summary) err("create requires --summary");
    if (!args.from) err("create requires --from");
    if (!args.to) err("create requires --to");
    const result = await createEvent(account, calendar, args);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── update ──────────────────────────────────────────────────────────────
  case "update": {
    if (!account) err("update requires --account");
    const calendar = (args.calendar as string) ?? "primary";
    const eventId = args.event as string;
    if (!eventId) err("update requires --event <eventId>");
    const result = await updateEvent(account, calendar, eventId, args);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── delete ──────────────────────────────────────────────────────────────
  case "delete": {
    if (!account) err("delete requires --account");
    const calendar = (args.calendar as string) ?? "primary";
    const eventId = args.event as string;
    if (!eventId) err("delete requires --event <eventId>");
    const result = await deleteEvent(
      account,
      calendar,
      eventId,
      args.scope as string,
      args["send-updates"] as string,
    );
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── search ──────────────────────────────────────────────────────────────
  case "search": {
    const query = positional[1];
    if (!query) err("search requires a query");
    const targets = targetAccounts(account);
    const results = await Promise.all(
      targets.map(async (a) => ({
        account: a.email,
        label: a.label,
        results: await searchEvents(
          a.email,
          query,
          args.calendar as string,
          args.from as string,
          args.to as string,
          args.max as string,
        ),
      })),
    );
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  // ─── freebusy ────────────────────────────────────────────────────────────
  case "freebusy": {
    if (!account) err("freebusy requires --account");
    const calendars = args.calendars as string;
    if (!calendars) err("freebusy requires --calendars <id1,id2>");
    if (!args.from) err("freebusy requires --from");
    if (!args.to) err("freebusy requires --to");
    const result = await freeBusy(
      account,
      calendars,
      args.from as string,
      args.to as string,
    );
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── conflicts ───────────────────────────────────────────────────────────
  case "conflicts": {
    const targets = targetAccounts(account);
    const results = await Promise.all(
      targets.map(async (a) => ({
        account: a.email,
        label: a.label,
        conflicts: await findConflicts(
          a.email,
          args.from as string,
          args.to as string,
          args.calendars as string,
        ),
      })),
    );
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  // ─── rsvp ────────────────────────────────────────────────────────────────
  case "rsvp": {
    if (!account) err("rsvp requires --account");
    const calendar = (args.calendar as string) ?? "primary";
    const eventId = args.event as string;
    if (!eventId) err("rsvp requires --event <eventId>");
    const status = args.status as string;
    if (!status)
      err("rsvp requires --status (accepted|declined|tentative)");
    const result = await rsvp(
      account,
      calendar,
      eventId,
      status,
      args.comment as string,
    );
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── focus ───────────────────────────────────────────────────────────────
  case "focus": {
    if (!account) err("focus requires --account");
    if (!args.from) err("focus requires --from");
    if (!args.to) err("focus requires --to");
    const result = await focusTime(
      account,
      args.from as string,
      args.to as string,
      args.calendar as string,
      args.summary as string,
    );
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── ooo ─────────────────────────────────────────────────────────────────
  case "ooo": {
    if (!account) err("ooo requires --account");
    if (!args.from) err("ooo requires --from");
    if (!args.to) err("ooo requires --to");
    const result = await outOfOffice(
      account,
      args.from as string,
      args.to as string,
      args.calendar as string,
      args.summary as string,
      args["all-day"] === true,
    );
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── batch ───────────────────────────────────────────────────────────────
  case "batch": {
    // Reads a JSON array of operations from stdin, executes sequentially
    // with exponential backoff on rate limits. One tool call, N operations.
    //
    // Input (stdin): JSON array of operations, each with:
    //   { "op": "create"|"update"|"delete", "account": "...", ...args }
    //
    // Output: JSON array of results, one per operation:
    //   { "index": 0, "op": "update", "ok": true, "result": {...} }
    //   { "index": 1, "op": "create", "ok": false, "error": "..." }

    const input = await Bun.stdin.text();
    if (!input.trim()) err("batch requires JSON array on stdin");

    let ops: Record<string, unknown>[];
    try {
      ops = JSON.parse(input);
    } catch {
      err("batch: invalid JSON on stdin");
    }
    if (!Array.isArray(ops)) err("batch: stdin must be a JSON array");

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 2000;
    const results: Record<string, unknown>[] = [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const opType = op.op as string;
      const opAccount = op.account as string;
      const opCalendar = (op.calendar as string) ?? "primary";

      if (!opType) {
        results.push({ index: i, op: null, ok: false, error: "missing 'op' field" });
        continue;
      }
      if (!opAccount) {
        results.push({ index: i, op: opType, ok: false, error: "missing 'account' field" });
        continue;
      }

      let gogArgs: string[];
      try {
        switch (opType) {
          case "create": {
            gogArgs = ["create", opCalendar, "-a", opAccount, "-j", "--no-input"];
            for (const flag of ["summary", "from", "to", "description", "location", "attendees",
              "rrule", "reminder", "visibility", "transparency", "event-color", "send-updates"]) {
              if (op[flag]) gogArgs.push(`--${flag}`, op[flag] as string);
            }
            if (op["all-day"] === true) gogArgs.push("--all-day");
            if (op["with-meet"] === true) gogArgs.push("--with-meet");
            break;
          }
          case "update": {
            const eventId = op.event as string;
            if (!eventId) { results.push({ index: i, op: opType, ok: false, error: "missing 'event'" }); continue; }
            gogArgs = ["update", opCalendar, eventId, "-a", opAccount, "-j", "--no-input"];
            for (const flag of ["summary", "from", "to", "description", "location", "attendees",
              "add-attendee", "rrule", "reminder", "visibility", "transparency", "event-color",
              "scope", "original-start", "send-updates"]) {
              if (op[flag] !== undefined) gogArgs.push(`--${flag}`, op[flag] as string);
            }
            if (op["all-day"] === true) gogArgs.push("--all-day");
            break;
          }
          case "delete": {
            const eventId = op.event as string;
            if (!eventId) { results.push({ index: i, op: opType, ok: false, error: "missing 'event'" }); continue; }
            gogArgs = ["delete", opCalendar, eventId, "-a", opAccount, "-j", "-y"];
            if (op.scope) gogArgs.push("--scope", op.scope as string);
            break;
          }
          default:
            results.push({ index: i, op: opType, ok: false, error: `unknown op: ${opType}. Use: create, update, delete` });
            continue;
        }
      } catch (e) {
        results.push({ index: i, op: opType, ok: false, error: String(e) });
        continue;
      }

      // Execute with retry + exponential backoff on rate limits
      let succeeded = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const r = await gogSafe(gogArgs);
        if (r.ok) {
          let parsed: unknown = null;
          if (r.data) { try { parsed = JSON.parse(r.data); } catch { parsed = r.data; } }
          results.push({ index: i, op: opType, ok: true, result: parsed ?? { ok: true, action: opType } });
          succeeded = true;
          break;
        }
        if (!r.retryable || attempt === MAX_RETRIES) {
          results.push({ index: i, op: opType, ok: false, error: r.error });
          break;
        }
        // Exponential backoff: 2s, 4s, 8s
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }

      // Small delay between operations to avoid rate limits
      if (succeeded && i < ops.length - 1) {
        await sleep(500);
      }
    }

    console.log(JSON.stringify(results, null, 2));
    break;
  }

  default:
    err(
      `Unknown command: ${cmd}. Use: calendars, events, get, create, update, delete, search, freebusy, conflicts, rsvp, focus, ooo, batch`,
    );
}
