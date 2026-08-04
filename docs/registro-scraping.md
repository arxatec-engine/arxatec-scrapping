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

**33 de 44 fuentes scrapeables listas** · 1 excluida por decisión (CEJ).
Última actualización: **2026-08-03** (tanda del abogado: 2 fuentes NUEVAS
fuera del Excel original —`tfl` y `essalud`, +2 al denominador— y las 3
revistas OJS de derecho de la PUCP desbloqueadas: NO estaban caídas, solo
tardan >40 s. Smokes 8/8, 6/6 y 3/3×3).

**Decisiones del owner (2026-07-30):**
- **Campaña VM 2 meses** con los módulos ya validados (TC + El Peruano + SPIJ
  ≈ 1.15M docs = la meta del millón): supervisor systemd + `--todos` +
  `status`. Guía completa: [`campania-vm.md`](./campania-vm.md).
- **Groq sin tope de gasto** (tarjeta en consumo libre) — el rate limit deja de
  ser riesgo de calidad; los warnings del ledger quedan como auditoría.
- **`gobpe` (normas por entidad) va AL FINAL** de la cola de construcción.

**Cola de construcción de módulos: CERRADA 2026-08-01 — no queda NINGÚN
módulo por construir.** ✅ P3 completa (incluida SUNAT). ✅ P4 reguladores
completa. ✅ `gobpe`. ✅ `spley`, `doctrina` y `adlp` (el último construible).
Resta solo: ampliar `REPOS` de doctrina cuando sus endpoints OAI respondan
([`plan-doctrina.md`](./plan-doctrina.md) §4), la fase 2 del ADLP si producto
la pide ([`plan-adlp.md`](./plan-adlp.md) §4), y las decisiones de producto
con veredicto (OEFA API, PRONABEC, PTE).

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
| `pnpm gobpe [--limit n] [--desde/--hasta YYYY-MM-DD] [--dias n] [--ambito nacional\|todos]` | `gobpe` | gob.pe — stream GENERAL de normas (5.1M) | Ventanas de 1 día (tope real ~400 hojas); emisor etiquetado; anti-colisión con módulos dedicados; ámbito "todos" default. **NO corre en `all`** (decisión owner). Ver [`plan-gobpe.md`](./plan-gobpe.md) |
| `pnpm sunat [--limit n]` | `sunat` | SUNAT — informes/oficios vinculantes (1997→hoy) | `SUNAT_ANIO_DESDE/HASTA`. Árbol estático (frameset); PDF moderno + .htm viejo renderizado; fecha = piso del año. Ver [`plan-sunat.md`](./plan-sunat.md) |
| `pnpm spley [--limit n]` | `spley` | Congreso — proyectos de ley (SPLEY) | `SPLEY_PERIODOS`. status **"En revisión"** (separa proyectos de normas vigentes en el filtro). API del portal (lista+expediente AES). Ver [`plan-spley.md`](./plan-spley.md) |
| `pnpm doctrina [--limit n] [--repos <slugs>]` | `doctrina` | Tesis y artículos jurídicos (OAI-PMH) | `DOCTRINA_REPOS`. Un módulo, N repositorios; filtro a lo jurídico; type=doctrine. Ver [`plan-doctrina.md`](./plan-doctrina.md) |
| `pnpm elperuano [--limit n] [--periodo YYYY-MM] [--todos]` | `elperuano` | Diario Oficial El Peruano — dispositivos legales | Índice = CSV de datosabiertos (default: mes más reciente; `--todos` = campaña por los 29 recursos 2013→hoy, reciente-primero); texto = `visor_html`. `EP_CSV_URL` para un CSV directo. ⚠ Exige Chrome (render PDF). Ver [`plan-el-peruano.md`](./plan-el-peruano.md) |
| `pnpm all [--limit n] [--sync] [--todos] [--skip <módulos>]` | orquestador | **Todo en orden**: `entidades` → `tc` → `tfiscal` → `indecopi` → `tce` → `sunarp` → `servir` → `oefa` → los 4 reguladores → `sunat` → `spley` → `doctrina` → `elperuano` → `spij` → `pj` (pequeño-primero) | `--limit` aplica POR módulo (smoke test); `--sync` a entidades; `--todos` a elperuano; `--skip pj` en VMs (bot manager exige IP residencial). Módulos aislados; resumen final y exit 1 si algo falló |
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
| ✅ | El Peruano – cuadernillo diario | P1 — hecho | `elperuano --cuadernillo` | `pnpm elperuano --cuadernillo` | Hecho 2026-07-31: el boletín oficial diario (1 PDF/día, todo el día en un doc) cubre el rezago de ~meses del dataset. `--dias n`, reanudable (id=cuadernillo-YYYYMMDD). Smoke 5/5 |
| ✅ | SPIJ – acceso libre | hecho | `spij` | `pnpm spij` | El módulo entra por la API autenticada del SPIJ (cuenta gratuita) y cubre el acceso libre. Escala medida: ~875k docs disponibles |
| ✅ | Datos Abiertos – CSV Dispositivos Legales | P1b — hecho | dentro de `elperuano` | `pnpm elperuano` | ES el índice del módulo elperuano (services/datosabiertos): dataset mensual 2013→feb-2025, CP850, sin scraping |
| ⬜ | Datos Abiertos – API datastore | P1b | — | — | DKAN sin API CKAN clásica (verificado); el CSV basta por ahora |
| ✅ | gob.pe – normas por entidad | hecho (era "al final") | `gobpe` | `pnpm gobpe` | Hecho 2026-07-30: stream global por ventanas de 1 día (paginación topa en ~400 hojas), emisor etiquetado, anti-colisión con los 10 módulos gob.pe dedicados, ámbito "todos" default (municipales INCLUIDAS, decisión owner 2026-07-31). Smoke 10/10. NO corre en `all` hasta decisión del owner |
| ⬜ | SUNAT – legislación | evaluada | — | — | **Veredicto 2026-07-31**: la compilación tributaria concordada son las MISMAS normas que ya entran por SPIJ/El Peruano; su plus (vigencias/concordancias) es el problema `status` global diferido por Harry |

