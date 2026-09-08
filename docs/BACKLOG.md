# Backlog

Ideas from the whole team, and everything that is missing. **From everyone**: if
you think of something, you write it here and that is it.

## How to use it

One line. No formatting, no priority, no estimate, no asking permission:

```markdown
- Measure how many duplicate document numbers gob.pe actually produces — Harvey · 2026-09-08
```

Free text, who wrote it and the date. Nothing else. This file is a dumping ground
on purpose: the moment adding an idea costs more than having it, people stop using
it and ideas go back to dying in the head of whoever had them.

What you do **not** do here: sort, decide, or mark urgencies. That happens once a
week, when the single priority that goes to [`focus/`](focus/) comes out of this
file. An idea can live here for months without that being a failure — that is the
point.

When something gets executed, it is deleted from here and appears in
[`shipped/`](shipped/).

| Goes here | Does not go here |
| --- | --- |
| A half-formed idea | A live bug → [`known_issues/`](known_issues/) |
| A feature someone asked for | The week's priority → [`focus/`](focus/) |
| Technical debt that annoys you | Already delivered → [`shipped/`](shipped/) |
| "This looks wrong and I don't know why" | Nothing. When in doubt, write it |

---

## Ideas

_Undefined. Anyone adds a line at the end._

- 

---

## What is missing

Work already identified, with its origin. It moves to `focus/` when its turn comes.

### Harvested from `registro/` (now deleted) — 2026-09-08

Starting position: the gates are green (`pnpm typecheck` clean, 32/32 tests as of
2026-08-15) and **the code debt that had a deadline is closed** — the three LLM
defaults moved off the models Groq shut down on 2026-08-16, and they are verified
today at `openai/gpt-oss-20b`. What follows is work, not broken things. What *is*
broken lives in [`known_issues/`](known_issues/).

#### Cheap — minutes or half an hour

- **Set `INGEST_SOURCE` explicitly wherever ingestion runs**, or move the default
  out of the SPIJ config. It is one line, and it removes a silent way to mislabel a
  whole source → [`known_issues/2026_W32.md`](known_issues/2026_W32.md).
- **Read `LLM_MODEL` off the campaign VM's `.env`** and confirm it does not point at
  a shut-down model. Not code work; it needs machine access →
  [`known_issues/2026_W33.md`](known_issues/2026_W33.md).

#### One session

- **Measure `www.gob.pe`'s real budget**: how many requests before 429/403. It sizes
  the lane that 14 of 22 modules share, and it is the critical path of the launch
  plan → [`known_issues/2026_W32.md`](known_issues/2026_W32.md).
- **Measure duplicate document numbers per source** once the corpus grows. It is the
  step before deciding the identity policy, and with one observation there is no way
  to tell an isolated case from gob.pe's normal behaviour →
  [`known_issues/2026_W34.md`](known_issues/2026_W34.md).
- **Re-ingest the 34 documents that were classified with the default legal area** —
  after checking whether they survived the corpus reset of 2026-08-24 →
  [`known_issues/2026_W33.md`](known_issues/2026_W33.md).

#### Larger, with a known trigger

- **The 7 remaining modules become complete modules** (they ingest on their own
  instead of going through the assistant). There was an executable playbook with the
  common recipe, the six traps already paid for in the pilot and the acceptance
  signal: `git show 3792b14:docs/registro/2026-08-07/fases-7-modulos.md`. **Trigger:**
  it was blocked on the Vertex quota, which is now known (1M tokens/min), and on the
  gob.pe budget, which is not.
- **The gob.pe lane, by waves.** 14 of 22 modules share one host and the throttle is
  per process. The wave plan and the real volumes per institution (measured against
  gob.pe's own search) are in
  `git show 3792b14:docs/registro/2026-08-07/plan-lanzamiento-paralelo.md`.
- **A private network or tunnel for ingestion into production**, instead of the
  public domain → [`known_issues/2026_W35.md`](known_issues/2026_W35.md).

#### Decisions waiting on the owner, not work

- **The identity policy for the same resolution under two URLs** (DU-2). Measure
  first → [`known_issues/2026_W34.md`](known_issues/2026_W34.md).
- **Whether ingestion should be able to delete from production at all** (IC-4) →
  [`known_issues/2026_W35.md`](known_issues/2026_W35.md).
- **Backend dedup** (A1). Decided on 2026-07-21 as future, medium-low: the local
  ledger is the official mechanism. Revisit it if the ledger's blind spots start
  costing → [`known_issues/2026_W30.md`](known_issues/2026_W30.md).
- **A real `status` vocabulary** (A2), instead of sending everything as `"Vigente"`.
  It cannot be changed in one repo: `status` is matched exactly by the platform →
  [`known_issues/2026_W30.md`](known_issues/2026_W30.md).

#### Structural, not urgent

- **There is no CI.** Verified 2026-09-08: this repo has no `.github/` directory at
  all, so `pnpm typecheck` and `pnpm test` **only run if someone remembers to run
  them**. They are cheap (typecheck clean, 32 tests in under a second), which makes
  the absence of a workflow harder to justify, not easier. Of the six repos in the
  workspace, only `arxatec-lawyer-service` has one.
- **There is no `.nvmrc`.** The Node version is not written down. `arxatec-lawyer-service`
  pins 24 and blows up on anything newer; nothing says whether that applies here.

#### Documentation

- **`docs/` is still in Spanish** (25 files: the 16 `plan-<source>.md`, the board,
  `estrategia-fuentes.md`, `runbook-arranque.md`, `catalogo-entidades.md`,
  `fuentes-canonicas.md`, `campania-vm.md`, `arquitectura-produccion.md`,
  `anti-bloqueo-scraping.md`). Repo-level files (`CLAUDE.md`, `README.md` and the
  cycle) went to English on 2026-09-08; the rest was left out on purpose because
  these describe Peruvian portals in the language of the portals themselves, and
  translating them in passing loses the terms the sources actually use. Do it per
  document, if at all.
