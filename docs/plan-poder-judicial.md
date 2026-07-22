# Scraper PJ — Jurisprudencia Sistematizada (Poder Judicial)

> Documento de traspaso y plan técnico. Contiene todo lo investigado hasta ahora
> (2026-07-21) sobre el sitio del Poder Judicial y la propuesta de dónde y cómo
> vive este scraper dentro del repo. Sirve para retomar el trabajo desde cero en
> cualquier máquina o sesión.

## 1. Contexto de la tarea

Objetivo del equipo: pasar de ~10.000 a **más de 1 millón de documentos legales**
en la base de datos de Arxatec, vía web scraping de fuentes públicas peruanas.

Los documentos legales se agrupan en tres familias:

| Familia | Qué es | Fuente | Estado |
| --- | --- | --- | --- |
| **Normativa** | Leyes, decretos, resoluciones (las reglas) | SPIJ (MINJUS) | ✅ Ya cubierto por `src/modules/spij/` |
| **Jurisprudencia** | Decisiones de jueces: casaciones, acuerdos plenarios, ejecutorias | **Poder Judicial** (este plan) + Tribunal Constitucional | 🔨 Esta tarea |
| **Actuación administrativa** | Resoluciones de tribunales administrativos (SUNAT, INDECOPI…) | Varias | Pendiente |

Enlace objetivo (confirmado en Slack — **NO** usar `cej.pj.gob.pe`, ese es el
expediente electrónico y no sirve para recolección masiva):

- Raíz: `https://www.pj.gob.pe/wps/wcm/connect/cij-juris/s_jurisprudencia_sistematizada`
- Interfaz nueva: `https://pj.gob.pe/wps/wcm/connect/cij-juris/s_cij_jurisprudencia_nuevo/as_jurisprudencia_sistematizada/`

## 2. Cómo está construido el sitio del PJ (hallazgos)

Portal **IBM WebSphere Portal / Web Content Manager (WCM)**. HTML renderizado en
servidor. **Sin login, sin captcha, sin JavaScript necesario.** Se scrapea con
HTTP GET + parseo de HTML (no requiere Puppeteer para navegar).

### 2.1 Árbol de categorías (profundidad variable, 2–4+ niveles)

```
s_jurisprudencia_sistematizada  (índice raíz)
├── Jurisprudencia Uniforme      → 7 materias (civil, constitucional, contencioso,
│                                  familia, laboral, penal, previsional)
│                                  → temas (ej. "Posesión Precaria")  [HOJA]
├── Ejecutorias Vinculantes      → 6 materias  [hojas]
├── Ejecutorias Relevantes       → 9 materias  [hojas]
├── Acuerdos Plenarios           → 4 tipos → años (2005–2022)  [hojas]  ← ¡un nivel más!
├── Control Difuso               → 22 derechos/principios  [hojas]
├── Resoluciones Sala Penal Nacional / Sala Penal Especial
└── Boletín Jurisprudencial, Justicia Intercultural…
```

⚠️ La profundidad **no es fija** (Acuerdos Plenarios mete un nivel extra por año).
El crawler debe ser **recursivo/BFS**: clasificar cada página como *índice*
(solo enlaces a subcategorías) u *hoja* (tabla de documentos) según su contenido,
no según su profundidad.

### 2.2 Páginas hoja (donde están los documentos)

Cada hoja tiene: título del tema, un párrafo de doctrina/criterio (sumilla del
tema, no del documento), "Base Legal", y una **tabla de sentencias** con:

| Campo | Ejemplo |
| --- | --- |
| Número de Recurso | `001061-2011` |
| Distrito de Procedencia | `Lima Norte` |
| Sala Suprema | `Sala Civil Permanente` |
| Fecha de Resolución | `26-ene-2012` (formato `dd-mmm-aaaa` en español) |
| Descargar | icono → enlace directo al PDF |

Paginación: **10 items por página** ("Página 1 de N").

### 2.3 Patrones de URL (verificados en vivo)

**PDF** (patrón WCM estándar, descarga directa sin auth):
```
/wps/wcm/connect/<HASH>/<nombre-archivo>.pdf?MOD=AJPERES&CACHEID=<HASH>
```
Ejemplo real:
```
/wps/wcm/connect/1c2529004066c15d8381df95cb2bb342/5707-2011+Desalojo+OP.pdf?MOD=AJPERES&CACHEID=1c2529004066c15d8381df95cb2bb342
```

