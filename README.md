# arxatec-scrapping

Scrapers de **fuentes legales públicas del Perú** para poblar la base documental
de Arxatec (objetivo: de ~10k a **+1M de documentos**). Arquitectura: **un módulo
por fuente** en `src/modules/`, con un subcomando CLI por módulo; todos arman el
**mismo JSON de contrato** y hacen POST al mismo endpoint de ingesta del backend
`arxatec-lawyer-assistant` (`POST /legal-documents/ingest`).

Módulos: **`spij`** (SPIJ/MINJUS, normativa) y **`pj`** (Poder Judicial,
jurisprudencia sistematizada). Siguiente fuente prevista: Tribunal Constitucional.

> 📚 **Contexto completo en [`docs/README.md`](./docs/README.md)**: estrategia de
> fuentes, plan del módulo PJ y deuda técnica. Si llegas de cero, empieza ahí.

## Instalar y correr

```bash
pnpm install                     # deps (Puppeteer baja Chromium la 1ª vez)
pnpm run ingest                  # corre el módulo SPIJ (= tsx src/cli.ts spij)
SPIJ_LIMIT=20 pnpm run ingest    # prueba con solo 20 documentos (SPIJ)
pnpm run cli -- pj --limit 10    # Poder Judicial: jurisprudencia (prueba con 10)
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
| `npm run ingest` | corre el módulo `spij` |
| `npm run cli -- <módulo> [flags]` | CLI genérico (hoy solo `spij`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc` |

## Variables de entorno

| | |
| --- | --- |
| `INGEST_BASE_URL` / `INGEST_PATH` / `INGEST_TOKEN` | endpoint de ingesta del assistant |
| `INGEST_COUNTRY` / `INGEST_SOURCE` / `INGEST_STATUS` | metadata fija del módulo (defaults SPIJ: `PE` / `SPIJ` / `Vigente`) |
| `INGEST_TIMEOUT` / `INGEST_MAX_RETRIES` | red de la ingesta |
| `GROQ_API_KEY` / `LLM_MODEL` | clasificación de `legal_area` con IA |
| `SPIJ_LIMIT` / `PJ_LIMIT` | tope de documentos por módulo (pruebas; sin él corre todo) |
| `SPIJ_TIPO` | `NR` (normativa, default) o `JR` |
| `SPIJ_INGEST_CONCURRENCY` / `SPIJ_INGEST_DELAY` / `SPIJ_PAGE_SIZE` | ritmo SPIJ |
| `PJ_CONCURRENCY` / `PJ_DELAY` / `PJ_UA` | ritmo y User-Agent del módulo PJ |
| `SPIJ_USER` / `SPIJ_CLAVE` / `SPIJ_TIPO_ACCESO` / `SPIJ_HISTORICO` / `SPIJ_DISP` / `SPIJ_FECHA_INI` / `SPIJ_FECHA_FIN` / `SPIJ_UA` | acceso y filtros SPIJ |

## Estado / reanudación

Para continuar una corrida interrumpida, ejecuta el **mismo comando**: salta los
documentos ya completados (dedupe por `id` en el ledger) y reanuda desde el
checkpoint. Estado en `state/spij_ingest/` (`ledger.jsonl`, `checkpoint.json`).

⚠️ El ledger es **la única** defensa contra duplicados: el backend no deduplica
(ver `docs/deuda-tecnica.md` §A1). No borres `state/` de una corrida ya ingestada.

## Convenciones (no romper)

- Un módulo por fuente en `src/modules/<fuente>/`, subcomando propio en `src/cli.ts`.
- Solo **funciones e interfaces**, sin clases. TypeScript ESM ejecutado con `tsx`.
- Cada módulo es reanudable (ledger + checkpoint) y aislado: uno roto no tumba el resto.
- El campo `type` del contrato usa el union `LegalDocumentType` (`src/types/common/`);
  no mandes strings sueltos.
