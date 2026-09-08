# CLAUDE.md — arxatec-scrapping

Scraper of Peru's public legal sources. **33 sources covered by 21 modules** in
`src/modules/` — it is not 1:1: `doctrina` alone harvests 7 university
repositories, and the `gob.pe` lane groups 13 sub-sources (`src/modules/` also
holds `entidades` and the two `carril-*` orchestrators, which are not sources).
They all build the same contract and, depending on `INGEST_MODE`, **ingest by
themselves** (Vertex + Qdrant + PostgreSQL + S3) or `POST
/legal-documents/ingest` to the `arxatec-lawyer-assistant` backend.

**If it ingests locally against production's Qdrant, `QDRANT_API_KEY` is
mandatory** — that corpus is about to stop accepting credential-less writes, and
the order in which to do it matters:
[`docs/known_issues/2026_W35.md`](docs/known_issues/2026_W35.md). Modules are
**built and validated** here (smokes of 10–20 docs); volume runs happen on the
separate VM ([`docs/campania-vm.md`](docs/campania-vm.md)).

> **Language.** Repo-level files (this one, `README.md` and the work cycle) are in
> English. The documents under `docs/` that describe the Peruvian portals are still
> in Spanish, on purpose — see `docs/BACKLOG.md`.

## Read this first (in order)

0. [`docs/runbook-arranque.md`](docs/runbook-arranque.md) — **how it is operated**:
   startup order, resuming (re-run the same command), verification and reset. First
   thing if you are going to RUN something rather than program it.
0b. [`docs/arquitectura-produccion.md`](docs/arquitectura-produccion.md) — where it
   runs in production and why (own PC > cloud because of the PJ's IP handling;
   sequential > 20 sessions because the bottleneck is the backend). Measured:
   ~800 MB per session.
1. [`docs/registro-scraping.md`](docs/registro-scraping.md) — **THE LIVE BOARD.**
   The sources from the spreadsheet, what is done, the progress counter and each
   module's command. The truth about state is HERE and **only** here: the "Estado
   actual" section of `docs/README.md` was retired on 2026-08-04 precisely for
   duplicating it and going stale. **Despite its name it is not a record** — it is
   living documentation and gets rewritten.
2. [`docs/README.md`](docs/README.md) — index of the documents in `docs/`: source
   strategy, anti-blocking, VM campaign and one `plan-<source>.md` per module.
3. [`docs/known_issues/`](docs/known_issues/) — **live problems**, one file per week
   of detection. Start there before trusting a number written in any other `.md`.