**Paginación**:
```
<url-de-la-hoja>/?WCM_PI=1&WCM_Page.<PORTLET_ID>=<n>
```
Ejemplo real:
```
...as_PosesionPrecaria/?WCM_PI=1&WCM_Page.a74c2680406a4c7b9deadd99ab657107=2
```
⚠️ **El `PORTLET_ID` cambia en cada página hoja.** No se puede construir la URL
de la página N a mano: hay que **extraer el enlace "siguiente" del HTML** de cada
página. Este es el único truco real del sitio.

### 2.4 Contenido de los PDFs

Son las resoluciones completas (ej. `CASACIÓN N° 1061-2011, LIMA NORTE`, Sala
Civil Permanente, 8 páginas). El texto verificado es texto real seleccionable en
los ejemplos vistos, pero **hay riesgo de PDFs escaneados** en documentos
antiguos → contemplar OCR o marcar como pendiente si no se extrae texto.

### 2.5 Accesibilidad de red — ✅ VERIFICADA (2026-07-21, máquina de desarrollo)

- ✅ **Desde la máquina de desarrollo funciona con `curl` puro**: la raíz de
  jurisprudencia sistematizada responde `HTTP/2 200` con ~74 KB de HTML que
  contiene el árbol completo (Jurisprudencia Uniforme, Ejecutorias Vinculantes,
  Acuerdos Plenarios, Control Difuso; 208 hrefs). **No hace falta Puppeteer para
  navegar** — con User-Agent de navegador real + **cookie jar** alcanza.
- Detalle: hay un bot manager (Radware; cookies `__uzm*`) delante del portal.
  Hoy es permisivo, pero implica: (1) mantener el cookie jar entre requests,
  (2) User-Agent realista, (3) ritmo humano (delay entre requests), (4) si algún
  día bloquea, el fallback Puppeteer sigue disponible (ya es dependencia).
- (El dato anterior de que "no conecta" era desde el sandbox de Claude Code, que
  sí filtra IPs de datacenter; irrelevante para producción del scraper.)

### 2.6 Escala estimada — MEDIDA (censo 2026-07-21)

Se corrió un **censo exploratorio** del árbol (BFS, sin ingestar nada) que topó en
250 páginas visitadas con **144 nodos aún en cola**. En esa porción parcial:

- **244 hojas** con documentos, **≥3.046 documentos** (estimación conservadora:
  el heurístico asumía 10 ítems/página, pero las hojas traen ~20 → el real es
  bastante mayor). Con los 144 nodos sin visitar, el total razonable ronda
  **5.000–8.000+ documentos**.
- Distribución por categoría (porción visitada): Resoluciones Relevantes ~1.268,
  Jurisprudencia Uniforme ~1.076, Control Difuso ~408, Ejecutorias Vinculantes
  ~90, Boletín ~84, Acuerdos Plenarios ~36, Salas Penales especiales ~66.
- **Paginación confirmada**: hay hojas de hasta 9 páginas (~20 docs/página).

Sigue siendo jurisprudencia **curada** (miles, no millones): es la primera fuente
de jurisprudencia y valida el pipeline de punta a punta; el millón saldrá de sumar
fuentes (PJ + Tribunal Constitucional + El Peruano + otras). El TC (~10.000
expedientes con "Ver PDF") queda como siguiente módulo de jurisprudencia.

## 3. Cómo funciona el repo hoy (para quien llega de cero)

Arquitectura: **un módulo por entidad scrapeada** bajo `src/modules/`, con un
subcomando CLI por módulo (`src/cli.ts` usa commander; su descripción literal:
"Scraper de entidades jurídicas: un subcomando por entidad"). Solo funciones e
interfaces, sin clases. TypeScript ESM ejecutado con `tsx`.

Flujo del módulo SPIJ existente (referencia a imitar):

```
cli.ts (subcomando "spij")
  → config()            src/modules/spij/config/       .env → objeto Config
  → run(cfg, log)       src/modules/spij/run/          orquestador:
      1. reanudación: lee ledger.jsonl + checkpoint.json (state/spij_ingest/)
      2. autentica contra SPIJ, carga catálogos (public/data/*.json)
      3. pagina resultados por cursor; semáforo de concurrencia
      4. por cada doc → ingest.ingestOne():
           a. classifier.classify()  → entidad emisora (determinista, sin IA)
           b. descarga contenido (HTML en SPIJ)
           c. classifyLegalArea()    → services/llm (Groq) elige subárea del
              catálogo cerrado public/data/legal_areas.json
           d. buildMetadata()        → JSON del contrato
           e. render.renderPdf()     → Puppeteer HTML→PDF (SPIJ no da PDF)
           f. ingestRequest()        → POST multipart al endpoint de ingesta
      5. graba resultado en ledger; checkpoint por página
      6. finalize(): hasta 4 pasadas de reintento de pendientes
      7. resumen final (COMPLETO / PAUSADO — reanudable con el mismo comando)
```

