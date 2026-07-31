# Plan SUNAT — módulo `sunat` (informes y oficios vinculantes)

> Escrito 2026-07-31, el día que www.sunat.gob.pe revivió (estuvo caído el
> 30-jul y la fila quedó bloqueada con evidencia). Cubre la fila "SUNAT –
> resoluciones e informes"; la fila "legislación" queda evaluada (ver §4).

## 1. La fuente

Árbol estático noventero `www.sunat.gob.pe/legislacion/oficios/{año}/indcor.htm`
(frameset + tablas). **Publica desde 1997 HASTA HOY**: el índice-frameset
viejo solo lista hasta 2010, pero los años nuevos existen por URL (verificado
2015/2020/2024/2025). Ítems modernos = **PDF directo**
(`informe-oficios/i000131-2025-7T0000.pdf`); años viejos = página `.htm` que
se renderiza a PDF con Puppeteer (patrón SPIJ). Charset mixto: UTF-8 moderno,
latin-1 antiguo → decode UTF-8 estricto con fallback latin-1 (cazado en el
smoke: decodificar al revés produce "Â°").

## 2. El módulo

| Campo | Valor |
| --- | --- |
| Barrido | años reciente-primero (`SUNAT_ANIO_DESDE=1997` → actual); un 404 de año = se salta |
| `document_number` | número verbatim ("000131-2025-SUNAT/7T0000") |
| `type` | `normative` (interpretación oficial tributaria; decisión provisional) |
| `citation` | `Informe {nº}, SUNAT ({año})` |
| **Fechas** | el índice solo da el AÑO y el backend EXIGE al menos una fecha (validación cazada en el smoke) → `published_at = {año}-01-01` (precisión anual; la cita muestra solo el año, no un día inventado) |
| `issuer_entity_ids` | **fijo**: SUNAT (sigla → fallback nombre completo) |
| `source` | canónico `sunat` (ya existía de la tanda P3 — sin rotación de huella) |
| id del ledger | nombre de archivo sin extensión |

OCR fallback compartido para PDFs viejos escaneados. En `pnpm all` SÍ entra
(corpus acotado; el ledger hace baratas las pasadas).

## 3. Mandos y verificación

`--limit n` / `SUNAT_LIMIT` · `SUNAT_ANIO_DESDE`/`SUNAT_ANIO_HASTA` ·
`SUNAT_DELAY` / `SUNAT_CONCURRENCY`.
Smoke verificado: **10/10 OK** (informes 2026 born-digital, 4–8 páginas,
emisor enlazado). El primer intento cazó los 2 bugs de contrato (charset y
fecha obligatoria) — arreglados y re-verificados.

## 4. Lo que queda fuera (documentado)

- **`superin/`** (resoluciones de superintendencia 1994–hoy): OMITIDAS a
  propósito — ya fluyen por El Peruano/SPIJ (dedupe cross-fuente diferido).
- **Fila "SUNAT – legislación"** (compilación tributaria concordada,
  `.tributaria/`): son las MISMAS normas que ya entran por SPIJ/El Peruano;
  su valor añadido (concordancias/vigencias) es el problema `status` global
  diferido por Harry. Queda evaluada, no bloqueada.
