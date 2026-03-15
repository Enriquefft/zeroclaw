---
name: email
description: Email across all accounts (Gmail, SpaceMail) — send, search, read, reply, forward, label, delete.
---

# Email Skill

Unified email CLI. Routes to `gog gmail` (Gmail) or `himalaya` (SpaceMail) per account.

## Accounts

| Account | Provider |
|---------|----------|
| `enriquefft2001@gmail.com` | Gmail |
| `enrique.flores@utec.edu.pe` | Gmail |
| `enriquefft@404tf.com` | SpaceMail |

## Commands

All output compact JSON by default. Add `--full` for raw provider output. Pass `--account <email>` to target one account, or omit for all.

```
email_cli send --account <email> --to <addr> --subject <text> --body <text> [--attachment <path>]
email_cli search <query> [--account <email>] [--full]
email_cli get <id> --account <email> [--full]
email_cli thread <threadId> --account <email>
email_cli reply <id> --account <email> --body <text>
email_cli forward <id> --account <email> --to <addr>
email_cli list [--account <email>] [--since <minutes>]
email_cli labels [list|create|delete] [--account <email>]
email_cli label <id> --account <email> --add <labels> --remove <labels>
email_cli delete <id> --account <email>
email_cli archive <id> --account <email>
email_cli trash <id> --account <email>
email_cli mark <read|unread|starred> <id> --account <email>
email_cli attachments <id> --account <email> [--dir <path>]
email_cli accounts [list|add|remove|reauth|auth-complete]
```

Search uses `--full` to include message bodies (saves a separate `get` per result).

## Notes

- Confirm with Enrique before sending or deleting
- If `auth_required` error: run `email_cli accounts reauth <email>`
- Attachments: Gmail only, comma-separated paths
