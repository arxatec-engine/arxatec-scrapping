# Registro de scraping — qué tenemos, qué falta y cómo se corre

> **Documento VIVO.** Fuente: `Scraping_Simple.xlsx` (raíz del repo, 43 fuentes)
> cruzado con la priorización de [`estrategia-fuentes.md`](./estrategia-fuentes.md).
> Al terminar un módulo: marcar ✅ en su fila, anotar el comando real y actualizar
> el contador de avance. Este doc sustituye al contador del Excel como tablero.
>
> **Regla de oro operativa:** `entidades` corre **SIEMPRE primero** — el backend
> solo vincula emisores cuyos ids ya existan en su Postgres
> ([`catalogo-entidades.md`](./catalogo-entidades.md) §3). El orquestador
> `pnpm all` ya respeta ese orden.

## Avance

**18 de 42 fuentes scrapeables listas** · 1 excluida por decisión (CEJ).
Última actualización: **2026-07-30** (módulo `gobpe`: el stream de 5.1M, smoke 10/10).

**Decisiones del owner (2026-07-30):**
- **Campaña VM 2 meses** con los módulos ya validados (TC + El Peruano + SPIJ
  ≈ 1.15M docs = la meta del millón): supervisor systemd + `--todos` +
  `status`. Guía completa: [`campania-vm.md`](./campania-vm.md).
- **Groq sin tope de gasto** (tarjeta en consumo libre) — el rate limit deja de
  ser riesgo de calidad; los warnings del ledger quedan como auditoría.
- **`gobpe` (normas por entidad) va AL FINAL** de la cola de construcción.

**Cola de construcción de módulos:** ✅ P3 CERRADA 2026-07-30 (Tribunal Fiscal,
INDECOPI, Contrataciones, SUNARP TR+SIP, SERVIR, OEFA — 6 módulos en un día
con el patrón gob.pe compartido; SUNAT bloqueada por sitio caído, reintentar).
✅ P4 reguladores CERRADA 2026-07-30 (módulo único `reguladores`). Quedan de
P4: OEFA API, PRONABEC API, PTE y regionales (decisión Harry); `gobpe` al
final; Congreso y doctrina (P5) tras decisión de Harry.

## Comandos de lo que ya existe

