# Estado de la integración legal — end to end

> Escrito 2026-07-21/22. Traza el dato **desde el scraper hasta el front y la IA**,
> a través de los tres repos, y dice qué funciona y qué falta. Es el mapa para
> retomar y priorizar. Repos: `arxatec-scrapping` (scrapers), `arxatec-lawyer-assistant`
> (Python: plano legal + ingesta), `arxatec-lawyer-service` (Node: API + chat),
> `arxatec-ui` (front).
>
> **Ruta:** movido a `docs/registro/2026-07-21/` el 2026-08-04, al estrenar la
> carpeta de registro; antes era `docs/estado-integracion-legal.md`.

---

## ⚠️ Reverificado el 2026-08-04 — los dos huecos ya no existen

> Reverificado contra `e6a0eef` (este repo), `f776a8f` (assistant) y `6cc4d83d`
> (service). Método: lectura del código real de los tres repos, no de la
> documentación de ninguno.

Este documento es un **testigo del 21-22 de julio** y así hay que leerlo. Dos
semanas después, sus dos huecos están cerrados —y el primero **no** por la vía
que este documento especificaba:

| Lo que decía | Lo que pasó de verdad |
| --- | --- |
| **Hueco 1**: el chat no usa el corpus legal; falta que el Python exponga `POST /legal-documents/internal/search`. | Ese endpoint **nunca llegó a existir en el Python** —y no va a existir. Se resolvió por la Opción B de `arxatec-lawyer-assistant/docs/registro/2026-07-24/TRAZABILIDAD_FUENTES.md` §4: el Node lee **Qdrant directo** y reusa el vector ya calculado del turno, así que ni siquiera gasta embeddings. Ver `arxatec-lawyer-service/src/modules/assistant/facade/turn_preparation/legal_search/index.ts:24-40` y `.../vector_storage/collections/legal_documents/v2/index.ts:7`. Comprobado además que `app/modules/legal_documents/` del Python no tiene slice `internal_search`. |
| **Hueco 2**: falta la pantalla de biblioteca jurídica **en `arxatec-ui`**. | Está construida, y en **otro repo**: `arxatec-lawyer-platform`, en `src/modules/cases/features/view_legal_documents/` con ruta propia (`RouteHelpers.viewLegalLibrary`, usada en `src/components/layout/cases/components/panel_content/index.tsx:24`). En `arxatec-ui` no hay nada legal. |

La lección no es que el documento estuviera mal: era correcto el 22 de julio.
La lección es la **regla 4** — un `.md` describe el código del día en que se
escribió, y el código siguió. Por eso este archivo vive ahora en una carpeta con
fecha en vez de en `docs/`, donde se leía como si fuera el estado de hoy.

**Lo que de este documento sigue siendo útil:** el contrato de fuentes canónicas
(sigue vigente, con su espejo en tres repos) y el diagnóstico del portal del PJ.
**Lo que ya no:** los dos huecos, el backlog priorizado y el estado del scraper
PJ. Para el estado real de las fuentes, el tablero vivo es
[`../../registro-scraping.md`](../../registro-scraping.md).

---

## El pipeline, tramo por tramo

```
[scraper pj/spij] --POST /legal-documents/ingest--> [assistant Python]
        |                                                   |
        |                                    Postgres `documents` (+ links, relations)
        |                                    Qdrant `legal_documents_pe` (vectores)
        |                                    S3 AWS `arxatec-aws-desarrollo` (PDFs)
        v
   ledger local (state/)                     [service Node] --proxy--> lista/detalle/árbol
                                                    |
                                             [chat engine Node] --?--> retrieval legal
                                                    |
                                               [front arxatec-ui]
```