### 3.1 Contrato del endpoint de ingesta (el mismo para todos los módulos)

- `POST {INGEST_BASE_URL}/legal-documents/ingest` (path configurable `INGEST_PATH`)
- Header: `x-assistant-token: {INGEST_TOKEN}`
- Body `multipart/form-data`:
  - `metadata`: **string** JSON (¡como campo de texto, NO como Blob — si va como
    Blob el backend responde 422!)
  - `file`: el PDF (`application/pdf`)
- El backend sube a S3, indexa en BD relacional y Qdrant. Respuesta 200:
  `data.{document_id, indexed_chunks, pages_with_text, linked_entities, linked_relations}`
- Semántica de estados (ver `services/assistant/index.ts`): 400/404/409/422 =
  error permanente (no reintentar); 401/403 = token mal (abortar corrida);
  429/5xx = reintentar con backoff.

Campos del `metadata` (ver `utils/metadata/index.ts` y `types/`):

```jsonc
{
  "country": "PE",
  "type": "jurisprudence",        // ← SPIJ manda "normative"; PJ mandará esto
  "title": "...",
  "document_number": "001061-2011",
  "jurisdiction": "PE",
  "legal_area": "...", "subarea": "...",
  "legal_area_id": "...", "legal_subarea_id": "...",   // de legal_areas.json
  "source": "PJ",                 // SPIJ manda "SPIJ" (env INGEST_SOURCE)
  "source_url": "https://...",
  "status": "Vigente",
  "version": 1,
  "language": "es",
  "published_at": "...", "effective_date": "...",
  "keywords": [], "concepts": [], "references": [],
  "issuer_entity_ids": ["<uuid de entity.json>"]
}
```

## 4. Propuesta: dónde vive el nuevo scraper y por qué es otro módulo

**Nuevo módulo `src/modules/pj/`**, hermano de `src/modules/spij/`, con
subcomando `pj` en `src/cli.ts`. Es otro módulo (y no código dentro de spij)
porque el repo está diseñado como *un subcomando por entidad-fuente*, y las
mecánicas difieren:

| | SPIJ | PJ jurisprudencia |
| --- | --- | --- |
| Obtención | API JSON con auth (back + solr) | Crawling HTML sin auth |
| Paginación | cursor numérico en API | enlace "siguiente" con portlet ID variable |
| Contenido | HTML → renderizar PDF con Puppeteer | **PDF ya listo** (descarga directa) |
| Clasif. emisor | sector → classifier determinista | fijo/casi fijo: "Poder Judicial" / "Corte Suprema de Justicia de la República" (ambos **ya existen** en `public/data/entity.json`; se puede afinar por Sala) |
| Clasif. área | IA sobre sumilla/HTML | la ruta del árbol da materia gratis (civil/penal/laboral…); IA solo para afinar subárea |
| `type` | `normative` | `jurisprudence` |

Estructura propuesta (espejo de spij):

```
src/modules/pj/
├── index.ts
├── config/index.ts        env PJ_* → Config (state/pj_jurisprudencia/)
├── constants/index.ts     BASE_URL, raíz del árbol, selectores, User-Agent
├── types/index.ts         PjDoc { recurso, distrito, sala, fecha, pdfUrl, rutaArbol[] }
├── services/
│   └── pj/index.ts        fetchPage(url), descarga de PDFs (axios + retry)
├── utils/
│   ├── crawler/index.ts   BFS del árbol; clasifica índice vs hoja; sigue
│   │                      paginación extrayendo el enlace "siguiente" del HTML
│   ├── parse/index.ts     HTML hoja → items (tabla) + sumilla del tema + base legal
│   ├── metadata/index.ts  buildMetadata versión PJ (type=jurisprudence, source=PJ)
│   └── ingest/index.ts    descargar PDF → clasificar → POST (calca spij/utils/ingest)
└── run/index.ts           orquestador con reanudación (calca spij/run)
```

**Se reutiliza tal cual** (ya es genérico en `src/utils/` y `src/modules/spij/utils/store`):
throttle/reintentos HTTP, logging, stats, ledger/checkpoint (mover `store` a
`src/utils/` si hace falta compartirlo), semáforo, catálogos `public/data/`.

**Nota sobre parseo HTML**: el repo no tiene parser HTML (spij consume JSON).
Opciones: `cheerio` (recomendado, liviano) o regex sobre el HTML WCM (frágil).
Añadir `cheerio` como dependencia.