| Comando | Módulo | Fuente | Mandos de control |
| --- | --- | --- | --- |
| `pnpm entidades [--dry] [--sync] [--limit] [--delay]` | `entidades` | Directorio oficial gob.pe (~2.8k instituciones) | `--dry` solo reporte · `--sync` escribe también el seed del assistant (`ENTIDADES_ASSISTANT_TIPOS`) |
| `pnpm spij [--limit n]` | `spij` | SPIJ (MINJUS) — normativa | `SPIJ_FECHA_INI`/`SPIJ_FECHA_FIN` (ventana), `SPIJ_TIPO`. ⚠ Exige binario de Chrome (`npx puppeteer browsers install chrome`) para renderizar el PDF |
| `pnpm pj [--limit n]` | `pj` | Poder Judicial — Jurisprudencia Sistematizada | `PJ_ROOT` (apuntar a una hoja concreta), `PJ_DELAY` alto (Radware throttlea por IP; correr desde IP residencial y sin ráfagas) |
| `pnpm tc [--limit n]` | `tc` | Tribunal Constitucional — jurisprudencia | `TC_START_MONTH`/`TC_END_MONTH` (checkpoint mensual reanudable) |
| `pnpm tfiscal [--limit n]` | `tfiscal` | Tribunal Fiscal — RTF vía gob.pe | `TF_TERM`, `TF_MAX_SHEETS`, `TF_DELAY`. PDF del CDN; escaneados → **OCR local compartido** (`src/services/ocr`, exige `pdftoppm`/poppler). Ver [`plan-tribunal-fiscal.md`](./plan-tribunal-fiscal.md) |
| `pnpm indecopi [--limit n]` | `indecopi` | INDECOPI — resoluciones/normas vía gob.pe | `IND_MAX_SHEETS`, `IND_DELAY`. Born-digital + OCR fallback. Fase 2 (salas del Tribunal): buscador Seam, ver [`plan-indecopi.md`](./plan-indecopi.md) |
| `pnpm tce [--limit n]` | `tce` | Tribunal de Contrataciones (OECE) — resoluciones TCP por sala vía gob.pe | `TCE_MAX_SHEETS`, `TCE_DELAY`. Filtro por sufijo TCP/TCE+sala sobre las 85.7k normas del OECE. Ver [`plan-tce.md`](./plan-tce.md) |
| `pnpm sunarp [--limit n]` | `sunarp` | SUNARP — Tribunal Registral y Plenos vía gob.pe | `SUNARP_TERM`, `SUNARP_MAX_SHEETS`, `SUNARP_DELAY`. Filtro `-SUNARP-TR[-sede]` y `/PT`. Ver [`plan-sunarp.md`](./plan-sunarp.md) |
| `pnpm servir [--limit n]` | `servir` | SERVIR — Tribunal del Servicio Civil vía gob.pe | `SERVIR_TERM` (default "TSC"), `SERVIR_MAX_SHEETS`, `SERVIR_DELAY`. Salas Primera/Segunda en court_chamber. Ver [`plan-servir.md`](./plan-servir.md) |
| `pnpm oefa [--limit n]` | `oefa` | OEFA — Tribunal de Fiscalización Ambiental vía gob.pe | `OEFA_TERM` (default "TFA"), `OEFA_MAX_SHEETS`. Publicaciones/Report (no normas); escaneadas → OCR. Ver [`plan-oefa.md`](./plan-oefa.md) |
| `pnpm osinergmin [--limit n]` | `osinergmin` | OSINERGMIN — normativa vía gob.pe (~28.9k) | `OSINERGMIN_MAX_SHEETS`, `OSINERGMIN_DELAY`. Ver [`plan-reguladores.md`](./plan-reguladores.md) |
| `pnpm osiptel [--limit n]` | `osiptel` | OSIPTEL — normativa vía gob.pe (~8k) | `OSIPTEL_MAX_SHEETS`, `OSIPTEL_DELAY` |
| `pnpm sunass [--limit n]` | `sunass` | SUNASS — normativa vía gob.pe (~4.5k) | `SUNASS_MAX_SHEETS`, `SUNASS_DELAY` |
| `pnpm ositran [--limit n]` | `ositran` | OSITRAN — normativa vía gob.pe (~10.3k) | `OSITRAN_MAX_SHEETS`, `OSITRAN_DELAY` |
| `pnpm gobpe [--limit n] [--desde/--hasta YYYY-MM-DD] [--dias n] [--ambito nacional\|todos]` | `gobpe` | gob.pe — stream GENERAL de normas (5.1M) | Ventanas de 1 día (tope real ~400 hojas); emisor etiquetado; anti-colisión con módulos dedicados; ámbito nacional default. **NO corre en `all`** (decisión owner). Ver [`plan-gobpe.md`](./plan-gobpe.md) |
| `pnpm elperuano [--limit n] [--periodo YYYY-MM] [--todos]` | `elperuano` | Diario Oficial El Peruano — dispositivos legales | Índice = CSV de datosabiertos (default: mes más reciente; `--todos` = campaña por los 29 recursos 2013→hoy, reciente-primero); texto = `visor_html`. `EP_CSV_URL` para un CSV directo. ⚠ Exige Chrome (render PDF). Ver [`plan-el-peruano.md`](./plan-el-peruano.md) |
| `pnpm all [--limit n] [--sync] [--todos] [--skip <módulos>]` | orquestador | **Todo en orden**: `entidades` → `tc` → `tfiscal` → `indecopi` → `tce` → `sunarp` → `servir` → `oefa` → los 4 reguladores → `elperuano` → `spij` → `pj` (pequeño-primero) | `--limit` aplica POR módulo (smoke test); `--sync` a entidades; `--todos` a elperuano; `--skip pj` en VMs (bot manager exige IP residencial). Módulos aislados; resumen final y exit 1 si algo falló |
| `pnpm status` | — | Avance por fuente desde los ledgers | registrados / ok / pendientes / permanentes / warnings; no toca la red |
| `ops/campaign.sh` + systemd | — | La campaña VM completa | pasada idempotente cada 6 h + respaldo rotado de `state/`; ver [`campania-vm.md`](./campania-vm.md) |