### Congreso

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ✅ | Congreso – Archivo Digital (ADLP) | hecho 2026-08-01 | `adlp` | `pnpm adlp` | El sitio nunca estuvo del todo caído: su HTTPS es INTERMITENTE (reintentos, patrón elperuano). **Vigencia determinista de la fuente — estrena "Derogado"** (buscador vigentes/no-vigentes, grid trunca a 20 filas → ventanas de 20). PDFs `Documentos/Leyes/{n}.pdf` ≈ 10000 (1944) → 30480 (2016), escaneados → OCR local. Smoke 15/15 (RES.LEG. 26802 entró Derogado). Ver [`plan-adlp.md`](./plan-adlp.md) |
| ✅ | Congreso – Proyectos de ley (SPLEY) | hecho (decisión owner 2026-07-31) | `spley` | `pnpm spley` | API del portal (14.864 proyectos período 2021-2026); status **"En revisión"** → el filtro vigente/no-vigente cobra vida (verificado E2E: 8 En revisión vs 128 Vigente). Smoke 8/8 |

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
| ✅ | **Tribunal de Fiscalización Laboral (TFL)** | añadida 2026-08-03 (pedido del abogado) | `tfl` | `pnpm tfl` | El hermano laboral del TSC y el TFA, vía gob.pe (term TFL, ~55 resoluciones). **Detecta las Resoluciones de Sala Plena = precedentes de observancia obligatoria** en `court_chamber`. Smoke 8/8 sin warnings. Ver [`plan-tfl.md`](./plan-tfl.md) |
| ✅ | **ESSALUD – normativa** | añadida 2026-08-03 (pedido del abogado) | `essalud` | `pnpm essalud` | Stream completo de normas del Seguro Social vía gob.pe. ⚠ Entre 40% y 70% son actos administrativos internos (RRHH/donaciones) — entran igual por la regla "volumen primero"; el corte, si producto lo pide, es una línea. Smoke 6/6. Ver [`plan-essalud.md`](./plan-essalud.md) |
| ✅ | SUNAT – resoluciones e informes | P3 — hecho | `sunat` | `pnpm sunat` | El sitio revivió el 31-jul y el módulo se construyó ese día: informes/oficios/cartas 1997→hoy (índices anuales; los años nuevos existen aunque el frameset viejo tope en 2010). Smoke 10/10. Las resoluciones de superintendencia se omiten (fluyen por EP/SPIJ) |

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
| ✅ | Gobiernos regionales y locales | hecho (decisión owner 2026-07-31) | dentro de `gobpe` | `pnpm gobpe` | Las ordenanzas municipales/regionales entran: ámbito "todos" es el default del módulo (`GOBPE_AMBITO=nacional` queda como restricción opcional) |

### Doctrina (P5 — decisión owner 2026-07-31: entra al corpus)

