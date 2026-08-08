# arxatec-scrapping

Scrapers de **fuentes legales públicas del Perú** para poblar el corpus de
Arxatec (objetivo: **+1M de documentos**). **33 fuentes** cubiertas por **21
módulos de scraping** — un módulo puede cubrir varias fuentes: `doctrina` sola
cosecha 7 repositorios universitarios.

## Cómo ingiere (dos modos)

Cada módulo scrapea y luego entrega el documento. A dónde lo entrega lo decide
`INGEST_MODE`:

| Modo | Qué hace | Cuándo |
| --- | --- | --- |
| **`local`** | El propio módulo escribe en **Vertex (embeddings) + Qdrant + PostgreSQL + S3** | El modo de la campaña |
| `remote` | `POST /legal-documents/ingest` al backend `arxatec-lawyer-assistant` | Modo histórico; sigue funcionando |

La decisión vive en **un solo sitio** (los clientes compartidos de
`src/services/`), no en cada módulo. Los dos modos devuelven el mismo
`IngestResult`, así que el ledger, el fallback de OCR, los warnings y
`pnpm verify` funcionan igual por las dos vías.

## Los 8 carriles (así se corre la campaña)

Ocho procesos en paralelo, **uno por host**. La regla: dos procesos nunca deben
pegar al mismo sitio — el límite lo pone la fuente, no nosotros.

| Consola | Comando | Cubre |
| --- | --- | --- |
| 1 | `pnpm carril-gobpe` | **13 subfuentes** de `www.gob.pe`, en un proceso y ordenadas por volumen |
| 2 | `pnpm carril-congreso` | `adlp` + `spley` (comparten `congreso.gob.pe`) |
| 3 | `pnpm tc` | Tribunal Constitucional |
| 4 | `pnpm sunat` | SUNAT |
| 5 | `pnpm elperuano` | Diario El Peruano |
| 6 | `pnpm doctrina` | 7 repositorios universitarios |
| 7 | `pnpm spij` | SPIJ (API, cuenta pública) |
| 8 | `pnpm pj` | Poder Judicial — **solo desde IP residencial** |

Los comandos sueltos de las subfuentes de gob.pe (`pnpm tfl`, `pnpm indecopi`, …)
existen **solo para probar** una fuente concreta. En campaña van por el carril,
que es lo único que garantiza un ritmo único contra el portal.

Detalle operativo en [`docs/runbook-arranque.md`](./docs/runbook-arranque.md) §4b.

> 📚 **Contexto completo en [`docs/README.md`](./docs/README.md)** y el estado
> real de las fuentes en [`docs/registro-scraping.md`](./docs/registro-scraping.md).
> La memoria de decisiones está en [`docs/registro/`](./docs/registro/README.md).

## Instalar y correr

```bash
pnpm install                      # deps (Puppeteer baja Chromium la 1ª vez)
pnpm entidades                    # SIEMPRE antes de ingerir: siembra el catálogo
pnpm verify tc 5                  # smoke de una fuente, con veredicto PASS/FAIL
pnpm carril-gobpe --limit 25      # las 13 subfuentes de gob.pe, con tope
pnpm status                       # avance por fuente (no toca la red)
```

> El package manager del repo es **pnpm** (`pnpm-lock.yaml`). Los scripts `npm run`
> también funcionan, pero usa pnpm para instalar y así respetar el lockfile.

La config sale del **`.env`** de la raíz (se carga solo; ver `.env.example`):
`INGEST_BASE_URL`, `INGEST_TOKEN` (va como header `x-assistant-token`),
`GROQ_API_KEY`, `LLM_MODEL`.

## Flujo del módulo SPIJ

```
1. autentica contra SPIJ y carga catálogos (public/data/*.json)
2. pagina resultados por cursor; semáforo de concurrencia
3. por cada documento:
   - emisor      → determinista (utils/classifier) → issuer_entity_ids
   - legal_area  → IA Groq elige subárea del catálogo cerrado legal_areas.json
   - HTML → PDF con Puppeteer (SPIJ no da PDF)
   - POST multipart al endpoint de ingesta (metadata como string + PDF)
4. ledger + checkpoint por página; al final, hasta 4 pasadas de reintento
```

## Estructura