Todos los módulos de documentos son **reanudables** (ledger + checkpoint en
`state/<fuente>/`): re-ejecutar el mismo comando continúa donde quedó.

### Pipeline completo (cuando entidades trae NUEVAS)

```
1. pnpm entidades --dry     # mirar el reporte (state/entidades/report.json)
2. pnpm entidades --sync    # catálogo local + seed del assistant
3. (assistant) poetry run python -m app.seed.legal_documents.catalog_seed
4. pnpm spij / pnpm pj / pnpm tc   (o pnpm all)
```

`pnpm all` avisa en el log si entidades añadió nuevas y falta sembrar el paso 3.

## Checklist de fuentes (las 43 del Excel)

Leyenda: ✅ hecho · ⬜ pendiente · ❌ excluida por decisión. La columna
"Prioridad" viene de la tabla maestra de `estrategia-fuentes.md` §3.

### Normativa nacional (aquí vive el millón)

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ✅ | El Peruano – buscador de normas | **P1 — la fuente del millón** | `elperuano` | `pnpm elperuano` | Hecho 2026-07-30 vía CSV índice + `visor_html/{OP}` (texto limpio, sin OCR); el buscador JSON del sitio no hizo falta. Smoke 15/15 OK. Escala: ~200k+ (2013→hoy) iterando `--periodo` |
| ⬜ | El Peruano – cuadernillo diario | P1 | job sobre `elperuano` | — | `/cuadernillo/NL/{YYYYMMDD}`; el dataset publica con rezago (~meses) — el cuadernillo cubre el día a día cuando toque |
| ✅ | SPIJ – acceso libre | hecho | `spij` | `pnpm spij` | El módulo entra por la API autenticada del SPIJ (cuenta gratuita) y cubre el acceso libre. Escala medida: ~875k docs disponibles |
| ✅ | Datos Abiertos – CSV Dispositivos Legales | P1b — hecho | dentro de `elperuano` | `pnpm elperuano` | ES el índice del módulo elperuano (services/datosabiertos): dataset mensual 2013→feb-2025, CP850, sin scraping |
| ⬜ | Datos Abiertos – API datastore | P1b | — | — | DKAN sin API CKAN clásica (verificado); el CSV basta por ahora |
| ✅ | gob.pe – normas por entidad | hecho (era "al final") | `gobpe` | `pnpm gobpe` | Hecho 2026-07-30: stream global por ventanas de 1 día (paginación topa en ~400 hojas), emisor etiquetado, anti-colisión con los 10 módulos gob.pe dedicados, ámbito nacional default (municipales = `--ambito todos`, pendiente Harry). Smoke 10/10. NO corre en `all` hasta decisión del owner |
| ⬜ | SUNAT – legislación | P3/P4 — BLOQUEADA | — | — | Mismo bloqueo (es el mismo sitio /legislacion/). Solape alto: esa compilación son normas que YA entran por SPIJ y El Peruano |

### Congreso

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ⬜ | Congreso – Archivo Digital (ADLP) | sin priorizar | — | — | Evaluar valor vs El Peruano (mucho solape de normas) |
| ⬜ | Congreso – Proyectos de ley (SPLEY) | sin priorizar | — | — | Proyectos ≠ normas vigentes: decidir con Harry si entran al corpus |

### Jurisprudencia (el molde ya está validado)

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ✅ | Poder Judicial – Jurisprudencia Sistematizada | P0 — hecho | `pj` | `pnpm pj` | Censo ~5–8k docs; emisor fijo, área por breadcrumb. Radware: fetch (no axios), ritmo suave |
| ✅ | Tribunal Constitucional | P2 — hecho | `tc` | `pnpm tc` | ~73.7k docs disponibles; checkpoint mensual reanudable |
| ❌ | Poder Judicial – CEJ | **excluida** | — | — | Decisión Harry + informe: anti-bot y datos personales (Ley 29733). NO en esta etapa |

### Tribunales administrativos (P3 — reutilizan el molde de PJ/TC)