| Tramo | Estado | Detalle |
| --- | --- | --- |
| scraper → `/legal-documents/ingest` | ✅ funciona | multipart, `x-assistant-token`; el módulo PJ está construido y validado |
| ingest → Postgres + Qdrant + S3 | ✅ funciona | el assistant sube a S3 (bucket AWS dev), indexa en `legal_documents_pe` y guarda metadata en `documents` |
| Node → lista/detalle/árbol | ✅ existe (proxy) | `service/.../legal_documents` es un **proxy** al `GET /legal-documents/` del Python (get_list, get, get_tree, get_summary) |
| **front → biblioteca jurídica** | ❌ **falta la vista** | en `arxatec-ui/src` no hay pantalla que consuma esos endpoints (buscado: legal/biblioteca/jurisprud → nada). El "tubo" llega a la API, la UI no está |
| **chat IA → corpus legal** | ❌ **endpoint no cableado** | el engine Node llama `POST /legal-documents/internal/search` que **no existe** en el Python; el Python solo tiene `/legal-documents/query`, marcado "NO CABLEADO, ningún backend lo consume" (+ requiere billing antes de cablear) |

**Resumen:** la adquisición e ingesta están cerradas. Los dos huecos son **de
producto/consumo**: (1) la vista del front, (2) el endpoint de retrieval que el
chat ya espera. Ninguno depende de los scrapers.

## Hueco 1 — el chat no usa el corpus legal (MÁS IMPACTO)

El engine del chat (Node, `arxatec-lawyer-service/src/modules/assistant`) ya tiene
TODO el lado cliente listo: el facade `turn_preparation/legal_search`, el evento
SSE `search_legal_documents`, el schema de respuesta. Solo le falta el endpoint
del Python. Contrato exacto que el Node espera (de `facade/turn_preparation/legal_search/index.ts`):

- **Ruta:** `POST /legal-documents/internal/search`
- **Auth:** `x-assistant-token` (server-to-server, como el ingest — no JWT)
- **Body:** `{ "queries": string[] (≤4), "country": string, "limit_per_query": number }`
- **Respuesta:** `{ "data": { "results": [{ "content": string, "score": number, "metadata": object }], "usage": { "input_tokens": int, "output_tokens": int, "total_tokens": int } | null } }`
- **Semántica:** **retrieval puro** — embeber cada query (Gemini), buscar en
  `legal_documents_pe` filtrando por `country`, devolver top-N chunks. **SIN
  generación LLM** (por eso `output_tokens` ≈ 0; el costo es solo el embedding de
  las queries).
- **Degradación:** el Node nunca falla el turno por esto; si el endpoint no está
  o falla, degrada a "legal unavailable". Por eso hoy el chat responde sin el corpus.

**Cómo implementarlo (assistant Python):** ya existe casi todo en el slice
`app/modules/legal_documents/query/` (embed + búsqueda en Qdrant). Es hacer un
slice nuevo `internal_search/` que reuse el retrieval SIN la generación LLM del
`/query`, con auth `get_current_user_or_assistant` (token), y **registrar el
usage facturable del embedding** (el `/query` avisa explícitamente que no cablear
sin billing = fuga de gasto; ver también la auditoría de fugas de billing). Es
un slice acotado: controller fino + service (embed queries → Qdrant search por
country → map a `{content,score,metadata}`) + schemas.

**Riesgo:** toca el repo crítico (assistant) y el billing. Bajo si se sigue el
patrón de usage existente y se mantiene retrieval-only (costo mínimo). **Requiere
tu visto bueno** antes de shippear (es una feature de producto + billing).

## Hueco 2 — el front no muestra la biblioteca jurídica

El service Node ya expone la lista (proxy al Python). Falta la **pantalla en
`arxatec-ui`** que la consuma: una vista "Biblioteca jurídica" que pegue al
`get_list` del Node (con filtros por área/entidad/fuente/fecha, que la API ya
soporta) y un detalle que use `get` + `get_summary`. Es trabajo de front (React),
con decisiones de diseño/UX que probablemente quieras definir tú.

## Estado del scraper PJ (para la corrida real)

- **Código listo y validado offline.** Bug encontrado y arreglado hoy: el bot
  manager del PJ (Radware) **bloquea axios pero deja pasar `fetch`** → el módulo
  PJ usa `fetch` (ver `services/pj/`). También se añadió `PJ_ROOT` para apuntar a
  una hoja/rama concreta.
- **Bloqueo actual:** el portal throttlea la IP a nivel de conexión
  (`UND_ERR_CONNECT_TIMEOUT`) tras el volumen de hoy. Transitorio. Reintentar con
  el bloqueo disipado; el ledger hace todo reanudable.
