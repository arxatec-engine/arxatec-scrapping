# Plan Tribunal Fiscal — módulo `tfiscal` (P3, primero de la cola)

> Escrito 2026-07-30 tras el reconocimiento en vivo. Primer módulo de la cola
> P3 (tribunales administrativos) y estreno del **OCR local compartido**.
> Estado en [`registro-scraping.md`](./registro-scraping.md).

## 1. La fuente real NO es el MEF (está blindado)

- `mef.gob.pe` entero está detrás de **Incapsula** (bot manager de Imperva:
  devuelve un challenge JS de 212 bytes — mismo patrón hostil que el Radware
  del PJ). Su app histórica de búsqueda (`apps4.mineco.gob.pe/ConsultaRTF`)
  da 404: fue movida o retirada.
- **Pero las RTF están PUBLICADAS en gob.pe** como normas del MEF, y el
  buscador JSON de la Plataforma del Estado (el MISMO que usa el módulo
  `entidades`) las sirve con todo incluido:

```
https://www.gob.pe/busquedas.json?contenido[]=normas&institucion[]=mef
     &term=tribunal+fiscal&orden=recientes&sheet=N        (25 por página)
```

Cada item `Rule` trae: `name_with_parent` = **número RTF limpio**
("01380-1-2006"), `content` = sumilla, `publication` = fecha,
`action_url` = **PDF original en cdn.www.gob.pe** (sin token, sin Puppeteer)
y `url` → la página estable que usamos de `source_url`. Universo medido:
**~7.7k normas** matchean el término; el filtro por patrón de número RTF
(`\d+-(sala|Q)-\d{4}`) descarta decretos y páginas que solo hablan del
Tribunal. Paginación profunda verificada (sheet=308 responde).

## 2. El hallazgo que definió el módulo: PDFs ESCANEADOS

El lote de gob.pe es el corpus curado "de interés/observancia" (mayormente
2005–2014) y sus PDFs **no tienen capa de texto**: el backend los rechaza con
`400 No extractable text` (comprobado: 12/12 rechazados en el primer smoke).
Es exactamente el riesgo transversal P3 que la estrategia §5 predijo.

**Solución: OCR local compartido** (`src/services/ocr`), estrenado aquí y
reutilizable por el resto de la cola P3:

- `pdftoppm` (poppler) rasteriza a PNG 300dpi + **tesseract.js** (WASM `spa`,
  sin binarios de sistema; traineddata cacheado en `state/ocr/`).
- Flujo: se intenta el PDF original → si el backend responde "No extractable
  text", OCR → PDF de texto renderizado con Puppeteer → reingesta. El escaneo
  original queda enlazado por `source_url`, y el ledger marca
  `warning: "texto por OCR local"` (auditable con `pnpm status` / grep).
- Verificado: 12/12 RTF escaneadas ingestadas con 3–19 chunks y emisor
  enlazado.
- **Dependencia de sistema**: `pdftoppm` (paquete `poppler-utils`) — añadirlo
  al aprovisionar la VM de campaña.

## 3. Cómo se llena el contrato

| Campo | Valor |
| --- | --- |
| `type` | `jurisprudence` (jurisprudencia administrativa, mismo trato que PJ/TC) |
| `document_number` | número RTF verbatim ("02077-Q-2014") |
| `citation` | `RTF {nº}, Tribunal Fiscal, {fecha corta}` |
| `court_chamber` | del propio número: token central numérico → "Sala N"; `Q` → "Oficina de Atención de Quejas" |
| `issuer_entity_ids` | **fijo**: entidad "Tribunal Fiscal" del catálogo, resuelta por nombre normalizado al arrancar (falla ruidosamente si faltara) |
| `legal_area` | IA (Groq) sobre la sumilla; la mayoría cae en tributario/constitucional |
| `source` | `Tribunal Fiscal` (canónico `tfiscal` de la tanda P3, huella `553994ae…` en los 3 repos) |
| `source_url` | `https://www.gob.pe/institucion/mef/normas-legales/{id}-{nº}` |
| id del ledger | id numérico de gob.pe (único por publicación) |

Sin checkpoint de cursor: como `entidades`, cada corrida barre el buscador
completo (~310 páginas, minutos) y el ledger es la memoria.

## 4. Mandos y escala

| Mando | Efecto |
| --- | --- |
| `--limit n` / `TF_LIMIT` | tope de documentos nuevos (pruebas) |
| `TF_TERM` | término del buscador (default "tribunal fiscal") |
| `TF_MAX_SHEETS` | tope de páginas del buscador (0 = todas) |
| `TF_DELAY` / `TF_CONCURRENCY` | ritmo educado con gob.pe (default 0.4s / 2) |

Escala: ~7.7k en gob.pe (el archivo histórico completo del Tribunal, ~200k,
vive solo detrás de Incapsula — fuera de alcance por ahora; las RTF de
observancia obligatoria NUEVAS llegan igual por El Peruano, dedupe
cross-fuente pendiente como en el resto). Ritmo real medido con OCR:
~20–60 s por RTF escaneada (el OCR domina).

## 5. La tanda P3 de fuentes canónicas (cambio cross-repo, hecho)

Al ser la primera fuente P3 se registraron TODAS las de la cola de una vez
(una sola rotación de huella): Tribunal Fiscal · INDECOPI (nombre completo) ·
Tribunal de Contrataciones del Estado · Tribunal Registral · Tribunal del
Servicio Civil · Tribunal de Fiscalización Ambiental · SUNAT (nombre
completo). Huella nueva `553994ae…` fijada en los tests de scrapping,
assistant (`feat/p3-sources-catalog`) y platform (`feat/p3-sources-catalog`).