Emisor **fijo por módulo** (la entidad dueña del tribunal, ya verificada en
`entity.json`). El riesgo común de PDFs escaneados quedó RESUELTO con el
**OCR local compartido** (`src/services/ocr`: pdftoppm + tesseract.js,
estrenado en `tfiscal`) — el backend rechaza escaneos con 400 y el módulo
reingesta el texto OCR con warning auditable. Las 7 fuentes canónicas P3 ya
están registradas en los 3 repos (huella `553994ae…`).

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ✅ | Tribunal Fiscal (MEF) | P3 — hecho | `tfiscal` | `pnpm tfiscal` | Hecho 2026-07-30. El MEF está tras Incapsula, pero las RTF viven en gob.pe (~7.7k, buscador JSON + PDF CDN). Escaneadas → OCR local. Smoke 12/12. Las de observancia nuevas llegan también por El Peruano |
| ✅ | INDECOPI | P3 — hecho (v1) | `indecopi` | `pnpm indecopi` | Hecho 2026-07-30 vía gob.pe (~3k resoluciones/normas born-digital, smoke 12/12). Fase 2: salas del Tribunal en el buscador Seam (`servicio.indecopi.gob.pe`, vivo, sin bot manager) |
| ✅ | OSCE – Tribunal de Contrataciones | P3 — hecho | `tce` | `pnpm tce` | Hecho 2026-07-30 vía gob.pe (OECE publica ~85.7k normas; filtro TCP/TCE+sala; born-digital). Smoke 10/10. Descartada la colección compendio (13.4k, peor cobertura) |
| ✅ | SUNARP – Tribunal Registral | P3 — hecho | `sunarp` | `pnpm sunarp` | Hecho 2026-07-30 vía gob.pe (término + filtro `-SUNARP-TR[-sede]`; sede en court_chamber). Smoke 10/10 born-digital |
| ✅ | SUNARP – SIP (precedentes) | P3 — hecho | dentro de `sunarp` | `pnpm sunarp` | El sitio SIP está CAÍDO; los precedentes nacen en los acuerdos de Pleno (`…-SUNARP/PT`) que este módulo ingesta del mismo stream |
| ✅ | SERVIR – Tribunal del Servicio Civil | P3 — hecho | `servir` | `pnpm servir` | Hecho 2026-07-30 vía gob.pe (term TSC + filtro; ~168k normas SERVIR, las TSC con sala en court_chamber). Smoke 10/10 born-digital |
| ✅ | OEFA – Tribunal de Fiscalización Ambiental | P3 — hecho | `oefa` | `pnpm oefa` | Hecho 2026-07-30 vía gob.pe: las TFA van como PUBLICACIONES (Report), ~7.3k con término; antiguas escaneadas → OCR local. Smoke 10/10 |
| ⬜ | SUNAT – resoluciones e informes | P3 — BLOQUEADA | `sunat` (pendiente) | — | **Recon 2026-07-30**: www.sunat.gob.pe (árbol /legislacion/ con informes vinculantes) NO responde desde esta red (timeouts totales; ww1 vive pero sin ese árbol) y gob.pe solo tiene 60 normas de SUNAT. Reintentar cuando el sitio responda. Mientras: sus resoluciones de superintendencia YA fluyen por El Peruano/SPIJ |

### Reguladores y APIs de datos abiertos (P4)

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ✅ | OSINERGMIN | P4 — hecho | `osinergmin` | `pnpm osinergmin` | ~28.9k normas vía gob.pe. Smoke 3/3. TASTEM/JARU (reclamos de usuarios) fuera a propósito |
| ✅ | OSIPTEL | P4 — hecho | `osiptel` | `pnpm osiptel` | ~8k normas vía gob.pe. Smoke 3/3 |
| ✅ | SUNASS | P4 — hecho | `sunass` | `pnpm sunass` | ~4.5k normas vía gob.pe. Smoke 3/3 |
| ✅ | OSITRAN | P4 — hecho | `ositran` | `pnpm ositran` | ~10.3k normas vía gob.pe; entidad verificada (sigla OSITRAN). Smoke 3/3 |
| ⬜ | OEFA – API datos abiertos | P4 — evaluada | — | — | **Veredicto 2026-07-30**: sus datasets son datos tabulares (inventarios ambientales, fiscalización), NO documentos legales. Decisión de producto si algún dataset interesa como dato |
| ⬜ | PRONABEC – API datos abiertos | P4 — evaluada | — | — | **Veredicto 2026-07-30**: encuestas de becarios y postulaciones (datos tabulares), NO documentos legales. Sus resoluciones llegarían por `gobpe` |
| ⬜ | Portal de Transparencia (PTE) | P4 — evaluada | — | — | **Veredicto 2026-07-30**: información de gestión institucional (portal vivo), NO fuentes del derecho. Decisión de producto |
| ⬜ | Gobiernos regionales y locales | pregunta abierta | — | — | ¿Ordenanzas regionales/locales entran o solo alcance nacional? Pendiente de Harry (§8 estrategia) |

