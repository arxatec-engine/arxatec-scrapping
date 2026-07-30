# Plan Tribunal de Contrataciones — módulo `tce` (P3, tercero de la cola)

> Escrito 2026-07-30. Tercer módulo P3, segundo sobre el cliente gob.pe
> compartido. La fila del Excel es "OSCE – Tribunal de Contrataciones"; el
> organismo hoy se llama OECE y el tribunal, Tribunal de Contrataciones
> Públicas (TCP).

## 1. Reconocimiento

- El OECE publica en gob.pe **~85.7k normas** (`institucion[]=oece`), y entre
  ellas están TODAS las resoluciones del Tribunal, frescas (julio 2026) y con
  PDF en CDN — **más y mejor que su colección "compendio"** (13.4k, paginación
  HTML de 514 hojas), que queda descartada.
- El número identifica la sala: `07562-2026-TCP-S1` … `7642-2026-TCP-S6`.
- `institucion[]=osce` ya no existe como slug (renombre a OECE).

## 2. El módulo

Molde indecopi + filtro por patrón del número (sufijo `TC[EP]-S<n>`, cubre la
era TCE histórica): las resoluciones PRE/GG institucionales del OECE quedan
fuera de esta fila.

| Campo | Valor |
| --- | --- |
| `type` | `jurisprudence` (jurisprudencia administrativa, como PJ/TC/Tribunal Fiscal) |
| `document_number` | número verbatim ("7642-2026-TCP-S6") |
| `citation` | `Resolución {nº}, Tribunal de Contrataciones del Estado, {fecha}` |
| `court_chamber` | del sufijo: `S6` → "Sala 6" |
| `issuer_entity_ids` | **fijo**: OECE — por sigla única del catálogo, fallback nombre completo |
| `source` | canónico `tce` = "Tribunal de Contrataciones del Estado" (alias OSCE/OECE/TCP) |

OCR fallback compartido incluido (el histórico OSCE puede traer escaneados).
Sin checkpoint: barrido del buscador (~3.430 páginas por los 85.7k del OECE;
`TCE_MAX_SHEETS` acota en pruebas) + ledger como memoria.

## 3. Mandos y verificación

`--limit n` / `TCE_LIMIT` · `TCE_MAX_SHEETS` · `TCE_DELAY` / `TCE_CONCURRENCY`.
Smoke verificado: **10/10 OK** — born-digital (32–63 chunks, hasta 38 páginas),
salas S3/S6 detectadas, emisor OECE enlazado, cita completa en Qdrant.
