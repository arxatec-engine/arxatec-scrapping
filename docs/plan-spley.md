# Plan SPLEY — módulo `spley` (proyectos de ley del Congreso)

> Escrito 2026-07-31. Cubre la fila "Congreso – Proyectos de ley (SPLEY)".
> Estrena `status = "En revisión"` (valor que ya existe en el filtro de la
> plataforma): un proyecto NO es norma vigente y jamás debe confundirse con
> una en el corpus. Decisión de vigencia = determinista por fuente, nunca IA
> (el LLM no puede saber si algo está derogado; no está en el texto).

## 1. La API (SPA Angular, ingeniería inversa del bundle)

Base: `api.congreso.gob.pe/spley-portal-service` (headers Origin/Referer del
portal).
- `GET /periodo-parlamentario` → períodos (2021, 2026…).
- `POST /proyecto-ley/lista-con-filtro` `{perParId, rowStart, pageSize}` →
  lista con número, título, estado (`desEstado`), fecha, proponente, autores.
  **14.864 proyectos** en el período 2021-2026.
- `GET /expediente/{enc(perParId)}/{enc(pleyNum)}` → detalle con la **SUMILLA**
  (la propuesta completa). Los params van **CIFRADOS**: AES-128-ECB/Pkcs7,
  Base64 URL-safe, clave `ProdALg5ZrAsxBMD` (pública en el JS del cliente —
  solo ofusca la URL). Reproducido en `services/spley/crypto`. Orden correcto
  de params: `(perParId, pleyNum)` (verificado: otros órdenes dan 404).

**El PDF NO se usa**: su endpoint (`/archivo/{id}/pdf`) responde 500 de forma
inestable. En su lugar el módulo compone un PDF de texto (Puppeteer) con
título + sumilla + estado + proponente + autores — que ES la esencia de un
proyecto de ley para el RAG ("qué propone, quién, en qué estado"). Robusto:
la ruta caliente solo depende de lista + expediente, ambos estables.

## 2. Contrato

| Campo | Valor |
| --- | --- |
| `type` | `normative` |
| **`status`** | **`"En revisión"`** (default del módulo; refleja el trámite y separa del corpus vigente en el filtro) |
| `document_number` | "14864/2025-CR" |
| `citation` | `Proyecto de Ley {nº}, Congreso de la República, {fecha}` |
| `issuer_entity_ids` | **fijo**: Congreso de la República |
| `source` | `Congreso de la República` (canónico ya existente — sin rotación de huella) |
| `source_url` | deep-link al expediente en el portal |
| `published_at` | fecha de presentación |

## 3. Mandos y verificación

`--limit n` / `SPLEY_LIMIT` · `SPLEY_PERIODOS` (CSV; default: todos) ·
`SPLEY_DELAY` / `SPLEY_CONCURRENCY`.
Smoke **8/8 OK**, y lo importante verificado E2E: en Qdrant `status="En
revisión"` y en el list del backend **`status=En revisión` → 8 · `Vigente` →
128** — el casillero del filtro que estaba vacío ahora tiene contenido real y
los proyectos no se mezclan con las normas vigentes.

## 4. Vigencia — la política (para todo el corpus, no solo SPLEY)

- **Determinista por fuente, NUNCA el LLM**: la derogación no está en el texto
  del documento (una ley se deroga por OTRA posterior). Adivinarla en un
  producto legal es el peor error posible.
- SPLEY → `"En revisión"`. El resto sigue `"Vigente"` provisional (decisión
  de Harry: ninguna fuente gratuita da la derogación oficial).
- **Mejora futura (derogación DETECTADA, no adivinada)**: un post-proceso que
  busque patrones explícitos en el texto de normas nuevas ("deróguese la Ley
  N.º X", "déjese sin efecto…") y marque la norma X como `"Derogado"`. Eso es
  evidencia textual verificable — proyecto aparte (pasada sobre el corpus +
  endpoint de actualización de status en el backend).