### Doctrina (P5 — pendiente decisión de producto con Harry)

Técnicamente lo más limpio (OAI-PMH estándar), pero es otro tipo de contenido
(tesis/artículos, no fuentes del derecho). **No construir hasta confirmar** si
entra al mismo corpus (`type=doctrine` existe en el enum del backend).

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ⬜ | ALICIA – CONCYTEC | P5 | `oai` (uno solo, config por repositorio) | — | Agregador nacional OAI-PMH — cubriría gran parte de las filas siguientes |
| ⬜ | Repositorio CONCYTEC (OAI) | P5 | parte de `oai` | — | |
| ⬜ | PUCP – repositorio de tesis | P5 | parte de `oai` | — | |
| ⬜ | UNMSM – Cybertesis | P5 | parte de `oai` | — | |
| ⬜ | UPC / UNI / URP – repositorios | P5 | parte de `oai` | — | |
| ⬜ | Congreso / TC / AMAG – repositorios | P5 | parte de `oai` | — | |
| ⬜ | Revista Derecho PUCP | P5 | — | — | OJS |
| ⬜ | IUS ET VERITAS | P5 | — | — | OJS |
| ⬜ | THĒMIS | P5 | — | — | OJS |
| ⬜ | SciELO Perú | P5 | — | — | |
| ⬜ | Dialnet / Redalyc / REDIB | P5 | — | — | Agregadores externos: revisar términos de uso antes |

### Actualización continua (jobs sobre módulos existentes, no módulos nuevos)

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ⬜ | Job diario El Peruano | post-`elperuano` | cron sobre `elperuano` | — | El cuadernillo diario del día anterior |
| ✅ | Polling gob.pe | hecho (mecánica lista) | modo incremental de `gobpe` | `pnpm gobpe` | El default (últimos 7 días + ledger) ES el poll; se activa agendándolo (cron o sumar `gobpe` a `DOC_SCRAPERS` de la campaña) cuando el owner decida |
| ⬜ | Polling SPLEY | post-módulo SPLEY | cron | — | |
| ⬜ | Andina – normas del día | señal, no fuente | — | — | Noticias: sirve como alerta de publicación, no como fuente primaria de texto |

## Cómo añadir un módulo nuevo (checklist)

1. **Módulo** en `src/modules/<fuente>/` siguiendo la convención del repo
   (config propia, reanudable con ledger+checkpoint en `state/<fuente>/`,
   aislado; solo funciones, sin clases). El molde de jurisprudencia es `pj`/`tc`;
   el de normativa, `spij`.
2. **Subcomando individual** en `src/cli.ts` + script en `package.json`
   (`"<fuente>": "tsx src/cli.ts <fuente>"`).
3. **Sumarlo al orquestador**: arreglo `DOC_SCRAPERS` en `src/cli.ts` (define el
   orden en `pnpm all`).
4. **Fuente canónica**: si es una fuente nueva, registrarla en
   `src/services/sources` — ⚠ la huella SHA-256 del mapa alias→canónico está
   fijada en tests de los TRES repos (scrapping `src/services/sources/index.test.ts`,
   assistant `tests/test_legal_sources.py`, platform `canonical_source.test.ts`):
   actualizar el catálogo y la huella en los tres a la vez.
5. **Emisor**: verificar que la(s) entidad(es) emisoras existan en
   `public/data/entity.json`; si falta, correr `pnpm entidades` (y sembrar en el
   assistant) antes de la primera corrida real.
6. **Marcar aquí**: ✅ en su fila, comando real, actualizar el contador de
   avance y la tabla de comandos.