```
src/
├── cli.ts                    entry: un subcomando por módulo (commander)
├── config/ constants/        carga de .env y nombres de variables (SPIJ_/PJ_/INGEST_)
├── types/                    tipos compartidos: Logger, LegalDocumentType,
│                             Metadata (contrato de ingesta), IngestResult…
├── services/assistant/       cliente de ingesta compartido (POST /ingest)
├── utils/                    genérico: http (throttle+retry), log, render
│                             (Puppeteer HTML→PDF), store (ledger/checkpoint),
│                             text, time
└── modules/
    ├── spij/                 SPIJ (normativa): API JSON + classifier + Groq
    └── pj/                   Poder Judicial (jurisprudencia): crawler HTML
        ├── config/ constants/  env PJ_* / INGEST_* → Config; árbol, headers
        ├── types/              Config, PjDoc, Leaf, TreeNode, ledger…
        ├── services/pj/        fetchHtml (cookie jar) + downloadPdf
        ├── utils/              crawler (BFS árbol + paginación), parse (cheerio),
        │                       catalog (emisor + área por materia), metadata, ingest, stats
        └── run/                orquestador: reanudación por ledger, resumen
public/data/                  catálogos (groups, subgroups, entity, legal_areas)
                              — copia de app/seed/legal_documents/tipos/ del
                              assistant, que es la fuente de verdad
docs/                         estrategia, plan PJ, deuda técnica (ver índice)
state/<módulo>/               ledger.jsonl + checkpoint.json + log (gitignored)
```

Cada fuente = un módulo en `src/modules/`; todos arman el mismo `Metadata` y usan
el mismo `src/services/assistant`. SPIJ genera PDF con Puppeteer (la fuente da
HTML); PJ descarga el PDF ya listo. SPIJ clasifica emisor/área con classifier+IA;
PJ los deriva del árbol (emisor constante, materia del breadcrumb).

## Scripts npm

| script | qué hace |
| --- | --- |
| `pnpm <fuente> [--limit n]` | corre un módulo suelto (pruebas) |
| `pnpm carril-gobpe` / `pnpm carril-congreso` | los dos carriles con varias subfuentes |
| `pnpm verify <fuente> [n]` | **la señal mecánica**: smoke + veredicto PASS/FAIL |
| `pnpm entidades [--sync]` | refresca el catálogo de entidades emisoras |
| `pnpm status` | avance por fuente desde los ledgers |
| `pnpm typecheck` / `pnpm test` | obligatorios antes de cada commit |

## Variables de entorno

Plantilla completa y comentada en [`.env.example`](./.env.example). Las que
importan:

| | |
| --- | --- |
| `INGEST_MODE` | `local` (campaña) o `remote` (POST al assistant) |
| `QDRANT_URL` / `DATABASE_URL` | destino de la ingesta local |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_APPLICATION_CREDENTIALS` | Vertex AI, para los embeddings (`gemini-embedding-001`, 1024 dims). **La ruta debe existir**: un typo no da un error claro, falla documento a documento |
| `EMBEDDING_MAX_CONCURRENCY` | techo de embeddings en vuelo **por proceso**. Con 8 carriles el techo efectivo es 8 × este valor. **Déjalo en 2**: la cuota de Vertex es 1 M de tokens/min y con 8 carriles el valor 8 llegaba al 342 % |
| `INGEST_SKIP_UNCHANGED` | `true` en campaña (no re-paga embeddings de lo que no cambió); `false` para comprobar que sí embebe |
| `AWS_BUCKET_NAME` / `AWS_KEY_ACCESS` / `AWS_KEY_ACCESS_SECRET` | S3. **Ojo**: los nombres no son los estándar del SDK de AWS |
| `INGEST_BASE_URL` / `INGEST_TOKEN` | solo para `INGEST_MODE=remote` |
| `GROQ_API_KEY` / `LLM_MODEL` | clasificación del área legal |
| `<FUENTE>_LIMIT` | tope de documentos por módulo (pruebas). Dos no siguen el patrón: `indecopi` usa `IND_LIMIT` y `tfiscal`, `TF_LIMIT` |

## Estado / reanudación

Para continuar una corrida interrumpida, ejecuta el **mismo comando**: salta los
documentos ya completados (dedupe por `id` en el ledger) y reanuda desde el
checkpoint. Estado en `state/spij_ingest/` (`ledger.jsonl`, `checkpoint.json`).

⚠️ El ledger es **la única** defensa contra duplicados: el backend no deduplica
(ver `docs/registro/2026-07-21/deuda-tecnica.md` §A1). No borres `state/` de una corrida ya ingestada.

## Convenciones (no romper)

- Un módulo por fuente en `src/modules/<fuente>/`, subcomando propio en `src/cli.ts`.
- Solo **funciones e interfaces**, sin clases. TypeScript ESM ejecutado con `tsx`.
- Cada módulo es reanudable (ledger + checkpoint) y aislado: uno roto no tumba el resto.
- El campo `type` del contrato usa el union `LegalDocumentType` (`src/types/common/`);
  no mandes strings sueltos.
