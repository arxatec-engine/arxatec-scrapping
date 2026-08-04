# Plan TFL — módulo `tfl` (Tribunal de Fiscalización Laboral, SUNAFIL)

> Escrito 2026-08-03 a pedido del abogado del equipo. Es el **hermano que
> faltaba** del TSC (SERVIR) y el TFA (OEFA): un tribunal administrativo
> nacional cuyas resoluciones de Sala Plena son **precedentes de observancia
> obligatoria** en materia laboral.

## 1. La fuente

Mismo patrón gob.pe que el resto de tribunales P3: el stream de normas de
SUNAFIL (`institucion[]=sunafil`) con término `TFL` trae las resoluciones del
tribunal con PDF born-digital en el CDN. Se filtran por el número, que
siempre contiene `SUNAFIL/TFL` con separador variable por época
(`008-2023-SUNAFIL-TFL`, `002-2021-SUNAFIL/TFL`); fuera quedan las
resoluciones institucionales (`-GG`, `-PCD`, `-OAD`).

**Escala medida (recon 2026-08-03): ~55 resoluciones.** Es un corpus chico
pero denso: incluye toda la línea de precedentes del tribunal.

## 2. El módulo

`src/modules/tfl/` (molde `servir`, ~30 min). Emisor FIJO SUNAFIL por sigla
única del catálogo, con fallback al nombre completo.

| Campo | Valor |
| --- | --- |
| `type` | `jurisprudence` (jurisprudencia administrativa, como TSC/TFA) |
| `status` | `Vigente` |
| `source` | `Tribunal de Fiscalización Laboral` (canónico NUEVO `tfl`, huella `ec75056f…` rotada en los 3 repos) |
| `issuer_entity_ids` | SUNAFIL (fijo) |
| `court_chamber` | **`Sala Plena`** cuando el número o la sumilla lo dicen (= precedente vinculante); si no, la sala de revisión |

La detección de Sala Plena es lo que da valor jurídico al módulo: permite
distinguir el precedente obligatorio del caso concreto. Se resuelve por texto
de la propia fuente (`Resolución de Sala Plena N° …`), nunca por IA.

## 3. Mandos y verificación

`--limit n` / `TFL_LIMIT` · `TFL_TERM` (default "TFL") · `TFL_MAX_SHEETS` ·
`TFL_DELAY` / `TFL_CONCURRENCY` / `TFL_UA`. Está en `DOC_SCRAPERS` (corre en
`pnpm all`, tras `servir`).

**Smoke 2026-08-03: 8/8 OK, 0 errores, 0 warnings** (`pnpm verify tfl 8`):
born-digital, emisor SUNAFIL enlazado en los 8, y las 3 resoluciones de Sala
Plena de 2021-2022 clasificadas como tal.
