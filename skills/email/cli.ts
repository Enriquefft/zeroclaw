#!/usr/bin/env bun
/**
 * Unified email CLI for ZeroClaw
 * Routes to gog gmail (Gmail) or himalaya (SpaceMail) based on account provider.
 *
 * Usage:
 *   cli.ts <command> [options]
 *
 * Commands:
 *   accounts, list, search, get, send, reply, forward, thread,
 *   labels, label, delete, archive, trash, mark, attachments
 *
 * Output: JSON on stdout, errors on stderr.
 */

import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

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

// ─── Account Config ──────────────────────────────────────────────────────────

type Provider = "gmail" | "spacemail";

interface Account {
  email: string;
  provider: Provider;
  label: string;
  /** himalaya account name (only for spacemail) */
  himalayaAccount?: string;
}

const ACCOUNTS_FILE = join(
  process.env.HOME ?? "/home/hybridz",
  ".zeroclaw/workspace/email-accounts.json",
);

const DEFAULT_ACCOUNTS: Account[] = [
  { email: "enriquefft2001@gmail.com", provider: "gmail", label: "Personal" },
  { email: "enrique.flores@utec.edu.pe", provider: "gmail", label: "UTEC" },
  {
    email: "enriquefft@404tf.com",
    provider: "spacemail",
    label: "404tf",
    himalayaAccount: "spacemail",
  },
];

