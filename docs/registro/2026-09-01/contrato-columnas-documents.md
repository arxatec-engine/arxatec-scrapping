# spij: campos vacíos de `documents` — arreglado

> 2026-09-01 · `3792b14` (scrapping) + `542b291` (assistant) + `e9e4547` (service).
> Medido ejecutando: 5 documentos reales en Qdrant + PostgreSQL locales.

## Qué estaba mal

| Campo | Antes | Ahora |
| --- | --- | --- |
| `source_url` | Endpoint interno de la API → **401** para el abogado | Página pública del portal |
| `keywords` | Siempre 2, fijas | 12–22, generadas |
| `concepts` | 5–8, relleno (`artículo`, `sector`) | 10, conceptos jurídicos reales |
| `references` | 0 en 2 de 3 documentos | 3–12 |
| `issued_at` | null | Fecha real de emisión |
| `effective_from` | `null` hardcodeado | Rellenado siempre |

## La causa de casi todo

El LLM recibía **solo la sumilla** — `textoParaClasificar` descarta el HTML si la
sumilla tiene ≥40 caracteres. El texto completo ya se descargaba para renderizar
el PDF; simplemente no se le pasaba. De un resumen de una línea no salen
conceptos, ni fechas, ni citas.

## Lo medido después del arreglo (5 documentos)

| Documento | keywords | concepts | refs | issued_at | published_at |
| --- | --- | --- | --- | --- | --- |
| `000134-2026-SIS/J` | 12 | 10 | 11 | 2026-08-29 | 2026-08-30 |
| `000108-2026-CD/OSIPTEL` | 12 | 10 | 11 | 2026-08-28 | 2026-08-30 |
| `382-2026-EF/10` | 22 | 10 | 3 | 2026-08-28 | 2026-08-30 |
| `370-2026-MINEM/DM` | 12 | 10 | 12 | 2026-08-27 | 2026-08-30 |
| `01019-2026-DE` | 12 | 10 | 10 | 2026-08-26 | 2026-08-30 |

`issued_at` sale distinto de `published_at` en los cinco: el campo se gana el sitio.

Conceptos de antes: `artículo, normativa, regulación, sector, modificación`.
Conceptos de ahora: `competencia efectiva, acceso compartido, proveedor
importante, exoneración de impuestos de aduana`.

## Decisiones

- **`references` sin piso.** Son citas verbatim a normas que existen; exigir 10
  hace que el modelo las invente. Se avisa en el ledger cuando salen menos.
- **`effective_from`** = día siguiente a la publicación (art. 109 de la
  Constitución), y el LLM lo pisa si el texto fija otra fecha. SPIJ no publica
  vigencia: verificado volcando la respuesta cruda del buscador y la de
  `api/detallenorma`.
- **`status`** sigue en `"Vigente"` fijo: SPIJ tampoco publica el estado.
- El mínimo de 10 se **mide**, no se fuerza: warning en el ledger.

## Qué se tocó

- `services/llm/index.ts` — prompt nuevo (extraído a `buildAnalisisPrompt`), 6
  campos, `catch {}` vacío arreglado.
- `utils/ingest/index.ts` — el cuerpo al LLM, no la sumilla; warnings de calidad.
- `utils/metadata/index.ts` — `source_url` público, keywords de IA, las 2 fechas.
- `constants/endpoints/index.ts` — `PORTAL_NORMA`.
- `types/common` + `ingest-local/postgres.ts` + `chunk.ts` — `effective_from` /
  `effective_to` dejan de ser `null` fijo. Opcionales: los otros 20 módulos no
  cambian.

Gates: typecheck limpio, 32/32 tests, 5/5 documentos ingeridos sin errores.

## Lo que queda

1. **⚠️ Migración de `source_url`.** El `document_id` es `uuid5` de la URL
   (`ingest-local/ids.ts:24`). Los documentos de spij ya ingeridos en producción
   con la URL vieja **no se reemplazan: se duplican**. Hay que contarlos y decidir
   entre migrar o reingerir **antes** de correr esto contra producción.
2. **`concepts` no se vectorizan.** Solo se vectoriza el header de
   `buildChunkHeader` + el texto. Los conceptos van al payload, no están entre los
   21 índices de Qdrant y el retrieval no los lee: hoy **no cambian ni un
   resultado de búsqueda**. Meterlos en el header es lo que convierte esto en
   recuperación de verdad — pero toca los dos repos (es un port del
   `_build_chunk_header` de Python) y reembebe el corpus.
3. Replicar a los otros 20 módulos.
