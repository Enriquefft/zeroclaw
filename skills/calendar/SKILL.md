---
name: calendar
description: Full Google Calendar control across all accounts. Use for viewing agenda, creating events, updating, deleting, checking availability, finding conflicts, and managing RSVPs.
---

# Calendar Skill

Unified calendar access via `calendar_cli` tool. Wraps `gog calendar` for Google Calendar operations.

## Accounts

Uses the same accounts configured in `gog`. Primary accounts:

| Account | Type |
|---------|------|
| `enriquefft2001@gmail.com` | Personal |
| `enrique.flores@utec.edu.pe` | UTEC |

## Tool: calendar_cli

All commands output JSON. Use `--account <email>` to target a specific account.

### List calendars
```
calendar_cli calendars [--account <email>]
```

### View agenda (events)
```
calendar_cli events [--account <email>] [--calendar <id>] [--from <date>] [--to <date>] [--max <n>]
```
Default: next 7 days, primary calendar, 20 events max.

### Get single event
```
calendar_cli get <calendarId> <eventId> [--account <email>]
```

### Create event
```
calendar_cli create --account <email> --calendar <id> --summary <title> --from <datetime> --to <datetime> [--location <loc>] [--description <desc>] [--attendees <email1,email2>]
```

### Update event
```
calendar_cli update --account <email> --calendar <id> --event <eventId> [--summary <title>] [--from <datetime>] [--to <datetime>] [--location <loc>] [--description <desc>]
```

### Delete event
```
calendar_cli delete --account <email> --calendar <id> --event <eventId>
```

### Search events
```
calendar_cli search <query> [--account <email>] [--calendar <id>]
```

### Check free/busy
```
calendar_cli freebusy --account <email> --calendars <id1,id2> --from <datetime> --to <datetime>
```

### Find conflicts
```
calendar_cli conflicts [--account <email>] [--from <date>] [--to <date>]
```

### Respond to invitation (RSVP)
```
calendar_cli rsvp --account <email> --calendar <id> --event <eventId> --status <accepted|declined|tentative>
```

### Quick actions
```
calendar_cli focus --account <email> --from <datetime> --to <datetime>   # Focus time block
calendar_cli ooo --account <email> --from <datetime> --to <datetime>     # Out of office
```

### Batch operations (preferred for multiple writes)
```
echo '<json_array>' | calendar_cli batch
```
Use batch for 2+ create/update/delete operations. Executes sequentially with automatic rate-limit backoff. One call instead of many.

Each operation in the array:
```json
[
  {"op": "update", "account": "email", "event": "eventId", "summary": "New Title", "description": "..."},
  {"op": "create", "account": "email", "summary": "Title", "from": "2024-03-15T10:00", "to": "2024-03-15T11:00"},
  {"op": "delete", "account": "email", "event": "eventId"}
]
```
Optional fields per op: `calendar` (default: primary), plus any flags the individual command accepts.

Output: array of `{"index": N, "op": "...", "ok": true/false, "result": {...}}`.

## Date/time format

- Dates: `YYYY-MM-DD` (e.g., `2024-03-15`)
- Datetimes: `YYYY-MM-DDTHH:MM` or `YYYY-MM-DD HH:MM` (e.g., `2024-03-15T14:30`)
- Relative: `today`, `tomorrow`, `+3d`, `+1w` (where supported)

## Notes

- Calendar IDs can be email addresses or special IDs like `primary`
- Use `primary` as calendar ID for the main calendar
- All-day events use date only (no time)
- Timezone follows account settings