function loadAccounts(): Account[] {
  if (!existsSync(ACCOUNTS_FILE)) {
    saveAccounts(DEFAULT_ACCOUNTS);
    return DEFAULT_ACCOUNTS;
  }
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8"));
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

function saveAccounts(accounts: Account[]): void {
  mkdirSync(dirname(ACCOUNTS_FILE), { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2) + "\n");
}

const ACCOUNTS = loadAccounts();

function getAccount(email: string): Account {
  const acc = ACCOUNTS.find((a) => a.email === email);
  if (!acc)
    err(
      `Unknown account: ${email}. Known: ${ACCOUNTS.map((a) => a.email).join(", ")}`,
    );
  return acc;
}

function isGmail(account: Account): boolean {
  return account.provider === "gmail";
}

function targetAccounts(email?: string): Account[] {
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

function him(acc: Account): string {
  return acc.himalayaAccount ?? "spacemail";
}

// ─── Account Management ─────────────────────────────────────────────────────

async function accountsList(): Promise<object[]> {
  return ACCOUNTS.map((a) => ({
    email: a.email,
    provider: a.provider,
    label: a.label,
  }));
}

async function accountsAdd(
  email: string,
  provider: Provider,
  label: string,
  himalayaAccount?: string,
): Promise<object> {
  if (ACCOUNTS.find((a) => a.email === email)) {
    err(`Account ${email} already exists`);
  }

  if (provider === "gmail") {
    // Run gog auth add — outputs an OAuth URL for the user to visit
    const result =
      await $`gog auth add ${email} --services gmail --remote --step 1`.quiet();
    if (result.exitCode !== 0) {
      err(
        `Failed to start Gmail auth for ${email}: ${result.stderr.toString()}`,
      );
    }
    const output = result.stdout.toString().trim();

    // Save the account as pending
    const newAcc: Account = { email, provider, label };
    ACCOUNTS.push(newAcc);
    saveAccounts(ACCOUNTS);

    return {
      ok: true,
      action: "account_added_pending_auth",
      email,
      provider,
      label,
      auth_url: output,
      next_step:
        "Send this auth_url to the user. After they authorize, run: email_cli accounts auth-complete <email> --auth-url <redirect_url>",
    };
  }

  // SpaceMail — just register (himalaya config is manual)
  const newAcc: Account = {
    email,
    provider,
    label,
    himalayaAccount: himalayaAccount ?? label.toLowerCase(),
  };
  ACCOUNTS.push(newAcc);
  saveAccounts(ACCOUNTS);

  return {
    ok: true,
    action: "account_added",
    email,
    provider,
    label,
    note: "SpaceMail account registered. Ensure himalaya is configured for this account.",
  };
}

async function accountsAuthComplete(
  email: string,
  authUrl: string,
): Promise<object> {
  const acc = getAccount(email);
  if (acc.provider !== "gmail") {
    err("auth-complete is only for Gmail accounts");
  }

  const result =
    await $`gog auth add ${email} --services gmail --remote --step 2 --auth-url ${authUrl}`.quiet();
  if (result.exitCode !== 0) {
    err(
      `Failed to complete Gmail auth for ${email}: ${result.stderr.toString()}`,
    );
  }

  return {
    ok: true,
    action: "auth_completed",
    email,
    message: `Gmail account ${email} is now fully authorized and ready to use.`,
  };
}

async function accountsRemove(email: string): Promise<object> {
  const idx = ACCOUNTS.findIndex((a) => a.email === email);
  if (idx === -1) err(`Account ${email} not found`);

  const removed = ACCOUNTS.splice(idx, 1)[0];
  saveAccounts(ACCOUNTS);

  return {
    ok: true,
    action: "account_removed",
    email: removed.email,
    provider: removed.provider,
  };
}

// ─── Gmail Implementations ──────────────────────────────────────────────────

async function gmailList(acc: Account, since: number): Promise<object[]> {
  const hours = Math.ceil(since / 60);
  const result =
    await $`gog gmail search -a ${acc.email} -j --results-only "newer_than:${hours}h in:inbox"`.quiet();
  if (result.exitCode !== 0) return [];
  try {
    const data = JSON.parse(result.stdout.toString());
    const threads = Array.isArray(data) ? data : (data.threads ?? []);
    return threads.map((t: Record<string, unknown>) => ({
      account: acc.email,
      provider: "gmail",
      id: t.id,
      date: t.date,
      from: t.from,
      subject: t.subject,
      labels: t.labels,
    }));
  } catch {
    return [];
  }
}

async function gmailSearch(acc: Account, query: string): Promise<object[]> {
  const result =
    await $`gog gmail search -a ${acc.email} -j --results-only ${query}`.quiet();
  if (result.exitCode !== 0) return [];
  try {
    const data = JSON.parse(result.stdout.toString());
    const threads = Array.isArray(data) ? data : (data.threads ?? []);
    return threads.map((t: Record<string, unknown>) => ({
      account: acc.email,
      provider: "gmail",
      id: t.id,
      date: t.date,
      from: t.from,
      subject: t.subject,
    }));
  } catch {
    return [];
  }
}

async function gmailGet(acc: Account, id: string): Promise<object> {
  const result = await $`gog gmail get -a ${acc.email} -j ${id}`.quiet();
  if (result.exitCode !== 0) err(`Failed to fetch message ${id}`);
  return JSON.parse(result.stdout.toString());
}

async function gmailSend(
  acc: Account,
  to: string,
  subject: string,
  body: string,
): Promise<object> {
  const mime = `To: ${to}\nSubject: ${subject}\n\n${body}`;
  const result = await $`gog gmail send -a ${acc.email}`.stdin(mime).quiet();
  if (result.exitCode !== 0) err("Failed to send via Gmail");
  return { ok: true, account: acc.email, to, subject };
}

async function gmailThread(acc: Account, threadId: string): Promise<object> {
  const result =
    await $`gog gmail thread get -a ${acc.email} -j ${threadId}`.quiet();
  if (result.exitCode !== 0) err(`Failed to fetch thread ${threadId}`);
  return JSON.parse(result.stdout.toString());
}

async function gmailLabels(acc: Account): Promise<object[]> {
  const result =
    await $`gog gmail labels list -a ${acc.email} -j --results-only`.quiet();
  if (result.exitCode !== 0) return [];
  try {
    return JSON.parse(result.stdout.toString());
  } catch {
    return [];
  }
}

async function gmailLabelCreate(acc: Account, name: string): Promise<object> {
  const result =
    await $`gog gmail labels create -a ${acc.email} -j ${name}`.quiet();
  if (result.exitCode !== 0) err(`Failed to create label ${name}`);
  return { ok: true, account: acc.email, action: "label_created", name };
}

async function gmailLabelDelete(acc: Account, name: string): Promise<object> {
  const result =
    await $`gog gmail labels delete -a ${acc.email} -y ${name}`.quiet();
  if (result.exitCode !== 0) err(`Failed to delete label ${name}`);
  return { ok: true, account: acc.email, action: "label_deleted", name };
}

async function gmailLabelModify(
  acc: Account,
  threadId: string,
  add: string[],
  remove: string[],
): Promise<object> {
  const addArgs = add.flatMap((l) => ["--add-labels", l]);
  const removeArgs = remove.flatMap((l) => ["--remove-labels", l]);
  const result =
    await $`gog gmail labels modify -a ${acc.email} -j ${threadId} ${addArgs} ${removeArgs}`.quiet();
  if (result.exitCode !== 0) err(`Failed to modify labels on ${threadId}`);
  return {
    ok: true,
    account: acc.email,
    threadId,
    added: add,
    removed: remove,
  };
}

async function gmailDelete(acc: Account, ids: string[]): Promise<object> {
  const result =
    await $`gog gmail batch delete -a ${acc.email} -y ${ids}`.quiet();
  if (result.exitCode !== 0) err(`Failed to delete messages`);
  return { ok: true, account: acc.email, action: "deleted", ids };
}

async function gmailArchive(acc: Account, threadId: string): Promise<object> {
  return gmailLabelModify(acc, threadId, [], ["INBOX"]);
}

async function gmailTrash(acc: Account, threadId: string): Promise<object> {
  return gmailLabelModify(acc, threadId, ["TRASH"], ["INBOX"]);
}

async function gmailMark(
  acc: Account,
  ids: string[],
  flag: string,
  value: boolean,
): Promise<object> {
  const labelMap: Record<string, string> = {
    unread: "UNREAD",
    read: "UNREAD",
    starred: "STARRED",
    flagged: "STARRED",
  };
  const label = labelMap[flag];
  if (!label)
    err(`Unknown flag: ${flag}. Use: unread, read, starred, flagged`);

  const shouldAdd =
    flag === "unread" || flag === "starred" || flag === "flagged"
      ? value
      : !value;
  const addLabels = shouldAdd ? [label] : [];
  const removeLabels = shouldAdd ? [] : [label];

  const result =
    await $`gog gmail batch modify -a ${acc.email} -j ${ids} ${addLabels.flatMap((l) => ["--add-labels", l])} ${removeLabels.flatMap((l) => ["--remove-labels", l])}`.quiet();
  if (result.exitCode !== 0) err(`Failed to mark messages`);
  return { ok: true, account: acc.email, action: "marked", flag, value, ids };
}

async function gmailForward(
  acc: Account,
  id: string,
  to: string,
): Promise<object> {
  const msg = (await gmailGet(acc, id)) as Record<string, unknown>;
  const origSubject = (msg.subject as string) ?? "";
  const origBody = (msg.body as string) ?? (msg.snippet as string) ?? "";
  const subject = `Fwd: ${origSubject}`;
  const body = `---------- Forwarded message ----------\n${origBody}`;
  return gmailSend(acc, to, subject, body);
}

async function gmailAttachments(
  acc: Account,
  id: string,
  outDir: string,
): Promise<object> {
  const result =
    await $`gog gmail thread attachments -a ${acc.email} -j ${id}`.quiet();
  if (result.exitCode !== 0) err(`Failed to list attachments for ${id}`);
  try {
    const attachments = JSON.parse(result.stdout.toString());
    return { account: acc.email, id, attachments };
  } catch {
    return { account: acc.email, id, attachments: [] };
  }
}

// ─── SpaceMail (himalaya) Implementations ───────────────────────────────────

async function spacemailList(acc: Account, since: number): Promise<object[]> {
  const result =
    await $`himalaya envelope list -a ${him(acc)} --output json`.quiet();
  if (result.exitCode !== 0) return [];
  try {
    const envelopes = JSON.parse(result.stdout.toString());
    const cutoff = Date.now() - since * 60 * 1000;
    return (Array.isArray(envelopes) ? envelopes : [])
      .filter((e: Record<string, unknown>) => {
        const d = new Date(e.date as string).getTime();
        return d >= cutoff;
      })
      .map((e: Record<string, unknown>) => ({
        account: acc.email,
        provider: "spacemail",
        id: e.id,
        date: e.date,
        from: e.from,
        subject: e.subject,
        flags: e.flags,
      }));
  } catch {
    return [];
  }
}

async function spacemailSearch(
  acc: Account,
  query: string,
): Promise<object[]> {
  const result =
    await $`himalaya envelope search -a ${him(acc)} --output json ${query}`.quiet();
  if (result.exitCode !== 0) return [];
  try {
    const data = JSON.parse(result.stdout.toString());
    return (Array.isArray(data) ? data : []).map(
      (e: Record<string, unknown>) => ({
        account: acc.email,
        provider: "spacemail",
        id: e.id,
        date: e.date,
        from: e.from,
        subject: e.subject,
      }),
    );
  } catch {
    return [];
  }
}

async function spacemailGet(acc: Account, id: string): Promise<object> {
  const result =
    await $`himalaya message read -a ${him(acc)} --output json ${id}`.quiet();
  if (result.exitCode !== 0) err(`Failed to fetch message ${id}`);
  return JSON.parse(result.stdout.toString());
}

async function spacemailSend(
  acc: Account,
  to: string,
  subject: string,
  body: string,
): Promise<object> {
  const mime = `To: ${to}\nSubject: ${subject}\n\n${body}`;
  const result =
    await $`himalaya message send -a ${him(acc)}`.stdin(mime).quiet();
  if (result.exitCode !== 0) err("Failed to send via SpaceMail");
  return { ok: true, account: acc.email, to, subject };
}

async function spacemailThread(acc: Account, id: string): Promise<object> {
  const result =
    await $`himalaya message thread -a ${him(acc)} --output json ${id}`.quiet();
  if (result.exitCode !== 0) err(`Failed to fetch thread for ${id}`);
  return JSON.parse(result.stdout.toString());
}

async function spacemailFolders(acc: Account): Promise<object[]> {
  const result =
    await $`himalaya folder list -a ${him(acc)} --output json`.quiet();
  if (result.exitCode !== 0) return [];
  try {
    return JSON.parse(result.stdout.toString());
  } catch {
    return [];
  }
}

async function spacemailFolderCreate(
  acc: Account,
  name: string,
): Promise<object> {
  const result = await $`himalaya folder add -a ${him(acc)} ${name}`.quiet();
  if (result.exitCode !== 0) err(`Failed to create folder ${name}`);
  return { ok: true, account: acc.email, action: "folder_created", name };
}

async function spacemailFolderDelete(
  acc: Account,
  name: string,
): Promise<object> {
  const result =
    await $`himalaya folder delete -a ${him(acc)} ${name}`.quiet();
  if (result.exitCode !== 0) err(`Failed to delete folder ${name}`);
  return { ok: true, account: acc.email, action: "folder_deleted", name };
}

async function spacemailMove(
  acc: Account,
  id: string,
  folder: string,
): Promise<object> {
  const result =
    await $`himalaya message move -a ${him(acc)} ${id} ${folder}`.quiet();
  if (result.exitCode !== 0) err(`Failed to move message ${id} to ${folder}`);
  return { ok: true, account: acc.email, action: "moved", id, folder };
}

async function spacemailDelete(acc: Account, ids: string[]): Promise<object> {
  for (const id of ids) {
    const result =
      await $`himalaya message delete -a ${him(acc)} ${id}`.quiet();
    if (result.exitCode !== 0) err(`Failed to delete message ${id}`);
  }
  return { ok: true, account: acc.email, action: "deleted", ids };
}

async function spacemailMark(
  acc: Account,
  ids: string[],
  flag: string,
  value: boolean,
): Promise<object> {
  const flagMap: Record<string, string> = {
    unread: "seen",
    read: "seen",
    starred: "flagged",
    flagged: "flagged",
  };
  const himFlag = flagMap[flag];
  if (!himFlag)
    err(`Unknown flag: ${flag}. Use: unread, read, starred, flagged`);

  const shouldAdd =
    flag === "read" || flag === "starred" || flag === "flagged"
      ? value
      : !value;
  const action = shouldAdd ? "add" : "remove";

  for (const id of ids) {
    const result =
      await $`himalaya flag ${action} -a ${him(acc)} ${id} ${himFlag}`.quiet();
    if (result.exitCode !== 0)
      err(`Failed to ${action} flag ${himFlag} on ${id}`);
  }
  return { ok: true, account: acc.email, action: "marked", flag, value, ids };
}

async function spacemailForward(
  acc: Account,
  id: string,
  to: string,
  body: string,
): Promise<object> {
  const msg = (await spacemailGet(acc, id)) as Record<string, unknown>;
  const origSubject = (msg.subject as string) ?? "";
  const subject = `Fwd: ${origSubject}`;
  return spacemailSend(acc, to, subject, body);
}

async function spacemailAttachments(
  acc: Account,
  id: string,
  outDir: string,
): Promise<object> {
  const result =
    await $`himalaya attachment download -a ${him(acc)} ${id} ${outDir}`.quiet();
  if (result.exitCode !== 0) err(`Failed to download attachments for ${id}`);
  return { ok: true, account: acc.email, id, directory: outDir };
}

// ─── Main ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const { args, positional } = parseArgs(argv);
const cmd = positional[0];

if (!cmd)
  err(
    "No command. Use: accounts, list, search, get, send, reply, forward, thread, labels, label, delete, archive, trash, mark, attachments",
  );

const account = args.account as string | undefined;

switch (cmd) {
  // ─── accounts (list/add/remove/auth-complete) ──────────────────────────
  case "accounts": {
    const sub = positional[1]; // list | add | remove | auth-complete

    if (!sub || sub === "list") {
      console.log(JSON.stringify(await accountsList(), null, 2));
    } else if (sub === "add") {
      const email = positional[2];
      if (!email) err("accounts add requires an email address");
      const provider = (args.provider as Provider) ?? "gmail";
      const label = (args.label as string) ?? email.split("@")[0];
      const himalayaAccount = args["himalaya-account"] as string | undefined;
      const result = await accountsAdd(email, provider, label, himalayaAccount);
      console.log(JSON.stringify(result, null, 2));
    } else if (sub === "remove") {
      const email = positional[2];
      if (!email) err("accounts remove requires an email address");
      const result = await accountsRemove(email);
      console.log(JSON.stringify(result, null, 2));
    } else if (sub === "auth-complete") {
      const email = positional[2];
      if (!email) err("accounts auth-complete requires an email address");
      const authUrl = args["auth-url"] as string;
      if (!authUrl) err("accounts auth-complete requires --auth-url");
      const result = await accountsAuthComplete(email, authUrl);
      console.log(JSON.stringify(result, null, 2));
    } else {
      err(
        `Unknown accounts subcommand: ${sub}. Use: list, add, remove, auth-complete`,
      );
    }
    break;
  }

  // ─── list ───────────────────────────────────────────────────────────────
  case "list": {
    const since = parseInt(String(args.since ?? "60"), 10);
    const targets = targetAccounts(account);
    const results = await Promise.all(
      targets.map((a) =>
        isGmail(a) ? gmailList(a, since) : spacemailList(a, since),
      ),
    );
    console.log(JSON.stringify(results.flat(), null, 2));
    break;
  }

  // ─── search ─────────────────────────────────────────────────────────────
  case "search": {
    const query = positional[1];
    if (!query) err("search requires a query");
    const targets = targetAccounts(account);
    const results = await Promise.all(
      targets.map((a) =>
        isGmail(a) ? gmailSearch(a, query) : spacemailSearch(a, query),
      ),
    );
    console.log(JSON.stringify(results.flat(), null, 2));
    break;
  }

  // ─── get ────────────────────────────────────────────────────────────────
  case "get": {
    const id = positional[1];
    if (!id) err("get requires a message id");
    if (!account) err("get requires --account");
    const acc = getAccount(account);
    const msg = isGmail(acc)
      ? await gmailGet(acc, id)
      : await spacemailGet(acc, id);
    console.log(JSON.stringify(msg, null, 2));
    break;
  }

  // ─── send ───────────────────────────────────────────────────────────────
  case "send": {
    if (!account) err("send requires --account");
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;
    if (!to) err("send requires --to");
    if (!subject) err("send requires --subject");
    if (!body) err("send requires --body");
    const acc = getAccount(account);
    const result = isGmail(acc)
      ? await gmailSend(acc, to, subject, body)
      : await spacemailSend(acc, to, subject, body);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── reply ──────────────────────────────────────────────────────────────
  case "reply": {
    const id = positional[1];
    if (!id) err("reply requires a message id");
    if (!account) err("reply requires --account");
    const body = args.body as string;
    if (!body) err("reply requires --body");
    const acc = getAccount(account);

    if (isGmail(acc)) {
      const msg = (await gmailGet(acc, id)) as Record<string, unknown>;
      const from = (msg.from as string) ?? "";
      const subject = `Re: ${(msg.subject as string) ?? ""}`;
      const result = await gmailSend(acc, from, subject, body);
      console.log(JSON.stringify(result, null, 2));
    } else {
      const mime = body;
      const result =
        await $`himalaya message reply -a ${him(acc)} --output json ${id}`
          .stdin(mime)
          .quiet();
      if (result.exitCode !== 0) err("Failed to reply via SpaceMail");
      console.log(result.stdout.toString());
    }
    break;
  }

  // ─── forward ────────────────────────────────────────────────────────────
  case "forward": {
    const id = positional[1];
    if (!id) err("forward requires a message id");
    if (!account) err("forward requires --account");
    const to = args.to as string;
    if (!to) err("forward requires --to");
    const acc = getAccount(account);
    const body = (args.body as string) ?? "";
    const result = isGmail(acc)
      ? await gmailForward(acc, id, to)
      : await spacemailForward(acc, id, to, body);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── thread ─────────────────────────────────────────────────────────────
  case "thread": {
    const id = positional[1];
    if (!id) err("thread requires a thread/message id");
    if (!account) err("thread requires --account");
    const acc = getAccount(account);
    const result = isGmail(acc)
      ? await gmailThread(acc, id)
      : await spacemailThread(acc, id);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── labels (list/create/delete labels or folders) ──────────────────────
  case "labels": {
    const sub = positional[1];
    const targets = targetAccounts(account);

    if (!sub || sub === "list") {
      const results = await Promise.all(
        targets.map(async (a) => ({
          account: a.email,
          provider: a.provider,
          labels: isGmail(a)
            ? await gmailLabels(a)
            : await spacemailFolders(a),
        })),
      );
      console.log(JSON.stringify(results, null, 2));
    } else if (sub === "create") {
      const name = positional[2];
      if (!name) err("labels create requires a name");
      if (!account) err("labels create requires --account");
      const acc = getAccount(account);
      const result = isGmail(acc)
        ? await gmailLabelCreate(acc, name)
        : await spacemailFolderCreate(acc, name);
      console.log(JSON.stringify(result, null, 2));
    } else if (sub === "delete") {
      const name = positional[2];
      if (!name) err("labels delete requires a name");
      if (!account) err("labels delete requires --account");
      const acc = getAccount(account);
      const result = isGmail(acc)
        ? await gmailLabelDelete(acc, name)
        : await spacemailFolderDelete(acc, name);
      console.log(JSON.stringify(result, null, 2));
    } else {
      err(`Unknown labels subcommand: ${sub}. Use: list, create, delete`);
    }
    break;
  }

  // ─── label (modify labels on a thread/message) ─────────────────────────
  case "label": {
    const id = positional[1];
    if (!id) err("label requires a thread/message id");
    if (!account) err("label requires --account");
    const acc = getAccount(account);

    if (isGmail(acc)) {
      const add = (args.add as string)?.split(",") ?? [];
      const remove = (args.remove as string)?.split(",") ?? [];
      if (add.length === 0 && remove.length === 0)
        err("label requires --add and/or --remove (comma-separated)");
      const result = await gmailLabelModify(acc, id, add, remove);
      console.log(JSON.stringify(result, null, 2));
    } else {
      const folder = args.to as string;
      if (!folder)
        err("label for SpaceMail requires --to <folder> (moves message)");
      const result = await spacemailMove(acc, id, folder);
      console.log(JSON.stringify(result, null, 2));
    }
    break;
  }

  // ─── delete ─────────────────────────────────────────────────────────────
  case "delete": {
    const ids = positional.slice(1);
    if (ids.length === 0) err("delete requires message id(s)");
    if (!account) err("delete requires --account");
    const acc = getAccount(account);
    const result = isGmail(acc)
      ? await gmailDelete(acc, ids)
      : await spacemailDelete(acc, ids);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── archive ────────────────────────────────────────────────────────────
  case "archive": {
    const id = positional[1];
    if (!id) err("archive requires a thread/message id");
    if (!account) err("archive requires --account");
    const acc = getAccount(account);
    const result = isGmail(acc)
      ? await gmailArchive(acc, id)
      : await spacemailMove(acc, id, "Archive");
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── trash ──────────────────────────────────────────────────────────────
  case "trash": {
    const id = positional[1];
    if (!id) err("trash requires a thread/message id");
    if (!account) err("trash requires --account");
    const acc = getAccount(account);
    const result = isGmail(acc)
      ? await gmailTrash(acc, id)
      : await spacemailMove(acc, id, "Trash");
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── mark (read/unread/starred/flagged) ─────────────────────────────────
  case "mark": {
    const flag = positional[1];
    if (!flag) err("mark requires a flag: read, unread, starred, flagged");
    const ids = positional.slice(2);
    if (ids.length === 0) err("mark requires message id(s) after the flag");
    if (!account) err("mark requires --account");
    const acc = getAccount(account);
    const value = args.value !== "false";
    const result = isGmail(acc)
      ? await gmailMark(acc, ids, flag, value)
      : await spacemailMark(acc, ids, flag, value);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  // ─── attachments ────────────────────────────────────────────────────────
  case "attachments": {
    const id = positional[1];
    if (!id) err("attachments requires a message/thread id");
    if (!account) err("attachments requires --account");
    const acc = getAccount(account);
    const outDir = (args.dir as string) ?? "/tmp/zeroclaw-attachments";
    const result = isGmail(acc)
      ? await gmailAttachments(acc, id, outDir)
      : await spacemailAttachments(acc, id, outDir);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  default:
    err(
      `Unknown command: ${cmd}. Use: accounts, list, search, get, send, reply, forward, thread, labels, label, delete, archive, trash, mark, attachments`,
    );
}