Módulo `doctrina` construido: UN cosechador OAI-PMH parametrizado por
repositorio (`type=doctrine`, fuente canónica `doctrina`). Añadir un
repositorio = una entrada en `REPOS` — pero **cada endpoint se confirma antes**
(muchos portales sirven su SPA con falso 200; ver
[`plan-doctrina.md`](./plan-doctrina.md) §4). En esta tabla ✅ = repositorio
realmente en `REPOS` y cosechando; ⬜ = el módulo lo atiende, falta confirmar
su endpoint.

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ⬜ | ALICIA – CONCYTEC | P5 | `doctrina` | — | Agregador nacional OAI-PMH — cubriría gran parte de las filas siguientes; confirmar endpoint real antes de añadir a `REPOS` |
| ⬜ | Repositorio CONCYTEC (OAI) | P5 | `doctrina` | — | Pendiente confirmar endpoint |
| ✅ | PUCP – repositorio de tesis | P5 — hecho | `doctrina` | `pnpm doctrina --repos pucp-tesis` | En `REPOS` (`tesis.pucp.edu.pe/oai/request`). El smoke 8/8 del módulo fue con estas tesis; filtro jurídico activo (19/100 en la muestra) |
| ⬜ | UNMSM – Cybertesis | P5 | `doctrina` | — | Su ruta OAI estándar sirve la SPA (falso 200); buscar el endpoint real (plan §4) |
| ✅ | UPC / UNI / URP – repositorios | P5 — hecho | `doctrina` | `pnpm doctrina --repos upc,uni,urp` | Los 3 en `REPOS` y cosechando (2026-08-01; +ULima como extra fuera del Excel). UPC exige UA de cosechador (su WAF da 403 a UAs de navegador en OAI); URP es DSpace 7 (`/server/oai/request`). Smokes 5/5 |
| ⬜ | Congreso / TC / AMAG – repositorios | P5 — parcial | `doctrina` | `pnpm doctrina --repos amag` | AMAG **ya cosecha** (DSpace 7, emisor resuelto, smoke 5/5). Congreso (cendocbib) en timeout y TC sin OAI conocido — pendientes |
| ✅ | Revista Derecho PUCP | P5 — hecho (vía SciELO) | `doctrina` | `pnpm doctrina --repos scielo` | Su contenido entra completo por el set `0251-3420` de SciELO. El OJS propio (`revistas.pucp`) sigue caído; queda como vía alternativa si SciELO falla |
| ✅ | IUS ET VERITAS | P5 — hecho | `doctrina` | `pnpm doctrina --repos iusetveritas` | OJS OAI real con `timeoutSec: 120` (el sitio es lento, no estaba caído). Smoke 3/3 |
| ✅ | THĒMIS | P5 — hecho | `doctrina` | `pnpm doctrina --repos themis` | OJS OAI real con `timeoutSec: 120` (el sitio es lento, no estaba caído). Smoke 3/3 |
| ✅ | SciELO Perú | P5 — hecho | `doctrina` | `pnpm doctrina --repos scielo` | Cosecha **por set** (sus sets OAI son ISSN de revista; `0251-3420` = Derecho PUCP, la única jurídica del agregador — la paginación global daba 500). Parser tolerante a CDATA y `<record>` con atributos. Smoke 5/5 |
| ⬜ | Dialnet / Redalyc / REDIB | P5 — evaluada 2026-08-03 | — | — | **Veredicto**: Dialnet tiene OAI real, pero (1) es un ÍNDICE — sus registros son metadatos + resumen, sin texto completo; (2) es multidisciplinar y español, lo peruano-jurídico es una fracción; (3) las revistas peruanas que indexa (Derecho PUCP, IUS ET VERITAS, THĒMIS) **ya las cosechamos directo**, así que sería duplicado con menos contenido; (4) su `robots.txt` bloquea explícitamente a GPTBot → señal sobre reutilización por IA, consultar con legal |

### Actualización continua (jobs sobre módulos existentes, no módulos nuevos)

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ✅ | Job diario El Peruano | hecho | `elperuano --cuadernillo` | `pnpm elperuano --cuadernillo --dias 1` | Es el modo cuadernillo agendado (cron/campaña); trae el boletín del día. Idempotente por ledger |
| ✅ | Polling gob.pe | hecho (mecánica lista) | modo incremental de `gobpe` | `pnpm gobpe` | El default (últimos 7 días + ledger) ES el poll; se activa agendándolo (cron o sumar `gobpe` a `DOC_SCRAPERS` de la campaña) cuando el owner decida |
| ✅ | Polling SPLEY | mecánica lista | modo reanudable de `spley` | `pnpm spley` | Re-ejecutar trae los proyectos nuevos (ledger dedupea); agendar cuando el owner decida |
| ⬜ | Andina – normas del día | evaluada 2026-08-03 | — | — | **Veredicto ratificado**: su sección de normas legales ya ni existe (redirige a "miscellaneous"). Es agencia de noticias: daría una alerta de que salió una norma, pero el **cuadernillo diario de El Peruano ya trae el texto oficial el mismo día**. No aporta nada que no tengamos |

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