**Nota sobre texto para la IA**: SPIJ clasifica con el HTML de la norma; PJ solo
tiene PDF. Para darle texto al LLM: extraer texto del PDF (p.ej. `pdf-parse` /
`pdfjs-dist`, primeras páginas bastan) o usar solo sumilla del tema + ruta del
árbol (más barato; la materia ya viene dada por el árbol). Decidir en implementación.

Variables de entorno nuevas (mismo patrón que `SPIJ_*` en `src/constants/env/`):
`PJ_LIMIT`, `PJ_CONCURRENCY`, `PJ_DELAY`, `PJ_UA`; reutiliza `INGEST_*`,
`GROQ_API_KEY`, `LLM_MODEL`. `INGEST_SOURCE=PJ` para este módulo (ojo: hoy es
config global con default "SPIJ"; el módulo PJ debe fijar su propio default).

Estado/reanudación: `state/pj_jurisprudencia/{ledger.jsonl, checkpoint.json, scraper.log}`.
Dedupe por id natural. **Decisión de implementación:** el id es la **URL del PDF**
(lleva el hash WCM, única por archivo), no `recurso|sala` — porque en Control
Difuso la 3a columna es la norma inaplicada, no la Sala, y `recurso` puede
colisionar entre secciones; la URL del PDF dedupea por archivo sin falsos
positivos y captura el mismo documento re-listado en varios temas. El árbol se
re-crawlea barato en cada corrida; la reanudación la da el ledger (dedupe por doc).

## 5. Estado actual y próximos pasos

Hecho:
- [x] Análisis del sitio PJ (árbol, hojas, patrones de URL, paginación, PDFs)
- [x] Entendido el contrato de ingesta y el flujo del módulo SPIJ
- [x] Confirmado que "Poder Judicial" y "Corte Suprema" existen en `entity.json`
- [x] Este documento
- [x] **Acceso a `pj.gob.pe` verificado desde la máquina de desarrollo** (§2.5:
      curl + cookie jar + UA de navegador; sin Puppeteer)
- [x] Contrato verificado contra el código del assistant y decisiones de Harry
      registradas (ver `deuda-tecnica.md`): camino libre
- [x] **Censo del árbol** (§2.6): ≥3.046 docs medidos, ~5–8k estimados totales
- [x] **`cheerio` añadido** (`pnpm add cheerio`) — parser de HTML del WCM
- [x] **Módulo `src/modules/pj/` IMPLEMENTADO** (subcomando `pj` en el CLI):
      crawler BFS (índice/hoja/híbrido, paginación WCM 1-indexada), parser cheerio
      (filtra chrome por nº de recurso, tolera columnas variables por sección),
      emisor constante + área por materia del árbol (sin IA), metadata del
      contrato, ingesta reanudable con ledger + warnings. Espeja a SPIJ.
- [x] **Validado offline** contra HTML real (parse, área, metadata, paginación,
      fechas en 3 formatos): typecheck limpio, pipeline correcto.

Pendiente (orden sugerido):
1. **Corrida real end-to-end desde la máquina de desarrollo** con `INGEST_*` de
   staging y `PJ_LIMIT=10`, revisando `linked_entities` y `pages_with_text`.
   ⚠️ Debe correr desde IP residencial/oficina y con ritmo cortés: el portal
   tiene bot manager (Radware) que **rate-limitea tras uso intenso** — durante el
   desarrollo, tras el censo (250 páginas) + pruebas, empezó a devolver timeouts.
   No es bug del scraper (retries + cookie jar + delay ya están); es la razón por
   la que el plan pide red residencial.
2. Corrida completa (sin `PJ_LIMIT`): ~5–8k docs; respaldar `state/` al terminar.
3. Siguiente fuente: Tribunal Constitucional (~10k expedientes, "Ver PDF").

Preguntas abiertas — RESPONDIDAS (Harry por Slack + auditoría del backend,
2026-07-21; detalle en `deuda-tecnica.md`):
- ~~¿`source` para PJ?~~ → texto libre en el backend; el módulo fija `"PJ"`
  como constante propia.
- ~~¿`status` para jurisprudencia?~~ → provisional **`"Vigente"`** (vocabulario
  único de producción hasta que se resuelva el problema de vigencias; es el
  único valor que los filtros actuales encuentran — ver `deuda-tecnica.md` A2).
- ~~¿Sumilla del tema o generada?~~ → **no hace falta mandar sumilla**: el
  backend la genera con LLM on-demand desde los chunks
  (`legal_documents/summary/`). La sumilla del tema puede ir en
  `keywords`/`concepts` para no perderla.
- ¿Hay que scrapear también Boletín Jurisprudencial / Justicia Intercultural?
  → única que sigue abierta; no bloquea (son secciones extra del mismo árbol,
  se pueden sumar después).
