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

**3 de 42 fuentes scrapeables listas** · 1 excluida por decisión (CEJ).
Última actualización: **2026-07-30**.

## Comandos de lo que ya existe

| Comando | Módulo | Fuente | Mandos de control |
| --- | --- | --- | --- |
| `pnpm entidades [--dry] [--sync] [--limit] [--delay]` | `entidades` | Directorio oficial gob.pe (~2.8k instituciones) | `--dry` solo reporte · `--sync` escribe también el seed del assistant (`ENTIDADES_ASSISTANT_TIPOS`) |
| `pnpm spij [--limit n]` | `spij` | SPIJ (MINJUS) — normativa | `SPIJ_FECHA_INI`/`SPIJ_FECHA_FIN` (ventana), `SPIJ_TIPO`. ⚠ Exige binario de Chrome (`npx puppeteer browsers install chrome`) para renderizar el PDF |
| `pnpm pj [--limit n]` | `pj` | Poder Judicial — Jurisprudencia Sistematizada | `PJ_ROOT` (apuntar a una hoja concreta), `PJ_DELAY` alto (Radware throttlea por IP; correr desde IP residencial y sin ráfagas) |
| `pnpm tc [--limit n]` | `tc` | Tribunal Constitucional — jurisprudencia | `TC_START_MONTH`/`TC_END_MONTH` (checkpoint mensual reanudable) |
| `pnpm all [--limit n] [--sync]` | orquestador | **Todo en orden**: `entidades` → `spij` → `pj` → `tc` | `--limit` aplica POR módulo (smoke test); `--sync` se pasa a entidades. Módulos aislados: uno roto no tumba el resto; resumen final y exit 1 si algo falló |

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
| ⬜ | El Peruano – buscador de normas | **P1 — la fuente del millón** | `elperuano` (por crear) | — | `visor_html/{id}`: texto limpio sin OCR; el metadato "Entidad" viene en el índice. **Siguiente módulo grande** |
| ⬜ | El Peruano – cuadernillo diario | P1 | parte de `elperuano` | — | `/cuadernillo/NL/{YYYYMMDD}`; es la actualización diaria del mismo módulo |
| ✅ | SPIJ – acceso libre | hecho | `spij` | `pnpm spij` | El módulo entra por la API autenticada del SPIJ (cuenta gratuita) y cubre el acceso libre. Escala medida: ~875k docs disponibles |
| ⬜ | Datos Abiertos – CSV Dispositivos Legales | P1b | `datosabiertos` (por crear) | — | Índice 2013–2024 con id/sumilla/entidad/enlace SIN scraping → bootstrap barato de El Peruano |
| ⬜ | Datos Abiertos – API datastore | P1b | parte de `datosabiertos` | — | API DKAN; complementa el CSV |
| ⬜ | gob.pe – normas por entidad | P4 | — | — | HTML estructurado, riesgo bajo |
| ⬜ | SUNAT – legislación | P3/P4 | — | — | Legislación tributaria sistematizada |

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
`entity.json`); riesgo común: PDFs escaneados → OCR (usar `pages_with_text` de
la respuesta del ingest para marcar cola de OCR).

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ⬜ | Tribunal Fiscal (MEF) | P3 (primero de la cola) | `tfiscal` (por crear) | — | RTF de observancia obligatoria; también salen en El Peruano (dedupe cross-fuente) |
| ⬜ | INDECOPI | P3 | — | — | Resoluciones por sala |
| ⬜ | OSCE – Tribunal de Contrataciones | P3 | — | — | |
| ⬜ | SUNARP – Tribunal Registral | P3 | — | — | |
| ⬜ | SUNARP – SIP (precedentes) | P3 | — | — | |
| ⬜ | SERVIR – Tribunal del Servicio Civil | P3 | — | — | |
| ⬜ | OEFA – Tribunal de Fiscalización Ambiental | P3 | — | — | |
| ⬜ | SUNAT – resoluciones e informes | P3/P4 | — | — | Informes vinculantes |

### Reguladores y APIs de datos abiertos (P4)

| ✓ | Fuente (Excel) | Prioridad | Módulo | Comando | Notas |
| --- | --- | --- | --- | --- | --- |
| ⬜ | OSINERGMIN | P4 | — | — | |
| ⬜ | OSIPTEL | P4 | — | — | |
| ⬜ | SUNASS | P4 | — | — | |
| ⬜ | OSITRAN | P4 | — | — | Verificar que la entidad exista en `entity.json` al llegar aquí |
| ⬜ | OEFA – API datos abiertos | P4 | — | — | |
| ⬜ | PRONABEC – API datos abiertos | P4 | — | — | |
| ⬜ | Portal de Transparencia (PTE) | P4 | — | — | |
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
| ⬜ | Polling gob.pe | post-módulo gob.pe | cron | — | |
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
