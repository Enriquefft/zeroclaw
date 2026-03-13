---
name: email
description: Full email control across all multiple accounts (Gmail, SpaceMail). Use for reading, searching, sending, replying, forwarding, labeling, archiving, deleting, and managing attachments.
---

# Email Skill

Unified email access across all accounts via the `email_cli` tool. Routes automatically to `gog gmail` (Gmail accounts) or `himalaya` (SpaceMail accounts).

## Accounts

Accounts are stored in `~/.zeroclaw/workspace/email-accounts.json` and managed via `email_cli accounts`. Default accounts:

| Account | Provider | Label |
|---------|----------|-------|
| `enriquefft2001@gmail.com` | Gmail | Personal |
| `enrique.flores@utec.edu.pe` | Gmail | UTEC |
| `enriquefft@404tf.com` | SpaceMail | 404tf |

## Tool: email_cli

All commands output JSON. Pass `--account <email>` to target a specific account, or omit to run across all (where applicable).

### Manage accounts
```
email_cli accounts                          # list all configured accounts
email_cli accounts add user@gmail.com       # add new Gmail account (opens browser for OAuth)
email_cli accounts add user@gmail.com --label "Work"
email_cli accounts add user@x.com --provider spacemail --label "X" --himalaya-account x
email_cli accounts reauth user@gmail.com    # re-authorize existing Gmail (OAuth expired)
email_cli accounts remove user@gmail.com
```

**Gmail OAuth expiry — use `reauth`, never `add`:**
- If any email command returns `{"error":"auth_required",...}`, OAuth has expired.
- Run `email_cli accounts reauth <email>` — this opens a browser on Enrique's machine automatically.
- The command blocks until Enrique logs in and clicks Allow (up to 3 minutes).
- No copy-pasting URLs required — auth completes automatically.

### List recent emails
```
email_cli list [--account <email>] [--since <minutes>]
```
Default: last 60 minutes, all accounts.

### Search emails
```
email_cli search <query> [--account <email>]
```
Gmail search syntax for Gmail accounts, IMAP search for SpaceMail.

### Read a message
```
email_cli get <id> --account <email>
```

### Send an email
```
email_cli send --account <email> --to <recipient> --subject <subject> --body <text>
```

### Reply to a message
```
email_cli reply <id> --account <email> --body <text>
```

### Forward a message
```
email_cli forward <id> --account <email> --to <recipient> [--body <text>]
```

### View full thread
```
email_cli thread <threadId> --account <email>
```

### List/create/delete labels (Gmail) or folders (SpaceMail)
```
email_cli labels [list] [--account <email>]
email_cli labels create <name> --account <email>
email_cli labels delete <name> --account <email>
```

### Modify labels on a thread/message
```
# Gmail: add/remove labels
email_cli label <threadId> --account <email> --add <label1,label2> --remove <label3>

# SpaceMail: move to folder
email_cli label <id> --account <email> --to <folder>
```

### Delete messages
```
email_cli delete <id1> [id2 ...] --account <email>
```

### Archive a message
```
email_cli archive <id> --account <email>
```

### Move to trash
```
email_cli trash <id> --account <email>
```

### Mark read/unread/starred
```
email_cli mark <flag> <id1> [id2 ...] --account <email> [--value false]
```
Flags: `read`, `unread`, `starred`, `flagged`. Default value is true; pass `--value false` to unset.

### Download attachments
```
email_cli attachments <id> --account <email> [--dir /path/to/save]
```
Default download dir: `/tmp/zeroclaw-attachments`.

## Notes

- Always confirm with Enrique before sending or deleting emails
- Gmail uses `gog gmail` CLI, SpaceMail uses `himalaya` CLI
- All output follows JSON contract (stdout JSON, stderr errors)
- When adding accounts for other users, send them the OAuth link — never open it yourself
- Accounts persist in `~/.zeroclaw/workspace/email-accounts.json` — no code edits needed to add/remove accounts
