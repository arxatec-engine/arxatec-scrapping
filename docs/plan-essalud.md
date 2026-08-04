# Plan ESSALUD — módulo `essalud` (Seguro Social de Salud)

> Escrito 2026-08-03 a pedido del abogado del equipo. A diferencia de los
> módulos de tribunal, ESSALUD **no tiene tribunal propio que aislar**: se
> ingesta su normativa institucional completa.

## 1. La fuente y su aviso de calidad

Patrón gob.pe estándar (`institucion[]=essalud`, sin término ni filtro de
sigla) con PDF born-digital en el CDN.

⚠ **Medición del recon (3 muestras de páginas distintas): entre el 40% y el
70% del stream son ACTOS ADMINISTRATIVOS INTERNOS** — aceptar renuncias,
designar funcionarios, aceptar donaciones, autorizar devoluciones — y no
normas de seguridad social.

Se ingestan igual, por la regla del repo (**volumen primero, limpieza de
biblioteca después**, decisión de Harry) y porque son trazables por `source`:
si producto decide filtrarlos, el corte va en
`src/modules/essalud/services/gobpe` y es una línea. Lo valioso para el
abogado —resoluciones sobre acreditación, prestaciones y cobertura— viaja en
el mismo stream.

## 2. El módulo

`src/modules/essalud/` (molde `servir` sin el filtro por sigla). Emisor FIJO
ESSALUD por sigla del catálogo, con fallback a "Seguro Social de Salud".

| Campo | Valor |
| --- | --- |
| `type` | `normative` (no es tribunal: resoluciones administrativas, como los reguladores) |
| `status` | `Vigente` |
| `source` | `Seguro Social de Salud` (canónico NUEVO `essalud`, huella `ec75056f…` rotada en los 3 repos) |
| `issuer_entity_ids` | ESSALUD (fijo) |
| `court_chamber` | `null` |

## 3. Mandos y verificación

`--limit n` / `ESSALUD_LIMIT` · `ESSALUD_MAX_SHEETS` · `ESSALUD_DELAY` /
`ESSALUD_CONCURRENCY` / `ESSALUD_UA`. Está en `DOC_SCRAPERS`.

**Smoke 2026-08-03: 6/6 OK, 0 errores, 0 warnings** (`pnpm verify essalud 6`):
born-digital, emisor ESSALUD enlazado en los 6.

## 4. Decisión pendiente de producto

Si el ruido de actos internos molesta en el RAG, las opciones son (a) filtrar
por patrón de número (`-PE-`, `-GG-` suelen ser internos) o (b) filtrar por
contenido con heurística. Ninguna es perfecta: la separación real
"norma general vs. acto de administración" no está etiquetada en la fuente.
