# Scraper SPIJ (TypeScript)

**TLDR** — Scrapea el **SPIJ** (Sistema Peruano de Información Jurídica, MINJUS Perú).
Dos modos: `spij` baja metadata/PDF a disco; `spij_ingest` arma el JSON del contrato
y lo envía a la API `legal_documents/ingest`. TypeScript + Puppeteer (HTML→PDF).
Solo **funciones e interfaces**, sin clases.

## Instalar y correr
```bash
npm install                      # deps (Puppeteer baja Chromium la 1ª vez)
npm run ingest                   # modo ingesta  (= tsx src/spij/cli.ts spij_ingest)
npm run spij                     # modo metadata/descarga local
SPIJ_LIMIT=20 npm run ingest     # prueba con solo 20 documentos
```
La config sale del **`.env`** (se carga solo): `INGEST_BASE_URL`, `INGEST_TOKEN`
(se manda como `x-assistant-token`), `GROQ_API_KEY`, `LLM_MODEL`. Ver `.env.example`.

## Flujo (modo ingesta)
```
1. buscar norma (SPIJ)        4. armar JSON (IA + scraping + constantes)
2. descargar contenido        5. POST /ingest (S3 + relacional + Qdrant)
3. clasificar:                6. limpiar staging → siguiente
   - emisor      → determinista (classifier.ts) → issuer_entity_ids
   - legal_area  → IA Groq (sumilla; si no hay, primeras páginas del cuerpo)
```

## Estructura
```
src/
├── types.ts              interfaces compartidas (Config, Doc, Ctx, Metadata…)
├── spij/                 flujo SPIJ
│   ├── cli.ts            entry: elige modo y corre
│   ├── config.ts         .env → Config (baseConfig / ingestConfig)
│   ├── api.ts            auth (back+solr) + buscar + descargar + parse
│   ├── classifier.ts     sector → entidad emisora
│   ├── legalAreas.ts     catálogo cerrado data/legal_areas.json
│   ├── llm.ts            Groq: texto de la norma → id de subárea
│   ├── ingest.ts         modo spij_ingest (arma el JSON y lo envía)
│   ├── download.ts       modo spij (metadata + descarga local)
│   └── run.ts            orquesta: reanudación, paginación, concurrencia
└── utils/                genérico
    ├── http.ts  store.ts  render.ts (Puppeteer)
    └── text.ts  stats.ts  log.ts
data/   groups.json subgroups.json entity.json legal_areas.json
```

## Scripts npm
| script | qué hace |
| --- | --- |
| `npm run ingest` | corre el modo `spij_ingest` |
| `npm run spij` | corre el modo `spij` (metadata/descarga) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc` |

## Variables de entorno
| | |
| --- | --- |
| `SPIJ_FORMATO` | `json` (solo metadata), `pdf`, `html`, `both` |
| `SPIJ_TIPO` | `NR` (normativa, por defecto) o `JR` |
| `SPIJ_LIMIT` | tope de documentos (para pruebas; sin él, corre todo) |
| `INGEST_BASE_URL` / `INGEST_TOKEN` | API de ingesta (modo `spij_ingest`) |
| `GROQ_API_KEY` / `LLM_MODEL` | clasificación de `legal_area` con IA |

## Estado / reanudación
Para continuar una corrida interrumpida, vuelve a ejecutar el **mismo comando**:
salta los documentos ya completados (dedupe por `id`) y reanuda desde el checkpoint.
Estado del modo ingesta en `state/spij_ingest/` (`ledger.jsonl`, `checkpoint.json`).

## Más doc
- [`CLASSIFICATION_PLAN.md`](./CLASSIFICATION_PLAN.md) — el plan de clasificación de `legal_area` con IA.
- [`PORTING.md`](./PORTING.md) — firmas de cada módulo (contrato del puerto).
</content>
