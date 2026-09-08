# Shipped

What **was delivered**. One file per ISO week, one `##` section per task.

```text
docs/shipped/2026_W37.md
```

This folder exists so that nobody has to remember to record anything. The agent
writes it **when closing each feature, inside the same PR** that delivers it: if
the PR lands, the record lands with it; if the PR does not land, there was no
delivery and there is nothing to record. That is why it lives next to the code and
not on a separate board — a record filled in by hand stops being filled in the
first day someone is in a hurry.

The daily summary comes from here. Not the other way around.

## The whole flow

1. Pick the task (from `../BACKLOG.md`, or from the priority in `../focus/`).
2. Own branch: `feat/…`, `fix/…`, `chore/…`.
3. Implement.
4. **Before opening the PR**, add this week's section in
   `docs/shipped/YYYY_W<week>.md`.
5. PR. On merge, fill in the PR number in the section.

If the week's file does not exist, create it. `date +%G_W%V` gives you the week.

## Entry template

```markdown
## Title of what was delivered

> **Branch:** `feat/qdrant-api-key-ingesta` · **PR:** #33 · **Merged:** 2026-08-25

**Intent.** Why it was done, in a sentence or two. The problem the user had, not
the technical change. If it came from the backlog or from the week's focus, link it.

**What changed.**

- `src/modules/<source>/…` — what changed and why
- `src/services/…` — same

**How it was verified.** The gates that passed (`pnpm typecheck`, `pnpm test`) and,
for anything touching a source, **`pnpm verify <source>`** with its PASS/FAIL verdict
against the local assistant. If it was run against a real environment, say what was
looked at and against which commit. If a gate could **not** be run, say so and why.

If the change touches the board of 44 sources, `docs/registro-scraping.md` is updated
in the same PR — it is living documentation, not a record, despite its name.

**What is still open.** What the PR does not close. If it is a live bug it also
goes to `../known_issues/`; if it is future work, to `../BACKLOG.md`. Only the
pointer goes here.
```

**Intent** is the only field that cannot be recovered from `git log`. It is the
one that matters: in three months the diff will still be there, but why it was
decided will not.

## What does NOT go here

| Yes | No |
| --- | --- |
| A feature delivered and merged | Work in progress → not shipped yet |
| A bug fixed, with its cause | A live bug → `../known_issues/` |
| A refactor with a visible effect | The line-by-line changelog → `git log` |
| A decision made while executing | Ideas → `../BACKLOG.md` |
