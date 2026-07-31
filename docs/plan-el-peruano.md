# Plan El Peruano — módulo `elperuano` (P1, la fuente del millón)

> Escrito 2026-07-30 tras el reconocimiento en vivo de los endpoints. Es el
> análisis técnico del módulo `src/modules/elperuano/`, hermano de
> `plan-poder-judicial.md`. Estado en [`registro-scraping.md`](./registro-scraping.md).

## 1. Arquitectura de la fuente (verificada en vivo)

El Peruano se scrapea en DOS mitades que se complementan:

1. **El índice NO se scrapea — se descarga.** El dataset **"Dispositivos
   Legales"** de datosabiertos.gob.pe (publicado por el propio diario) trae un
   CSV por mes desde 2013 hasta la actualidad con TODO lo que el buscador
   mostraría: `Fecha Publicación, OP, Entidad, Dispositivo, Número, Sumilla,
   Link, Fecha Corte`. Es la ruta P1b de la estrategia: id + emisor + sumilla
   sin tocar el sitio hostil.
   - Dataset: `https://www.datosabiertos.gob.pe/dataset/dispositivos-legales`
   - Archivo típico: `/sites/default/files/DatosAbiertos_Periodo_20250201_20250228.csv`
   - ~1.000–2.000 dispositivos/mes. **Encoding CP850** (DOS): `¢`→ó, `£`→ú,
     `ø`→° al leerlo como latin-1; el módulo lo decodifica con tabla propia.
   - El CSV NO usa comillas. Si una sumilla contiene comas, el split simple se
     rompe → el parser ancla el campo `Link` (empieza con `http`) y re-une la
     sumilla entre `Número` y `Link`.
2. **El texto por documento**: `https://busquedas.elperuano.pe/api/visor_html/{OP}`
   devuelve un HTML autocontenido con el texto COMPLETO de la norma (sin OCR,
   ~7–10 KB). El `OP` es la columna del CSV (ej. `2375814-1`). La página humana
   es `https://busquedas.elperuano.pe/dispositivo/NL/{OP}` (server-rendered) y
   sirve de `source_url` estable.

**PDF nativo, pospuesto:** la página del dispositivo enlaza
`/api/archivo/file/<token>/*/{OP}.PDF`, pero el token es firmado por request
(habría que bajar la página completa de 117 KB por doc en un sitio inestable).
v1 usa el patrón SPIJ: HTML del visor → PDF local con Puppeteer (texto 100 %
extraíble, `pages_with_text` siempre > 0). El PDF original del diario queda
como mejora futura si el producto lo pide.

## 2. El sitio es INTERMITENTE (no es fingerprint)

Verificado 2026-07-30: `busquedas.elperuano.pe` alterna respuestas en 0.1–0.2 s
con cuelgues de >60 s y 404/200-vacío espurios, **también con Chrome real**
(Puppeteer tardó >90 s en cargar la home) — es infraestructura degradada del
lado del diario, no un bot manager como Radware. Consecuencia de diseño:

- `fetch` (undici) con **timeout corto (15 s) y hasta 6 reintentos** con
  backoff suave: cazar el nodo bueno en vez de esperar al malo.
- El ledger hace cada corrida reanudable: un cuelgue no pierde nada.
- datosabiertos.gob.pe (el CSV) es estable — la parte frágil queda acotada a
  1 request por documento.

## 3. Cómo se llena el contrato

