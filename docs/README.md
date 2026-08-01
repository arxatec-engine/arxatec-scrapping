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
| 1 | [`registro-scraping.md`](./registro-scraping.md) | **El tablero (doc VIVO).** Las 43 fuentes del Excel `Scraping_Simple.xlsx` con check de cuáles ya tienen módulo, qué comando corre cada una y el orquestador `pnpm all` (entidades siempre primero). Se actualiza al terminar cada módulo. |
| 2 | [`estrategia-fuentes.md`](./estrategia-fuentes.md) | **El mapa.** Qué fuentes existen, priorizadas (P0…P5), la decisión de por dónde sale el millón (El Peruano) y por qué. Fuente ≠ emisor. |
| 3 | [`plan-poder-judicial.md`](./plan-poder-judicial.md) | **El próximo módulo (P0).** Análisis técnico del portal del Poder Judicial (árbol, hojas, URLs, paginación, PDFs) + contrato de ingesta detallado (§3.1) + dónde vive el nuevo `src/modules/pj/`. |
| 4 | [`deuda-tecnica.md`](./deuda-tecnica.md) | **Qué arreglar antes de escalar.** Auditoría del código real (scraper + backend) con `archivo:línea`, registro de arreglos aplicados y **las decisiones de Harry** sobre los 4 puntos de contrato. Resuelve el checklist §7 de la estrategia. |
| 5 | [`estado-integracion-legal.md`](./estado-integracion-legal.md) | **El dato de punta a punta** (scraper→assistant→Node→front→IA) a través de los 4 repos: qué funciona, los 2 huecos (vista del front, endpoint de retrieval del chat) con su spec, y el backlog priorizado. |
| 6 | [`anti-bloqueo-scraping.md`](./anti-bloqueo-scraping.md) | **Cómo SPIJ evita el bloqueo y qué ayuda a PJ.** Por qué el sitio de SPIJ coopera y el del PJ no (bot manager Radware: fingerprint + throttle por IP); qué ya tiene PJ (fetch, cookie jar) y qué se añadió (headers de navegación). |
| 7 | [`catalogo-entidades.md`](./catalogo-entidades.md) | **El catálogo de entidades** (gob.pe → `entity.json`): por qué no tiene ledger, y el orden del pipeline — entidades SIEMPRE antes que los documentos. |
| 8 | [`fuentes-canonicas.md`](./fuentes-canonicas.md) | **Nombres canónicos de `source`** compartidos entre los 3 repos (huella SHA fijada en tests). |
| 9 | [`plan-el-peruano.md`](./plan-el-peruano.md) | **El módulo P1 (hecho).** El Peruano en dos mitades: índice = CSV de datosabiertos (CP850, sin scraping) + texto = `visor_html`; el sitio es intermitente (timeout corto + reintentos) y cómo se llena el contrato. |
| 10 | [`campania-vm.md`](./campania-vm.md) | **La campaña de 2 meses en la VM.** El millón con los módulos validados (TC+EP+SPIJ ≈ 1.15M), supervisor systemd (`ops/`), `--todos`, `pnpm status`, qué se auto-recupera y qué avisar al owner. |
| 11 | [`plan-tribunal-fiscal.md`](./plan-tribunal-fiscal.md) | **El primer P3 (hecho).** El MEF está tras Incapsula pero las RTF viven en gob.pe (buscador JSON + PDF CDN); estreno del OCR local compartido (`src/services/ocr`) para escaneados y la tanda P3 de fuentes canónicas. |
| 12 | [`plan-indecopi.md`](./plan-indecopi.md) | **El segundo P3 (hecho, v1).** INDECOPI vía gob.pe con el cliente compartido `src/services/gobpe`; el buscador Seam de las salas queda como fase 2. |
| 13 | [`plan-tce.md`](./plan-tce.md) | **El tercer P3 (hecho).** Tribunal de Contrataciones (OECE) vía gob.pe: filtro TCP/TCE+sala sobre 85.7k normas; sala en `court_chamber`. |
| 14 | [`plan-sunarp.md`](./plan-sunarp.md) | **El cuarto P3 (hecho, cubre 2 filas).** Tribunal Registral y acuerdos de Pleno (SIP caído) vía gob.pe; sede/Pleno en `court_chamber`. |
| 15 | [`plan-servir.md`](./plan-servir.md) | **El quinto P3 (hecho).** Tribunal del Servicio Civil vía gob.pe (term TSC, formatos de número por época, salas en `court_chamber`). |
| 16 | [`plan-oefa.md`](./plan-oefa.md) | **El sexto P3 (hecho).** TFA vía PUBLICACIONES de gob.pe (cliente generalizado a Report); escaneadas rescatadas por el OCR compartido. |
| 17 | [`plan-reguladores.md`](./plan-reguladores.md) | **La tanda P4 (hecha).** Un módulo, cuatro fuentes (OSINERGMIN/OSIPTEL/SUNASS/OSITRAN, ~51.6k): source y emisor por documento, tanda P4 del catálogo canónico. |
| 18 | [`plan-gobpe.md`](./plan-gobpe.md) | **El stream general de gob.pe (hecho).** 5.1M normas por ventanas de 1 día (tope ~400 hojas), emisor etiquetado, anti-colisión con módulos dedicados y ámbito nacional como grifo. Fuera de `all` por decisión. |
| 19 | [`plan-sunat.md`](./plan-sunat.md) | **SUNAT (hecho el día que revivió su sitio).** Informes/oficios vinculantes 1997→hoy del árbol estático; charset mixto y fecha-piso del año (validación del backend). |
| 20 | [`plan-spley.md`](./plan-spley.md) | **Congreso/SPLEY (hecho).** Proyectos de ley vía la API del portal (lista + expediente AES); estrena status "En revisión" y fija la política de vigencia (determinista por fuente, nunca IA). |
| 21 | [`plan-doctrina.md`](./plan-doctrina.md) | **Doctrina (hecho, cubre 9 filas P5).** Un cosechador OAI-PMH para tesis/artículos jurídicos de repositorios académicos; filtro a lo jurídico, type=doctrine, fuente canónica nueva. |
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