- **Comando:** `pnpm run cli -- pj` (ya arreglado el pre-chequeo de pnpm vía
  `pnpm-workspace.yaml`). Con `PJ_ROOT` en el `.env` trae los 11 de "Concurrencia".

## Contrato de fuentes canónicas (catálogo central con alias)

La regla vive en `src/services/sources/index.ts` (espejos: assistant
`app/storage/legal_documents/shared/sources.py` y platform
`src/types/legal_documents`). Tres piezas por fuente: `key` (id técnico del
módulo), `canonicalName` (nombre oficial COMPLETO: lo único que se persiste y
se muestra) y `aliases` (siglas y variantes históricas: solo para
detección/búsqueda). Los clientes de ingesta normalizan `metadata.source`
antes de enviar — una sigla nunca llega a la base — y el backend re-normaliza
al persistir. Detalle completo en `docs/fuentes-canonicas.md`.

| key | Nombre canónico (se persiste y muestra) | Alias registrados |
| --- | --- | --- |
| `pj` | `Poder Judicial` | `PJ`, `Poder judicial` |
| `tc` | `Tribunal Constitucional` | `TC`, `Tribunal constitucional` |
| `spij` | `Sistema Peruano de Información Jurídica` | `SPIJ` |
| `el_peruano` | `Diario Oficial El Peruano` | `El Peruano`, `Diario oficial el peruano` |
| `congreso` | `Congreso de la República` | `Congreso`, `Congreso de la república` |
| `minjus` | `Ministerio de Justicia y Derechos Humanos` | `MINJUS` |
| `defensoria` | `Defensoría del Pueblo` | — |
| `jne` | `Jurado Nacional de Elecciones` | `JNE` |

La antigua decisión pendiente ("¿SPIJ mapea a MINJUS o entra al filtro?") quedó
resuelta: SPIJ es fuente propia con su nombre oficial completo — agrega
normativa de muchos emisores y mapearla a un ministerio sería engañoso.

## Backlog priorizado (lo que queda)

1. **Correr los 11 de PJ** end-to-end (cuando el portal destrabe) — valida el pipeline vivo.
2. **Endpoint `/legal-documents/internal/search`** (Hueco 1) — el de más impacto: hace que la IA use el corpus. Necesita tu OK (billing).
3. **Vista biblioteca jurídica** en el front (Hueco 2).
4. **Módulo El Peruano (P1)** — la fuente del millón (ver `estrategia-fuentes.md`). Siguiente gran módulo tras PJ.
5. **Módulo Tribunal Constitucional** — siguiente silo de jurisprudencia (~10k).
6. **Commit/push** del módulo PJ + extracción compartida (todo sin commitear en `arxatec-scrapping`).
7. **SPIJ + Chromium:** para correr SPIJ hay que aprobar el build de puppeteer (`pnpm-workspace.yaml`: `puppeteer: true` + `pnpm install`, baja Chromium).
   **Verificado 2026-07-24:** si el binario no está, la corrida aborta con
   `Could not find Chrome (ver. 131.0.6778.204)` y el ledger queda intacto (reanudable).
   Fix directo, sin tocar el lockfile: `npx puppeteer browsers install chrome`.
   Solo SPIJ lo necesita — renderiza el PDF desde HTML; PJ y TC descargan el PDF original.

---

## Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-07-21/22 | Nace (`45749cc`): traza del dato de punta a punta, los 2 huecos y el backlog priorizado. |
| 2026-07-22 | Se añade el contrato de fuentes canónicas (`acf9b4f`). |
| 2026-07-25 | Última actualización de contenido, junto al catálogo canónico con alias (`e1cec31`). |
| 2026-08-04 | Mudanza a `docs/registro/2026-07-21/` y **reverificación**: los dos huecos están cerrados y el Hueco 1 se resolvió por una arquitectura distinta a la que este documento especificaba (Qdrant directo desde Node, no endpoint HTTP en Python). Ver el aviso de la cabecera. El cuerpo del documento se deja **tal cual**: es el testigo de julio, no el estado de hoy. |