| Campo | Valor | Origen |
| --- | --- | --- |
| `type` | `normative`; `jurisprudence` si `Dispositivo` contiene SENTENCIA/CASACION | columna `Dispositivo`. Coherente con SPIJ: las resoluciones entran como `normative` |
| `title` | Sumilla del CSV (más completa y humana que el `<title>` del visor) | CSV |
| `document_number` | columna `Número` ("N° 042-2025-PCM") | CSV |
| `issuer_entity_ids` | pipeline SPIJ: `classify(Entidad)` determinista → sigla única → `bestEntityInText(Entidad + título)` → IA Groq entre candidatos | columna `Entidad` (nombre de sector: "AMBIENTE", "PRESIDENCIA DEL CONSEJO DE MINISTROS") |
| `legal_area`/`subarea` | `analizarNorma` (Groq) sobre sumilla + texto del visor, catálogo cerrado de `legal_areas.json` | compartido con spij/tc |
| `citation` | `"{título}, {fecha corta}"` (patrón normativa de SPIJ); sala/distrito `null` | CSV |
| `published_at`/`effective_date` | `Fecha Publicación` DD/MM/YYYY → ISO | CSV |
| `source` | `Diario Oficial El Peruano` (canónico `el_peruano`, YA en los 3 repos — huella intacta) | catálogo `src/services/sources` |
| `source_url` | `https://busquedas.elperuano.pe/dispositivo/NL/{OP}` (única y estable → uuid5 del backend dedupea) | CSV/constante |
| `keywords` | `[Dispositivo, Entidad, Número]` | CSV |
| PDF | visor_html → `render.buildHtml` + Puppeteer (como SPIJ) | visor |

Id del ledger = `OP` (único por dispositivo publicado).

## 4. Mandos de control

| Mando | Efecto |
| --- | --- |
| `--limit n` / `EP_LIMIT` | tope de documentos NUEVOS (pruebas) |
| `EP_PERIODO` | `YYYY-MM`: elegir el CSV mensual del dataset (default: el más reciente publicado) |
| `EP_CSV_URL` | URL directa de un CSV (salta el descubrimiento en datosabiertos) |
| `EP_CONCURRENCY` / `EP_DELAY` | paralelismo (default 2) y pausa entre requests al visor |

Estado en `state/elperuano_ingest/` (`ledger.jsonl` + `scraper.log`).
Reanudable: re-ejecutar el mismo comando salta lo ya ingestado y reintenta lo
pendiente (`finalize` con 4 pasadas, patrón SPIJ).

## 5. Escala y camino al millón

- El dataset publica desde 2013: **~12 años × ~1.5k/mes ≈ 200k+ documentos**
  accesibles con este mismo módulo iterando `EP_PERIODO` (el recurso
  2013–mar-2022 viene en un solo CSV grande).
- El histórico pre-2013 (hasta 1904) exigiría el buscador JSON del sitio —
  mejora futura, no bloquea el volumen de seis cifras.
- **Actualización continua HECHA (`--cuadernillo`)**: el boletín oficial diario (`/cuadernillo/NL/{YYYYMMDD}` → un PDF con toda la normativa del día) se ingesta como 1 documento/día (id `cuadernillo-YYYYMMDD`, reanudable). Cubre el rezago del dataset. `--dias n` mira los últimos n días; agendarlo (cron/campaña) es el job diario.
- **Actualización continua (contexto original)** (fila "Job diario El Peruano" del registro): el
  dataset publica con rezago (~meses); para el día a día está el cuadernillo
  (`/cuadernillo/NL/{YYYYMMDD}`) — módulo/cron aparte cuando toque.
- Riesgo de duplicados cross-fuente (la misma norma en SPIJ y El Peruano, con
  `source_url` distinto = document_id distinto): conocido y aceptado por Harry
  (dedupe cross-fuente se retoma al escalar; el ledger solo dedupea intra-módulo).

## 6. Reuso (nada de scrapers sueltos)

Comparte con los módulos existentes: clasificador de entidades y catálogo de
áreas de `spij/utils` (precedente: `tc` ya los importa), `analizarNorma` de
`src/services/llm`, `elegirEntidad` de `spij/services/llm` (la unificación de
los dos servicios LLM sigue siendo deuda registrada), cliente de ingesta
`src/services/assistant`, `src/utils` (render, store/ledger, text, dates,
throttle). Solo es nuevo: lector del dataset de datosabiertos, decodificador
CP850, parser del CSV y el fetch resiliente del visor.
