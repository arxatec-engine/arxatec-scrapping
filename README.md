# arxatec-scrapping

Scrapers of **Peru's public legal sources**, to populate the Arxatec corpus
(target: **1M+ documents**). **33 sources** covered by **21 scraping modules** — a
module can cover several sources: `doctrina` alone harvests 7 university
repositories.

## How it ingests (two modes)

Every module scrapes and then hands the document over. Where it hands it over is
decided by `INGEST_MODE`:

| Mode | What it does | When |
| --- | --- | --- |
| **`local`** | The module itself writes to **Vertex (embeddings) + Qdrant + PostgreSQL + S3** | The campaign mode |
| `remote` | `POST /legal-documents/ingest` to the `arxatec-lawyer-assistant` backend | Historical mode; still works |

The decision lives in **one place** (the shared clients in `src/services/`), not in
each module. Both modes return the same `IngestResult`, so the ledger, the OCR
fallback, the warnings and `pnpm verify` work identically either way.

## The 8 lanes (this is how the campaign runs)

Eight parallel processes, **one per host**. The rule: two processes must never hit
the same site — the limit is set by the source, not by us.

| Console | Command | Covers |
| --- | --- | --- |
| 1 | `pnpm carril-gobpe` | **13 sub-sources** of `www.gob.pe`, in one process, ordered by volume |
| 2 | `pnpm carril-congreso` | `adlp` + `spley` (they share `congreso.gob.pe`) |
| 3 | `pnpm tc` | Constitutional Court |
| 4 | `pnpm sunat` | SUNAT |
| 5 | `pnpm elperuano` | Diario El Peruano |
| 6 | `pnpm doctrina` | 7 university repositories |
| 7 | `pnpm spij` | SPIJ (API, public account) |
| 8 | `pnpm pj` | Judiciary — **from a residential IP only** |

The standalone commands for gob.pe sub-sources (`pnpm tfl`, `pnpm indecopi`, …)
exist **only to test** one specific source. In a campaign they go through the lane,
which is the only thing that guarantees a single rate against the portal.

Operational detail in [`docs/runbook-arranque.md`](./docs/runbook-arranque.md) § 4b.

