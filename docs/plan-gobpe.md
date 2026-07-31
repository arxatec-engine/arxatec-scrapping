# Plan gob.pe — módulo `gobpe` (el stream general de normas, 5.1M)

> Escrito 2026-07-30. El módulo grande que quedaba (decisión del owner: "al
> final"). Cubre 2 filas: "gob.pe – normas por entidad" y "Polling gob.pe"
> (el modo incremental ES el poll cuando se agenda).

## 1. Los 3 hechos del recon que definen el diseño

1. El stream global (`busquedas.json?contenido[]=normas`, 5.169.501 normas)
   SOLO devuelve normas con **ventana de fechas** (sin ella salen colecciones).
2. **La paginación topa en ~400 hojas** (sheet=400 responde; 1000 da error) →
   imposible el barrido plano; se recorre por **ventanas de 1 día**,
   reciente-primero (a ritmo nacional un día cabe de sobra en 400×25).
3. Cada item trae la **entidad etiquetada** (`content_sub_title_card`:
   "SIGLA - Nombre completo") + PDF en CDN → emisor por el matcher existente
   (sigla única → nombre exacto → texto → IA), sin catálogo extra.

## 2. Las 2 reglas de convivencia (lo delicado del módulo)

- **Anti-colisión con módulos dedicados**: un doc de gob.pe ya ingestado por
  tfiscal/tce/sunarp/etc. comparte `source_url` → re-ingestarlo aquí lo
  SOBREESCRIBIRÍA con la fuente genérica. Defensa doble: (a) exclusión por
  slug de los streams cubiertos completos (indecopi + 4 reguladores);
  (b) todo gid presente en los ledgers de los 10 módulos gob.pe dedicados es
  INTOCABLE (se cargan al arrancar).
- **Ámbito nacional por defecto** (`GOBPE_AMBITO=nacional`): tras resolver el
  emisor, si su grupo es "Gobiernos Regionales"/"Gobiernos Locales" el doc se
  salta (contador en el resumen). La pregunta abierta de Harry sobre
  ordenanzas queda como grifo (`GOBPE_AMBITO=todos`), no como bloqueo.

## 3. Contrato

`type=normative` (jurisprudence si el número/sumilla trae SENTENCIA/CASACIÓN),
`source` = **"Plataforma Digital Única del Estado Peruano"** (fuente canónica
nueva `gobpe`, huella `75afe143…` en los 3 repos — espejos ya en main),
citation = título legal + fecha (patrón normativa), `document_number` =
número verbatim, área por IA sobre la sumilla, OCR fallback compartido.

## 4. Modos y mandos

| Modo | Cómo |
| --- | --- |
| **Incremental (default)** — el "polling" | `pnpm gobpe` → últimos `GOBPE_DIAS=7` días. Agendado (cron/campaña) mantiene el corpus al día |
| **Backfill** | `pnpm gobpe --desde 2020-01-01 --hasta 2020-12-31` → itera día a día, reanudable por ledger |
| Smoke | `pnpm gobpe --limit 10 --dias 3` |

`GOBPE_AMBITO` · `GOBPE_EXCLUIR` (slugs) · `GOBPE_MAX_SHEETS` ·
`GOBPE_DELAY`/`GOBPE_CONCURRENCY`.

**⚠ NO corre en `pnpm all`** (decisión del owner: gob.pe va al final). Cuando
se decida sumarlo a la campaña: añadirlo a `DOC_SCRAPERS` en `src/cli.ts` (1
entrada) — el modo incremental hace que cada pasada del supervisor sea barata.

## 5. Verificación (smoke 2026-07-30)

**10/10 OK** (ventana de 3 días, ámbito nacional): 2 fallos transitorios del
CDN recuperados por `finalize`, 1 doc omitido por ámbito, emisores resueltos
(fuzzy/exact) incluidos programas nacionales (MIDIS-PNPAIS) y zonas
registrales de SUNARP (que NO colisionan con el módulo del Tribunal
Registral: filtro + anti-colisión por gid). Payload en Qdrant con la fuente
canónica nueva y emisor enlazado.
