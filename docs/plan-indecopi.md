# Plan INDECOPI — módulo `indecopi` (P3, segundo de la cola)

> Escrito 2026-07-30. Segundo módulo P3 y primera reutilización del cliente
> gob.pe compartido (`src/services/gobpe`, extraído de tfiscal en este mismo
> cambio — regla del repo: a la segunda fuente, se comparte).

## 1. Reconocimiento

- `indecopi.gob.pe` no responde desde esta red; su **buscador de resoluciones**
  (`servicio.indecopi.gob.pe/buscadorResoluciones/`) está VIVO y sin bot
  manager, pero es un **JBoss Seam/RichFaces (JSF) con estado** (jsessionid +
  ViewState + postbacks AJAX): scrapeable pero frágil. Ahí vive la
  jurisprudencia de las SALAS del Tribunal — queda como **fase 2** (con
  Puppeteer sería más simple que replicar el ViewState).
- **gob.pe** publica las resoluciones institucionales y normas de INDECOPI:
  **~3.064 normas** (`busquedas.json?contenido[]=normas&institucion[]=indecopi`,
  sin término), frescas (hay de 2026), **born-digital** (ningún OCR necesario
  en el smoke) y con PDF en CDN. Además hay 43 colecciones (compendios por
  órgano, paginación HTML `?sheet=N`) — material adicional para la fase 2.

## 2. La v1 (este módulo)

Calca el molde tfiscal sobre el cliente compartido, sin filtro de término
(el filtro por institución basta) y aceptando todo `Rule`:

| Campo | Valor |
| --- | --- |
| `type` | `normative` (resoluciones institucionales/normas, coherente con SPIJ/El Peruano; la jurisprudencia de salas de la fase 2 irá como `jurisprudence`) |
| `document_number` | número verbatim ("000085-2026-GEG/INDECOPI", "Ley 29571") |
| `citation` | `Resolución {nº}, INDECOPI, {fecha}` (sin prefijo si es Ley/Decreto republicado) |
| `issuer_entity_ids` | **fijo**: entidad INDECOPI (nombre completo) del catálogo |
| `legal_area` | IA (Groq) sobre la sumilla |
| `source` | canónico `indecopi` (nombre completo del Instituto, tanda P3) |
| id del ledger | id numérico de gob.pe |

OCR fallback compartido incluido por si el histórico trae escaneados. Sin
checkpoint: barrido completo (~125 páginas) + ledger, como tfiscal.

## 3. Mandos

`--limit n` / `IND_LIMIT` · `IND_MAX_SHEETS` · `IND_DELAY` / `IND_CONCURRENCY`
(ritmo educado 0.4s). Smoke verificado: **12/12 OK, 0 errores** (incluida la
Ley 29571: 166 chunks, 46 páginas).