> 📚 **Full context in [`docs/README.md`](./docs/README.md)**, and the real state of
> the sources in [`docs/registro-scraping.md`](./docs/registro-scraping.md) — the
> live board, despite its name.
>
> The work record is elsewhere and accumulates by week:
> [`docs/known_issues/`](./docs/known_issues/) (live problems),
> [`docs/BACKLOG.md`](./docs/BACKLOG.md) (what is missing),
> [`docs/focus/`](./docs/focus/) (the week's priority) and
> [`docs/shipped/`](./docs/shipped/) (what was delivered).

## Install and run

```bash
pnpm install                      # deps (Puppeteer downloads Chromium the first time)
pnpm entidades                    # ALWAYS before ingesting: seeds the catalogue
pnpm verify tc 5                  # smoke of one source, with a PASS/FAIL verdict
pnpm carril-gobpe --limit 25      # the 13 gob.pe sub-sources, capped
pnpm status                       # progress per source (does not touch the network)
```

> The repo's package manager is **pnpm** (`pnpm-lock.yaml`). The `npm run` scripts
> also work, but install with pnpm so the lockfile is respected.

Config comes from the root **`.env`** (loaded automatically; see `.env.example`):
`INGEST_BASE_URL`, `INGEST_TOKEN` (sent as the `x-assistant-token` header),
`GROQ_API_KEY`, `LLM_MODEL`.

## The SPIJ module's flow

```
1. authenticate against SPIJ and load catalogues (public/data/*.json)
2. paginate results by cursor; concurrency semaphore
3. for each document:
   - issuer      → deterministic (utils/classifier) → issuer_entity_ids
   - legal_area  → Groq picks a subarea from the closed legal_areas.json catalogue
   - HTML → PDF with Puppeteer (SPIJ gives no PDF)
   - multipart POST to the ingestion endpoint (metadata as a string + the PDF)
4. ledger + checkpoint per page; at the end, up to 4 retry passes
```

## Structure

```
src/
├── cli.ts                    entry: one subcommand per module (commander)
├── config/ constants/        .env loading and variable names (SPIJ_/PJ_/INGEST_)
├── types/                    shared types: Logger, LegalDocumentType,
│                             Metadata (the ingestion contract), IngestResult…
├── services/assistant/       shared ingestion client (POST /ingest)
├── utils/                    generic: http (throttle+retry), log, render
│                             (Puppeteer HTML→PDF), store (ledger/checkpoint),
│                             text, time
└── modules/
    ├── spij/                 SPIJ (legislation): JSON API + classifier + Groq
    └── pj/                   Judiciary (case law): HTML crawler
        ├── config/ constants/  env PJ_* / INGEST_* → Config; tree, headers
        ├── types/              Config, PjDoc, Leaf, TreeNode, ledger…
        ├── services/pj/        fetchHtml (cookie jar) + downloadPdf
        ├── utils/              crawler (tree BFS + pagination), parse (cheerio),
        │                       catalog (issuer + area by subject), metadata, ingest, stats
        └── run/                orchestrator: ledger-based resume, summary
public/data/                  catalogues (groups, subgroups, entity, legal_areas)
                              — a copy of the assistant's
                              app/seed/legal_documents/tipos/, which is the source of truth
docs/                         living documentation (strategy, plans, board) plus the
                              work record (known_issues/, BACKLOG.md, focus/, shipped/)
state/<module>/               ledger.jsonl + checkpoint.json + log (gitignored)
```

Each source = one module in `src/modules/`; they all build the same `Metadata` and
use the same `src/services/assistant`. SPIJ generates the PDF with Puppeteer (the
source serves HTML); PJ downloads a ready-made PDF. SPIJ classifies issuer and area
with the classifier plus the LLM; PJ derives them from the tree (constant issuer,
subject from the breadcrumb).

## Scripts

| script | what it does |
| --- | --- |
| `pnpm <source> [--limit n]` | runs a single module (testing) |
| `pnpm carril-gobpe` / `pnpm carril-congreso` | the two lanes that hold several sub-sources |
| `pnpm verify <source> [n]` | **the mechanical signal**: smoke + PASS/FAIL verdict |
| `pnpm entidades [--sync]` | refreshes the issuing-entity catalogue |
| `pnpm status` | progress per source, from the ledgers |
| `pnpm typecheck` / `pnpm test` | mandatory before every commit |

## Environment variables

Full commented template in [`.env.example`](./.env.example). The ones that matter:

| | |
| --- | --- |
| `INGEST_MODE` | `local` (campaign) or `remote` (POST to the assistant) |
| `QDRANT_URL` / `DATABASE_URL` | destination of local ingestion |
| `QDRANT_API_KEY` | **mandatory when ingesting against production's Qdrant.** Same key as the assistant's `QDRANT_API_KEY` and the service's `QDRANT_LEGAL_API_KEY` — see [`docs/known_issues/2026_W35.md`](./docs/known_issues/2026_W35.md) |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_APPLICATION_CREDENTIALS` | Vertex AI, for the embeddings (`gemini-embedding-001`, 1024 dims). **The path must exist**: a typo gives no clear error, it fails document by document |
| `EMBEDDING_MAX_CONCURRENCY` | ceiling of in-flight embeddings **per process**. With 8 lanes the effective ceiling is 8 × this value. **Leave it at 2**: the Vertex quota is 1M tokens/min and with 8 lanes a value of 8 reached 342 % |
| `INGEST_SKIP_UNCHANGED` | `true` in a campaign (does not re-pay embeddings for what did not change); `false` to confirm it really embeds. Defaults to `true` |
| `AWS_BUCKET_NAME` / `AWS_KEY_ACCESS` / `AWS_KEY_ACCESS_SECRET` | S3. **Careful**: these are not the AWS SDK's standard names |
| `INGEST_BASE_URL` / `INGEST_TOKEN` | only for `INGEST_MODE=remote` |
| `GROQ_API_KEY` / `LLM_MODEL` | legal-area classification |
| `<SOURCE>_LIMIT` | document cap per module (testing). Two break the pattern: `indecopi` uses `IND_LIMIT` and `tfiscal` uses `TF_LIMIT` |

## State / resuming

To continue an interrupted run, execute the **same command**: it skips documents
already completed (dedup by `id` in the ledger) and resumes from the checkpoint.
State lives in `state/spij_ingest/` (`ledger.jsonl`, `checkpoint.json`).

⚠️ The ledger is the **only** defence against duplicates: the backend does not
dedup, and the ledger has two blind spots —
[`docs/known_issues/2026_W30.md`](./docs/known_issues/2026_W30.md). Never delete
`state/` from a run that was already ingested.

## Conventions (do not break)

- One module per source in `src/modules/<source>/`, with its own subcommand in
  `src/cli.ts`.
- **Functions and interfaces only**, no classes. TypeScript ESM run with `tsx`.
- Every module is resumable (ledger + checkpoint) and isolated: a broken one does
  not take the rest down.
- The contract's `type` field uses the `LegalDocumentType` union
  (`src/types/common/`); do not send loose strings.