4. Before touching a specific module: its `docs/plan-<source>.md`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm <source> [--limit n]` | Runs one module (`spij`, `pj`, `tc`, `elperuano`, `tfiscal`, `indecopi`, `tce`, `sunarp`, `servir`, `oefa`, `osinergmin`, `osiptel`, `sunass`, `ositran`, `gobpe`, `sunat`, `spley`, `doctrina`…). `--limit` = smoke. |
| `pnpm verify <source> [n]` | **The mechanical signal**: smoke with `--limit n` (default 5) plus a PASS/FAIL verdict from the ledger delta. Use it before calling a module good. |
| `pnpm entidades [--sync]` | Refreshes the entity catalogue. **ALWAYS before** ingesting documents (the backend only links issuers that are already seeded). |
| `pnpm all` / `pnpm status` | Orchestrator (entities first, smallest first) / progress per source from the ledgers (does not touch the network). |
| `pnpm typecheck && pnpm test` | Mandatory before every commit. |

Package manager: **pnpm, never npm**. Puppeteer requires Chrome
(`npx puppeteer browsers install chrome`). OCR requires poppler (`pdftoppm`).

## Module convention (do not break)

- `src/modules/<source>/` with `config/constants/services/utils/run`. Functions and
  interfaces only, **no classes**. TypeScript ESM run through `tsx`.
- **Resumable**: ledger plus checkpoint in `state/<source>_ingest/` (`pj` uses
  `state/pj_jurisprudencia/`). `state/` is the official anti-duplicate mechanism
  and therefore a **production asset**: never delete it; back it up after large
  runs. Its blind spots are recorded in
  [`docs/known_issues/2026_W30.md`](docs/known_issues/2026_W30.md).
- Checklist for a new module: module → subcommand in `src/cli.ts` and
  `package.json` → `DOC_SCRAPERS` → canonical source → issuer → mark the board.

## Ingestion contract (what breaks silently)

- Types in `src/types/common` (`Metadata`/`IngestData`); client in
  `src/services/assistant` (`IngestClient`).
- The backend **requires at least one date** (`effective_date`/`effective_from`/
  `published_at`/`issued_at`) and a **non-empty `subarea`** (use `"General"`).
- `status` is **deterministic per source, NEVER decided by an LLM** (spley =
  `"En revisión"`; everything else provisionally `"Vigente"` — owner's decision).
  An invented status makes the document invisible to the platform's filters. The
  two-vocabulary mismatch behind that provisional answer is in
  [`docs/known_issues/2026_W30.md`](docs/known_issues/2026_W30.md).
- `source` = canonical name from `src/services/sources`. The alias→canonical map has
  a **SHA-256 fingerprint pinned in tests of THREE repos** (here
  `src/services/sources/index.test.ts`, assistant `tests/test_legal_sources.py`,
  platform `canonical_source.test.ts`): adding a source = updating the catalogue and
  the fingerprint **in all three at once**.
- Issuer: the entity must exist in `public/data/entity.json` (if not: `pnpm
  entidades` plus seeding in the assistant). Private ones (universities) are NOT in
  the state catalogue → an empty issuer with a warning is the correct outcome.
- Scanned PDF → the backend answers 400 → re-ingest with the shared OCR
  (`src/services/ocr`), auditable warning in the ledger.

## Network gotchas (detail in `docs/anti-bloqueo-scraping.md` and each plan)

- **pj**: Radware blocks axios but lets `fetch` through; high `PJ_DELAY`, residential
  IP, no bursts (it throttles per IP at connection level).
- **elperuano**: the viewer is intermittent (0.2 s or hangs >60 s) → short timeout
  plus retries; the index CSV arrives in CP850.
- **gobpe**: pagination tops out around 400 pages → 1-day windows; it does NOT run
  in `all` (owner's decision).
- **sunat**: mixed UTF-8/latin-1 charset; date = floor of the year.
- **doctrina**: many portals serve their SPA on the OAI route (a false 200) —
  confirm `?verb=Identify` returns OAI XML before adding to `REPOS`.
- **spley**: API with AES-encrypted params (key in `services/spley/crypto.ts`); the
  portal's PDF is unstable → we render our own.
- **adlp**: HTTPS on leyes.congreso.gob.pe is INTERMITTENT (it hangs or answers
  instantly — it is not "down"); the search grid silently truncates to 20 rows →
  windows of ≤20 numbers.

## Environment and verification

- `.env` (gitignored): `INGEST_BASE_URL` (local assistant on :8000) and
  `INGEST_TOKEN` (= the assistant's `ASSISTANT_SYNC_TOKEN`; in its `.env` it is
  quoted → read it with dotenv, never with `cut`). Do NOT define global
  `INGEST_SOURCE`/`INGEST_STATUS` (they would override the per-module source) — and
  see [`docs/known_issues/2026_W32.md`](docs/known_issues/2026_W32.md) for what the
  default does when you leave it unset.
- A real smoke needs the assistant running. GOTCHA: when you kill its uvicorn, the
  children keep holding `:8000` — kill the PIDs from `ss -tlnp | grep 8000`.

## Documentation: the work cycle and the rule

**This section is canonical.** Do not replicate the list of rules anywhere else.

**Never assume the documentation is current — this file included.** A `.md`
describes the code of the day someone wrote it; the code moved on. Before basing a
decision on a documented claim —a path, a `file:line`, a number, an "it is already
done"— **check it**. If it fails, fixing it is part of the work in hand, not a
ticket for later.

It is not paranoia. On 2026-08-04, re-verifying the July record, both of its open
gaps turned out to be closed —and the main one by an architecture different from
the one that document specified—; and `docs/README.md` still said there was **one**
module working when the board counted 33 of 44. None of that broke a test. **The
output of a previous session is evidence, not truth.**

### Where each thing goes

`docs/` has two halves. One **describes the system** and is rewritten when the
system changes: the board, the `plan-<source>.md` files, the runbook, the VM
campaign, the production architecture, the catalogues and the strategy. The other
**records the work** and accumulates by week. They never mix, and **the expensive
mistake here is moving things in bulk**.

All four record sites name their files the same way: `YYYY_Wnn.md`, with the ISO
week from `date +%G_W%V`.

| Where | What | Who writes it |
| --- | --- | --- |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Ideas from the whole team and everything missing. One line, no formatting, no priority. | Anyone, whenever |
| [`docs/focus/`](docs/focus/) | **One** priority per week, its actions (one per day) and the action that unblocks each dependency. | The CEO, on Monday |
| [`docs/shipped/`](docs/shipped/) | What was delivered: intent, branch, PR, what changed, how it was verified, what is still open. | **The agent, on closing the feature, inside the same PR** |
| [`docs/known_issues/`](docs/known_issues/) | Live bugs and traps no gate catches. One `##` section per problem. | Whoever detects it |

The cycle runs one way: idea → `BACKLOG.md` → the week's priority in `focus/` →
`shipped/` when the PR lands. Whatever breaks along the way falls into
`known_issues/`, and goes back to `BACKLOG.md` if fixing it is work.

**When you close a feature, before opening the PR**, add its entry to
`docs/shipped/YYYY_Wnn.md`: intent, branch, what changed, how it was verified —
here that means the gates **and** `pnpm verify <source>` with its verdict — and what
is still open. That is not documenting the session: it is that **intent is the only
thing that cannot be reconstructed from `git log`**.

In `known_issues/`, the file's week is the week of **detection** and never changes:
re-verifying updates the problem's header, not the file it lives in. Mandatory
header with status, date, last verification and **commit** — without a commit a
known issue is an opinion. Since almost nothing here starts and ends in this repo,
if the finding crosses into `assistant`/`service`/`platform`, declare **each repo's
commit**. When a problem is fixed **its section is deleted**; when a week runs out
of sections, the file goes too.

Do **not** create a `.md` to record a session, an investigation or a status
snapshot.

### `docs/registro/` no longer exists

It was removed on 2026-09-08 and is in `.gitignore`: it was per-session,
per-person scaffolding, not repo memory. What was still open was extracted to
`docs/known_issues/` and `docs/BACKLOG.md` before deleting it, and re-verified
against the code on the way out — two of its points did not survive that check and
are deliberately absent.

References left in the `.md` files are marked **(retirado)**. The content is still
in history and is cited, never restored:

```bash
git show 3792b14:docs/registro/2026-08-25/INGESTA_SIN_CREDENCIAL.md
git show 3792b14:docs/registro/            # lists what was there
```

## Git

- Branch per unit of work + PR; the owner merges on GitHub. **Never push straight
  to main.** `gh` is not installed: PRs are created from the URL
  `github.com/arxatec-engine/arxatec-scrapping/pull/new/<branch>`.
- When a module is finished, the SAME PR updates the board
  (`docs/registro-scraping.md`): ✅ on its row plus the counter (convention: ✅ = the
  source is really harvesting, not "coverable").
