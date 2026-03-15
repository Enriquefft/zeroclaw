---
name: fast-run
description: Delegate simple sub-tasks to a fast model (GLM-5). Use for fetch, extract, query, and tool-heavy work that needs minimal reasoning.
---

# Fast Run

Delegate simple, self-contained sub-tasks to GLM-5. The fast model has access to all tools (browser, email, calendar, sqlite, shell) but runs at lower reasoning effort.

## When to Use

- Fetching data from web pages or APIs
- Extracting structured data from text
- Running database queries and returning results
- Collecting RSS feeds or search results
- File reading and summarization
- Simple shell operations

## When NOT to Use

- Scoring or ranking (needs judgment)
- Creative writing (needs SOUL.md voice)
- Strategic decisions or analysis
- Reviewing quality of outputs
- Tasks requiring multi-step reasoning chains

## CLI Reference

### fast_run_cli <task>

Run a single self-contained task via GLM-5.

The task string must be complete and self-contained. Include:
- What to do (specific action)
- What data to return (format, fields)
- Any constraints (limits, filters)

Output: JSON to stdout with `success` and `output` fields.

### Examples

```
fast_run_cli "Search Wellfound for founding engineer roles. Return JSON array: [{title, company, url, salary, remote}]. Limit 20."
fast_run_cli "Read ~/.zeroclaw/documents/LORE.md and extract the job boards list as a JSON array of strings."
fast_run_cli "Query state.db: SELECT url FROM job_applications WHERE status='new'. Return the URLs as a newline-separated list."
```
