# Documentación — arxatec-scrapping

Punto de entrada. Si llegas de cero (o eres una sesión nueva de Claude), lee en
este orden. Todo viaja con git; con leer estos cuatro archivos retomas el contexto
completo.

## Qué es este repo

Scraper de fuentes legales públicas del Perú. Objetivo del equipo: pasar de ~10.000
a **más de 1 millón de documentos** en la base de Arxatec. Arquitectura: **un módulo
por fuente** en `src/modules/`, cada uno arma el **mismo JSON de contrato** y hace
POST al **mismo endpoint** de ingesta del backend `arxatec-lawyer-assistant`. Hoy
existe un módulo funcionando: **SPIJ** (normativa, MINJUS).

## Orden de lectura

| # | Documento | Qué contiene |
| --- | --- | --- |
| 1 | [`estrategia-fuentes.md`](./estrategia-fuentes.md) | **El mapa.** Qué fuentes existen, priorizadas (P0…P5), la decisión de por dónde sale el millón (El Peruano) y por qué. Fuente ≠ emisor. |
| 2 | [`plan-poder-judicial.md`](./plan-poder-judicial.md) | **El próximo módulo (P0).** Análisis técnico del portal del Poder Judicial (árbol, hojas, URLs, paginación, PDFs) + contrato de ingesta detallado (§3.1) + dónde vive el nuevo `src/modules/pj/`. |
| 3 | [`deuda-tecnica.md`](./deuda-tecnica.md) | **Qué arreglar antes de escalar.** Auditoría del código real (scraper + backend) con `archivo:línea`, registro de arreglos aplicados y **las decisiones de Harry** sobre los 4 puntos de contrato. Resuelve el checklist §7 de la estrategia. |
| 4 | [`estado-integracion-legal.md`](./estado-integracion-legal.md) | **El dato de punta a punta** (scraper→assistant→Node→front→IA) a través de los 4 repos: qué funciona, los 2 huecos (vista del front, endpoint de retrieval del chat) con su spec, y el backlog priorizado. |
| 5 | [`anti-bloqueo-scraping.md`](./anti-bloqueo-scraping.md) | **Cómo SPIJ evita el bloqueo y qué ayuda a PJ.** Por qué el sitio de SPIJ coopera y el del PJ no (bot manager Radware: fingerprint + throttle por IP); qué ya tiene PJ (fetch, cookie jar) y qué se añadió (headers de navegación). |
| — | `Fuentes Públicas … RAG.pdf` | El informe original de fuentes (insumo de la estrategia; lo accionable ya está destilado en el doc 1). |

## Estado actual (2026-07-21)

- **Módulo SPIJ operativo** (ingesta normativa); contrato con el backend entendido
  y verificado contra su código; catálogos sincronizados byte a byte con el
  assistant.
- **Deuda técnica del scraper: resuelta lo aplicable** — `type` tipado con union,
  QA de emisor (`ingest.warning`), fallback IA de emisor/área, README reescrito,
  cero `as any`. Las 4 decisiones de contrato están **respondidas por Harry**
  (dedupe = ledger local; `status` = `Vigente` provisional; IA para lo que falte).
  Detalle en `deuda-tecnica.md`.
- **Censo del árbol PJ hecho** (§2.6 del plan): ≥3.046 docs medidos, ~5–8k totales.
- **Módulo `pj` IMPLEMENTADO y validado offline** (subcomando `pj`): crawler BFS +
  parser cheerio + emisor/área deterministas + ingesta reanudable. Typecheck y
  build limpios. Se añadió `cheerio` y se compartió a `src/` el cliente de
  ingesta + contrato + ledger (ver "quinta pasada" en `deuda-tecnica.md`).
- **Siguiente paso:** corrida real end-to-end desde la máquina de desarrollo con
  `INGEST_*` de staging y `PJ_LIMIT=10` (⚠️ IP residencial + ritmo cortés: el
  portal rate-limitea; ver `plan-poder-judicial.md` §5). Luego corrida completa.
- **Regla operativa (de A1):** `state/` es el mecanismo oficial anti-duplicados —
  respaldar `ledger.jsonl` tras cada corrida grande.

## Repos relacionados

- **`arxatec-lawyer-assistant`** — backend Python (FastAPI + RAG) que recibe la
  ingesta (`POST /legal-documents/ingest`). Es la **fuente de verdad** de los
  catálogos que aquí están copiados en `public/data/`.

## Convención del repo (no romper)

Un **módulo por fuente** en `src/modules/<fuente>/`, con su subcomando en
`src/cli.ts`. Solo funciones e interfaces, sin clases. TypeScript ESM con `tsx`.
Cada módulo: config propia, reanudable (ledger + checkpoint en `state/<fuente>/`),
aislado (un módulo roto no tumba el resto).
