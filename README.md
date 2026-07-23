# Arxatec Scraping (TypeScript)

**TLDR** — Scrapers de fuentes jurídicas públicas del Perú. Cada fuente es un
**módulo** en `src/modules/<fuente>` con su propio subcomando. Todos siguen el
mismo flujo: recorren los documentos, descargan el PDF, clasifican (emisor
determinista + área legal con IA) y hacen `POST` a la API `legal_documents/ingest`.
TypeScript, solo **funciones e interfaces**, sin clases.

Módulos disponibles:

- **`spij`** — SPIJ (Sistema Peruano de Información Jurídica, MINJUS). Normas y
  jurisprudencia. Descarga el HTML de cada norma y lo convierte a PDF con
  Puppeteer.
- **`tc`** — Tribunal Constitucional (jurisprudencia sistematizada). Sentencias,
  autos y resoluciones. Descarga el PDF directo desde `tc.gob.pe` (sin navegador).

## Instalar y correr
```bash
npm install                      # deps (Puppeteer baja Chromium la 1ª vez, solo lo usa spij)

npm run spij                     # scraper SPIJ  (= tsx src/cli.ts spij)
npm run tc                       # scraper Tribunal Constitucional (= tsx src/cli.ts tc)

npm run tc -- --limit 20         # prueba: solo 20 documentos nuevos
SPIJ_LIMIT=20 npm run spij       # equivalente por variable de entorno
```
La config sale del **`.env`** (se carga solo): `INGEST_BASE_URL`, `INGEST_TOKEN`
(se manda como `x-assistant-token`), `GROQ_API_KEY`, `LLM_MODEL`. Ver `.env.example`.

## Flujo (común a todos los módulos)
```
1. buscar/paginar documentos       4. armar JSON (IA + scraping + constantes)
2. descargar contenido/PDF         5. POST /ingest (S3 + relacional + Qdrant)
3. clasificar:                     6. registrar en ledger → siguiente
   - emisor      → determinista (entidad → issuer_entity_ids)
   - legal_area  → IA Groq (texto del documento → subárea del catálogo)
```

### Detalle por fuente
- **SPIJ**: autentica (back + solr), pagina `POST /api/buscar`, baja el HTML con
  `/api/procesarword/{id}`, lo renderiza a PDF (Puppeteer) y clasifica el emisor
  contra `entity.json` (match exacto/fuzzy + cadena de sectores).
- **TC**: usa el backend REST público `jurisbackend.sedetc.gob.pe/api/visitor`.
  Recorre el corpus completo (~73k) con la búsqueda cronológica mes a mes
  (`/sentencia/busqueda/cronologico?fecha_publicacion=YYYY-MM`), ya que la
  búsqueda general topa en 10 000 por el límite de Elasticsearch. El PDF sale de
  `url_archivo`. El emisor es fijo (Tribunal Constitucional, resuelto una vez
  contra `entity.json`).

## Estructura
```
src/
├── cli.ts                entry: registra un subcomando por módulo (spij, tc)
├── config/               carga .env (dotenv + env-var)
├── constants/env/        nombres de variables de entorno
├── types/                interfaces compartidas (Metadata, IngestResult, Stats…)
├── services/             servicios compartidos
│   ├── ingest/           cliente del endpoint legal_documents/ingest (multipart)
│   └── llm/              Groq: texto → subárea + concepts + references
├── utils/                genérico: http, render (Puppeteer), text, time, log
└── modules/
    ├── spij/             flujo SPIJ (config, constants, services, utils, run)
    └── tc/               flujo Tribunal Constitucional
        ├── config/       .env → Config
        ├── constants/    endpoints, headers, mes inicial, emisor
        ├── services/tc/  buscar cronológico + parse + descargar PDF
        ├── utils/        ingest, metadata, issuer, store, stats
        └── run/          orquesta: reanudación, paginación por mes, concurrencia
public/data/  groups.json subgroups.json entity.json legal_areas.json
```

## Scripts npm
| script | qué hace |
| --- | --- |
| `npm run spij` | corre el scraper SPIJ |
| `npm run tc` | corre el scraper del Tribunal Constitucional |
| `npm run ingest` | alias de `spij` (compatibilidad) |
| `npm run cli` | CLI cruda (`tsx src/cli.ts <subcomando>`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc` |

## Variables de entorno
| variable | descripción |
| --- | --- |
| `INGEST_BASE_URL` / `INGEST_TOKEN` | API de ingesta (obligatoria la URL) |
| `INGEST_PATH` | ruta del endpoint (por defecto `/legal-documents/ingest`) |
| `GROQ_API_KEY` / `LLM_MODEL` | clasificación de `legal_area` con IA |
| `SPIJ_LIMIT` / `TC_LIMIT` | tope de documentos nuevos (pruebas) |
| `SPIJ_TIPO` | `NR` (normativa, por defecto) o `JR` (jurisprudencia) |
| `TC_START_MONTH` / `TC_END_MONTH` | rango de meses a recorrer (`YYYY-MM`; por defecto desde `1996-01` hasta el mes actual) |
| `TC_CONCURRENCY` / `TC_DELAY` | concurrencia y delay entre requests del módulo TC |

## Estado / reanudación
Para continuar una corrida interrumpida, vuelve a ejecutar el **mismo comando**:
salta los documentos ya completados (dedupe por `id`) y reanuda desde el checkpoint.
El estado de cada módulo vive en `state/<fuente>_ingest/`
(`ledger.jsonl`, `checkpoint.json`, `scraper.log`). En TC el checkpoint guarda el
mes y la página del recorrido cronológico.
