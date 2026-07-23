# Deuda técnica — qué arreglar antes del siguiente scraper

> Escrito 2026-07-21. Producto de auditar el **código real** de dos repos, no los
> planes: `arxatec-scrapping` (este repo, el scraper) y `arxatec-lawyer-assistant`
> (el backend Python que recibe la ingesta). Cada punto cita `archivo:línea` para
> que se pueda verificar. Documentos hermanos: `estrategia-fuentes.md` (qué
> fuentes y en qué orden) y `plan-poder-judicial.md` (el próximo módulo, PJ).
>
> **Este doc responde el checklist §7 de `estrategia-fuentes.md`** (lo que había
> que verificar del lado del assistant). Ver la tabla al final.
>
> **Actualización 2026-07-21 (misma fecha, segunda pasada):** se aplicaron todos
> los arreglos posibles del lado del scraper — ver el **Registro de arreglos** al
> final. Cada ítem lleva ahora su estado: ✅ corregido · 🟡 mitigado (falta la
> parte backend) · ⏸ diferido a propósito · ✔ decidido.
>
> **Actualización 2026-07-21 (tercera pasada): Harry respondió las 4 decisiones
> por Slack.** Ya no queda NADA bloqueando el siguiente scraper. En corto:
> A1 dedupe backend = futuro media-baja, el ledger es el mecanismo oficial;
> A2 status = crítico pero futuro, provisional **todo con `"Vigente"`**;
> A3/A4 = lo que la fuente no dé o no matchee, **IA de Groq** (patrón aprobado).
> La dirección general: no buscar la perfección ahora — volumen primero,
> "mejora brutal a nivel biblioteca jurídica" (limpieza de datos) después.

---

## Resumen en 30 segundos (en simple)

El scraper de SPIJ **funciona y el contrato con el backend está entendido**. Antes
de subir el volumen (millón de documentos, módulo PJ y los que siguen) hay **cuatro
cosas de fondo que decidir** porque, si no, ensucian toda la base a escala:

1. **El backend NO detecta duplicados.** Si mandas el mismo documento dos veces,
   se guarda dos veces (dos filas, dos copias en S3, dos veces en el buscador
   vectorial). Hoy lo único que evita duplicados es el "cuaderno" local del
   scraper; si ese cuaderno se borra o el documento viene de dos fuentes distintas,
   se duplica. **A escala de un millón esto es caro y ruidoso.**
2. **El estado del documento ("vigente", "activo"…) está escrito de dos maneras.**
   El scraper manda `"Vigente"`; el backend por dentro usa `"active"`. Nadie valida,
   así que la base queda con dos idiomas mezclados y filtrar por estado se vuelve
   poco fiable.
3. **El "tipo" y la "fuente" del documento son texto libre, sin validación.** Un
   error de tipeo (`administrative` en vez de `administrative_act`) entra sin avisar
   y parte el corpus en categorías fantasma.
4. **Si una entidad emisora no existe en la base, el documento se guarda sin
   emisor y sin error.** El scraper debería revisar que el documento quedó bien
   enlazado.

Además hay **deuda menor del repo** (el README raíz está desactualizado, falta la
librería para leer HTML que el módulo PJ va a necesitar). Nada de esto bloquea
*hoy*, pero conviene ordenarlo antes de multiplicar fuentes.

**Veredicto:** ninguna de estas es un bug que rompa la corrida actual; son
**decisiones de diseño que hay que tomar antes de escalar**, más limpieza barata.

**Estado tras la segunda pasada (2026-07-21):** del lado del scraper ya se arregló
todo lo arreglable — #3 y #4 quedaron mitigadas en código (typo de `type` ya no
compila; emisor no enlazado queda marcado en el ledger), el README se reescribió y
el tipado quedó limpio.

**Estado tras la tercera pasada (2026-07-21, decisiones de Harry):** las 4 están
decididas. #1: el ledger local es el mecanismo oficial (backend = futuro,
media-baja). #2: crítico pero futuro; provisional todo `"Vigente"` (además es lo
único que los filtros de producción encuentran — ver A2). #3 y #4: lo que la
fuente no dé, IA de Groq. **Camino libre para el módulo PJ.**

---

## A. Bloqueantes de contrato (assistant ↔ scrapper)

> Estos NO se arreglan solo en el scraper: tocan el backend y/o requieren decisión
> de producto con Harry. Son los que hay que cerrar **antes** de escalar volumen.

### A1 · El backend no deduplica — cada ingesta crea un documento nuevo — ✔ DECIDIDO (Harry, 2026-07-21): ledger local es el mecanismo oficial

> **Decisión de Harry (Slack):** el backend efectivamente no deduplica y mejorar
> el `/ingest` del assistant queda como **futuro, prioridad media-baja**. "Ahora
> mismo está bien el state local que se guarda."
> **Consecuencias operativas:** (1) el ledger pasa de workaround a **mecanismo
> oficial** → `state/` es un activo de producción: no borrarlo y **respaldarlo**
> tras cada corrida grande (basta copiar `ledger.jsonl`); (2) cada módulo nuevo
> DEBE tener clave natural estable en su ledger (PJ: `recurso|sala`); (3) el
> dedupe **cross-fuente** (casaciones PJ↔El Peruano) sigue sin dueño — retomarlo
> como pre-chequeo en el scraper cuando arranque El Peruano (P1), no antes.

- **Qué pasa:** el endpoint genera un `document_id` nuevo en cada request
  (`arxatec-lawyer-assistant/app/modules/legal_documents/ingest/service.py:494`,
  `document_id = uuid.uuid4()`) y la tabla `documents` **no tiene ninguna
  restricción de unicidad** — solo índices no únicos
  (`app/db/models.py:369-375`). Reingestar el mismo PDF responde `200 OK` y crea:
  fila nueva en Postgres + chunks nuevos en Qdrant + objeto nuevo en S3.
- **Lo único que hoy evita duplicados:** el ledger local del scraper, que dedupea
  **por `id` dentro de su propio `state/`** (`src/modules/spij/utils/store/index.ts:6-19`,
  `latestRecords` indexa por `rec.id`). Esto NO cubre dos casos que aparecen al
  escalar:
  - Si se borra o se pierde `state/spij_ingest/` → reingesta todo, duplicado.
  - **Cross-fuente:** la misma casación está en PJ *y* en El Peruano; las RTF están
    en Tribunal Fiscal *y* en El Peruano. Ledgers distintos → nunca se dedupean
    entre sí (ya anticipado en `estrategia-fuentes.md` §5).
- **Riesgo:** a escala de seis cifras, duplicación silenciosa = costo S3/Qdrant,
  respuestas del RAG con el mismo documento repetido, métricas infladas.
- **Decisión pendiente (Harry):** ¿dedupe en el backend con una **clave natural**
  (`document_number` + emisor, o hash del archivo, o `source_url`) que responda
  `409`? ¿O se acepta y se resuelve solo con disciplina de ledger + una clave
  natural estable por fuente? Hoy el `409` que el scraper ya sabe tratar como
  "permanente" (`src/modules/spij/services/assistant/index.ts:8`) **nunca se
  dispara** porque el backend no lo emite.

### A2 · `status`: dos vocabularios conviviendo — ✔ DECIDIDO PROVISIONAL (Harry, 2026-07-21): un solo vocabulario (`Vigente`) hasta resolver vigencias

> **Decisión de Harry (Slack):** es "un problema tocho", **prioridad alta y
> crítica pero a futuro** — todavía no hay forma de saber si una norma sigue
> vigente o fue derogada (solo el SPIJ de pago lo resuelve oficialmente).
> **Acuerdo provisional mientras tanto — un solo vocabulario: `"Vigente"`.**
> No es solo lo más barato de migrar después: es lo **funcionalmente correcto
> hoy**, porque `status` SÍ se consume con match exacto:
> - `legal_documents/query` filtra `metadata.status` en Qdrant (match_any,
>   `query/service.py:122`) y hay **índice KEYWORD** sobre `status`
>   (`storage/legal_documents/v2/indexes.py:10`);
> - `legal_documents/list` filtra `documents.status IN (...)` en Postgres
>   (`list/repository.py:140`);
> - el **propio ejemplo del backend** documenta `"statuses": ["Vigente"]`
>   (`query/schemas.py:24`) — ese es el vocabulario de facto de producción.
>
> Un módulo que mande `"active"` haría sus documentos **invisibles** para esos
> filtros. Por eso: **todos los módulos mandan `Vigente`** (PJ incluido; para
> jurisprudencia es una constante sin semántica de vigencia, documentada) hasta
> que exista el acuerdo definitivo. La migración futura será un mapeo 1→1 por
> tipo de documento + cambio de defaults en un solo paso.
>
> **⚠️ Por qué la IA NO debe decidir `status` (evaluado y descartado 2026-07-21):**
> la vigencia **no está en el texto del documento** — una norma nunca dice "estoy
> derogada"; lo dice OTRA norma publicada años después. Groq leyendo el documento
> solo puede adivinar, y un status alucinado en un campo que producción filtra
> con match exacto es peor que una constante honesta. La vigencia real se
> resolverá con **datos externos**: el grafo de derogaciones que se puede
> construir con las `references` que Groq YA extrae de cada norma (por eso hay
> que cuidar esa extracción — es la materia prima del fix futuro), los metadatos
> de El Peruano, o el SPIJ de pago. Si alguien propone "que la IA ponga el
> status", la respuesta es este párrafo.

- **Qué pasa:** el scraper manda `status: "Vigente"` por defecto
  (`src/modules/spij/config/index.ts:72`, vía
  `src/modules/spij/utils/metadata/index.ts:29`). El backend **no valida** el
  campo — es string libre (`app/modules/legal_documents/ingest/schemas.py:80`) —
  así que `"Vigente"` entra tal cual a la columna `documents.status` y a
  `metadata.status` en Qdrant. Pero el **vocabulario canónico** del backend es
  otro: `active / repealed / modified / expired / unknown`
  (`app/storage/legal_documents/shared/enums.py`, `LegalDocumentStatus`), y el
  seed de demo escribe `"active"` (`app/seed/legal_documents/main.py:292`).
- **Riesgo:** el índice `ix_documents_status` termina con dos idiomas mezclados
  (`Vigente` de SPIJ, `active` del seed, lo que mande cada módulo nuevo). Filtrar
  por estado se vuelve poco fiable. Y para **jurisprudencia** el concepto
  "Vigente" ni siquiera aplica (una sentencia no se deroga).
- **Decisión pendiente (Harry):** fijar **un** vocabulario y alinear scraper +
  backend. Para jurisprudencia, ¿`active`, `unknown`, u otro valor?

### A3 · `type` y `source` son texto libre, sin enum — 🟡 mitigado en el scraper + patrón IA aprobado (2026-07-21)

> **Arreglado acá:** `Metadata.type` ya no es `string` sino el union type
> `LegalDocumentType` (`src/types/common/index.ts`) con los 4 valores del enum del
> backend + `"codigo"`. Un typo ahora es **error de compilación**; todo módulo
> nuevo hereda la restricción. **Sigue pendiente** la validación del lado backend
> (rechazar con 422 lo que no esté en el enum) — decisión del assistant, ojo con
> incluir `"codigo"` si se hace.
> **Decisión de Harry (Slack):** las props que la fuente no brinde (tipo, área…)
> **se generan con IA de Groq** — el patrón que SPIJ ya usa para `legal_area` es
> el aprobado para todas las fuentes. El union type acota lo que la IA puede
> elegir (nunca inventa un `type` fuera del enum). Para PJ ni hace falta: `type`
> es constante (`jurisprudence`) y la materia la da el árbol de navegación.

- **Qué pasa:** `type` (default `"normative"`) y `source` son `str` sin validación
  en el schema del ingest (`schemas.py:59` y `schemas.py:77`). El enum real vive en
  storage: `jurisprudence / normative / administrative_act / doctrine`
  (`shared/enums.py`, `LegalDocumentType`).
- **Consecuencia directa para los próximos módulos:**
  - PJ debe mandar exactamente `type: "jurisprudence"`.
  - Tribunales administrativos (Tribunal Fiscal, INDECOPI, OSCE…) → `administrative_act`,
    **no** `"administrative"` (el plan lo dejaba como "confirmar"; ya está confirmado).
  - Doctrina → `doctrine`.
  - Dato extra no documentado en los planes: `type: "codigo"` activa **chunking por
    artículo** en el backend (`app/modules/legal_documents/ingest/service.py:43`,
    `_CODE_DOCUMENT_TYPES`) — útil para códigos consolidados.
- **Riesgo:** un typo entra en silencio y fragmenta el corpus en tipos fantasma
  que ningún filtro espera.
- **Acción:** en cada módulo, mandar valores del enum como constantes (no strings
  sueltos). Idealmente el backend debería validar contra el enum y devolver `422`.

### A4 · Entidades emisoras inválidas se descartan sin avisar — ✅ corregido lado scraper + fallback IA aprobado (2026-07-21)

> **Arreglado acá:** `ingestOne` ahora compara los `issuer_entity_ids` enviados
> contra el `linked_entities` de la respuesta; si se mandó emisor y el backend
> enlazó 0, loguea warning y graba `ingest.warning` en el ledger
> (`src/modules/spij/utils/ingest/index.ts`). **No** se reintenta (reingestar
> duplicaría por A1); el ledger queda como lista de revisión:
> `grep '"warning":' state/spij_ingest/ledger.jsonl`. El comportamiento silencioso
> del backend queda documentado; cambiarlo a error es decisión del assistant.
> **Decisión de Harry (Slack):** "la entidad emisora siempre existe; solo en
> casos muy raros no existiría — y si no existe, lo pasamos con IA de Groq".
> **✅ IMPLEMENTADO (2026-07-21, cuarta pasada):** el fallback IA ya corre en
> SPIJ y queda listo como patrón para El Peruano:
> - Solo se activa cuando el determinista queda `unmatched` (cero costo extra
>   en el caso normal). `topCandidates()` arma la lista corta por solapamiento
>   de tokens (el catálogo entero no cabe en un prompt) y `elegirEntidad()`
>   (Groq, temperature 0) elige — **validando que el id devuelto esté entre los
>   candidatos**: la IA no puede inventar entidades fuera de `entity.json`.
> - Resultado marcado `match_confidence: "ia"` (ledger + stats lo separan de
>   exact/fuzzy) y cacheado por sector (misma corrida no repite la llamada).
> - Si aun así no hay emisor, el documento **se ingesta igual** (volumen
>   primero) pero con `warning: "sin entidad emisora"` en el ledger — visible,
>   nunca silencioso. "Garantizar emisor sí o sí" al 100 % es imposible sin
>   inventar datos; esto garantiza lo garantizable: máxima cobertura + cero
>   casos invisibles.

- **Qué pasa:** el backend solo enlaza entidades que existen en la BD; si un UUID
  de `issuer_entity_ids` no existe, se filtra en silencio
  (`service.py` → `_filter_existing_entity_links`, líneas 159-163, sobre lo que
  devuelve `fetch_legal_entities_by_ids`). No hay error: el documento se guarda
  **sin emisor**.
- **Riesgo:** documentos sin `issuer_entity_ids` correctos → el filtro por entidad
  emisora del RAG no los encuentra. A escala, difícil de detectar a posteriori.
- **Acción (lado scraper):** tratar la respuesta como QA — la respuesta trae
  `linked_entities` (`IngestResponse`, `schemas.py:204`); si es `0` cuando se
  esperaba ≥1, marcar el documento como sospechoso en el ledger en vez de darlo por
  bueno. Hoy el scraper loguea `linked_entities` pero no actúa sobre él
  (`src/modules/spij/utils/ingest/index.ts:137`).

---

## B. Deuda del propio repo de scrapping

> Esto sí se arregla acá, sin depender del backend. Conviene hacerlo **al construir
> el módulo PJ**, no antes (para no tocar por tocar).

### B1 · El README raíz está desactualizado (post-reestructuración) — ✅ corregido (2026-07-21)

> Reescrito desde cero contra el código real: estructura `src/modules/`, scripts
> npm reales, tabla completa de env vars, advertencia de no borrar `state/`
> (única defensa anti-duplicados mientras A1 siga abierto), y puntero a `docs/`.

- El `README.md` de la raíz describe una estructura que **ya no existe**. Referencia:
  `src/spij/cli.ts`, `src/spij/api.ts`, `src/spij/download.ts`, la carpeta `data/`,
  el modo `spij_ingest`, los scripts `npm run spij` / `npm run typecheck`, y los
  docs `CLASSIFICATION_PLAN.md` / `PORTING.md`.
- **Realidad verificada:** el código vive en `src/modules/spij/`; los catálogos en
  `public/data/` (no `data/`); el único subcomando es `spij`
  (`src/cli.ts:30`, `npm run ingest` → `tsx src/cli.ts spij`); y **ninguno** de esos
  archivos/docs referenciados existe.
- **Acción:** reescribir el README raíz para reflejar `src/modules/<fuente>/` y
  apuntar a `docs/`. Barato y evita que la próxima sesión se pierda.

### B2 · Falta parser de HTML (el módulo PJ lo necesita) — ✅ hecho (2026-07-21)

> `pnpm add cheerio` (1.2.0). El módulo PJ ya lo usa para parsear el HTML del WCM.
> Nota: el package manager real del repo es **pnpm** (no npm como decía el README
> viejo); la instalación tocó `package.json` + `pnpm-lock.yaml`. Queda una
> pequeña deuda: hay dos lockfiles (`package-lock.json` de npm, viejo, y
> `pnpm-lock.yaml`); habría que decidir cuál es canónico y borrar el otro.

### B2-OLD · (texto original, ya resuelto)

- El repo no tiene con qué parsear HTML: las deps son `axios, commander, dotenv,
  env-var, puppeteer` (`package.json`). SPIJ consume JSON, por eso nunca hizo falta.
- El módulo PJ scrapea **HTML del portal WCM** (`plan-poder-judicial.md` §2 y §4):
  hay que añadir `cheerio` (recomendado) antes de implementarlo.
- **Por qué diferido:** una dependencia que nada usa es deuda en sí misma; entra
  en el mismo PR que cree `src/modules/pj/`.

### B3 · `INGEST_SOURCE` / `INGEST_STATUS` son config con default de SPIJ — ⏸ diferido al módulo PJ (desbloqueado: A2 ya tiene provisional)

> Con la decisión provisional de A2, el módulo PJ nace con `source="PJ"` y
> `status="Vigente"` como defaults propios. Nada que tocar en SPIJ.

- Hoy la config es única y con defaults de SPIJ: `ingestSource` → `"SPIJ"`
  (`src/modules/spij/config/index.ts:71`), `ingestStatus` → `"Vigente"` (línea 72).
- Cuando se cree `src/modules/pj/`, **debe fijar su propio `source` (`"PJ"`) y su
  propio `status`** en vez de heredar los de SPIJ. El patrón "un módulo = su config"
  ya está; solo hay que respetarlo (nota ya presente en `plan-poder-judicial.md` §4).
- Relación directa con **A2/A3**: si se acuerda el vocabulario con Harry, estos
  defaults cambian.

### B4 · `as any` / `: any` sueltos (tipado, menor) — ✅ corregido (2026-07-21)

- Eran **cuatro** (la auditoría inicial encontró tres; al limpiar apareció uno más):
  - `services/spij/index.ts` (`buscar` devolvía `Promise<any>`) → ahora devuelve
    `BuscarResponse` tipado, y `run/index.ts` perdió su `const data: any`.
  - `utils/classifier/index.ts` ×2 → `_read` devuelve `unknown[]` con narrowing
    real, y las filas de `entity.json` usan la interfaz `CatalogEntityRow`.
  - `services/llm/index.ts` (`const data: any = r.data`) → shape tipado con
    optional chaining; mismo comportamiento (respuesta malformada → análisis vacío).
- Verificado: `grep -rn "as any\|: any" src/` → cero resultados (`RawResult`
  sigue siendo `Record<string, any>` deliberadamente: es el JSON crudo de SPIJ).

---

## C. Lo que YA está bien (no tocar sin razón)

- **Catálogos idénticos byte a byte** entre `arxatec-scrapping/public/data/` y
  `arxatec-lawyer-assistant/app/seed/legal_documents/tipos/` (los 4 JSON, 2.035
  entidades). El seed del backend es idempotente (`session.merge`), así que los
  UUID de `entity.json` que use cualquier módulo son los mismos que hay en la BD.
  ⚠️ Son **copia**: la fuente de verdad debería ser el assistant; si allá cambian,
  hay que re-sincronizar acá.
- **Contrato de ingesta entendido y estable** (multipart, `metadata` como **string**
  no Blob si no `422`, `x-assistant-token`). Detalle en `plan-poder-judicial.md` §3.1.
- **Manejo de errores permanente vs reintentable** bien modelado en el scraper
  (`src/modules/spij/services/assistant/index.ts`: 400/404/409/422 = permanente;
  401/403 = abortar; 429/5xx = backoff).
- **Ledger + checkpoint reanudable** (`src/modules/spij/utils/store/`): reanudar =
  correr el mismo comando. Sólido como molde para el módulo PJ.
- **Sumilla NO hace falta mandarla:** el backend genera el resumen ejecutivo con
  LLM, lazy y on-demand, desde los propios chunks
  (`app/modules/legal_documents/summary/`, `update_document_summary_if_missing`).
  La sumilla del tema del PJ puede ir a `keywords`/`concepts` si se quiere conservar.
- **PDF sin texto = `400`** ("No extractable text",
  `app/modules/legal_documents/ingest/controller.py:79`) y no persiste nada. Encaja
  con la cola de OCR del plan: PDF escaneado → error permanente → marcar para OCR.

---

## Decisiones de Harry (Slack, 2026-07-21) + lo que sigue abierto

Las 4 decisiones de contrato quedaron respondidas (detalle en cada ítem A):

| # | Decisión | Consecuencia práctica |
| --- | --- | --- |
| A1 dedupe | Ledger local = mecanismo oficial; mejorar `/ingest` = futuro, **media-baja** | `state/` es activo de producción: respaldarlo; clave natural estable por módulo; dedupe cross-fuente se retoma con El Peruano |
| A2 status | "Problema tocho", **alta y crítica pero a futuro** (aún no se sabe cómo determinar vigencia) | Provisional: TODO con `"Vigente"` — es el único valor que los filtros de producción encuentran |
| A3 type/source | Props que la fuente no brinde → **IA de Groq** | El union type acota las opciones de la IA; PJ ni la necesita (type constante) |
| A4 emisor | "Siempre existe; si no, lo pasamos con IA de Groq" | Fallback IA para `unmatched` del classifier: implementar con El Peruano; el `warning` del ledger mide la necesidad real |

**Marco general de Harry:** hacerlo perfecto ahora costaría demasiado tiempo y
dinero; ahora toca **alimentar la IA con volumen** y la "mejora brutal a nivel
biblioteca jurídica" (limpieza, precisión, vigencias) viene después. Traducción
operativa: los datos que entren hoy deben ser **consistentes y trazables**
(`source`, `source_url`, ledger, warnings) para que esa limpieza futura sea un
mapeo mecánico y no arqueología.

**Siguen abiertas (no urgentes, no bloquean P0/P1):**

1. **Doctrina:** ¿entra al mismo corpus (`type: doctrine`) o es colección aparte?
2. **Alcance:** ¿normativa regional/local (ordenanzas) o solo nacional por ahora?
3. **SPIJ de pago** como capa de validación de vigencias — conecta directo con A2;
   ¿presupuesto futuro o se asume el riesgo mitigado con metadatos?

---

## Checklist §7 de `estrategia-fuentes.md` — RESUELTO

| # | Pregunta (§7) | Respuesta verificada en código |
| --- | --- | --- |
| 1 | ¿Qué acepta `type`? ¿`source` es enum? | Enum canónico `jurisprudence/normative/administrative_act/doctrine` (`shared/enums.py`), pero el ingest **no valida** (`schemas.py:59,77`): ambos son string libre. → **A3** |
| 2 | ¿El backend rechaza duplicados? ¿con qué llave? | **No.** `uuid4()` por request, sin unique constraint. → **A1** |
| 3 | ¿`status` para jurisprudencia? | String libre en el borde; enum interno `active/…/unknown`. Scraper manda `"Vigente"`. Sin acordar. → **A2** |
| 4 | ¿Catálogos misma versión? | **Sí, idénticos byte a byte.** → **C** |
| 5 | Observabilidad de lo ya ingestado | Key S3 `public/legal_documents/{PAIS}/{document_id}/{filename}` (`service.py:521`); sin texto → `400` sin persistir. → **C** |
| 6 | ¿Hay que mandar sumilla? | **No**, el backend la genera con LLM on-demand. → **C** |

---

## Registro de arreglos — 2026-07-21

Aplicados en este repo, verificados con `npm run typecheck` (limpio):

| Deuda | Cambio | Archivos |
| --- | --- | --- |
| A3 🟡 | Union type `LegalDocumentType` (4 valores del enum backend + `"codigo"`); `Metadata.type` lo usa → typo = error de compilación | `src/types/common/index.ts`, `src/modules/spij/types/spij/index.ts` |
| A4 ✅ | QA post-ingesta: emisor enviado + `linked_entities=0` → `log.warn` + campo `ingest.warning` en el ledger (sin reintento, por A1) | `src/modules/spij/utils/ingest/index.ts`, `types/spij/index.ts` (`IngestRecord.warning`) |
| B1 ✅ | README raíz reescrito contra el código real (estructura, scripts, env vars, advertencia sobre `state/`) | `README.md` |
| B4 ✅ | Cero `as any`/`: any`: `BuscarResponse`, `CatalogEntityRow`, `_read(): unknown[]`, shape tipado en la respuesta de Groq | `services/spij/`, `run/`, `utils/classifier/`, `services/llm/`, `types/spij/` |

Sin cambios de comportamiento en la corrida (solo tipado + el warning nuevo en el
ledger). **No se tocó `arxatec-lawyer-assistant`**: todo lo del backend (A1
dedupe, A2 vocabulario de status, validación de enum de A3, silencio de A4) queda
tras las decisiones con Harry.

### Cuarta pasada (2026-07-21, post-decisiones de Harry) — "lo barato hoy que pesa mañana"

Re-análisis pedido por Yerik sobre qué corregir ya. Lo que se hizo y lo que se
descartó **con razón escrita**:

| Idea | Veredicto | Por qué |
| --- | --- | --- |
| ¿Groq decide `status`/vigencia? | ❌ **Descartado** | La vigencia no está en el texto del documento; la IA solo puede alucinar y ese campo lo filtran con match exacto en producción. Ver el bloque ⚠️ en A2. La materia prima del fix real son las `references` (ya se extraen). |
| ¿Asegurar que Groq clasifica bien tipos/áreas? | ✅ **Hecho (observabilidad)** | `type` nunca fue de la IA (es determinista por módulo). Lo que sí es de Groq es `legal_area`, y su fallback era **silencioso**: si fallaba, el doc caía a "Derecho administrativo" sin rastro. Ahora `areaFallback` queda como warning en el ledger → se puede medir la tasa real de acierto y reclasificar después. |
| ¿Garantizar emisor sí o sí, con Groq de respaldo? | ✅ **Hecho (fallback IA)** | Implementado en SPIJ (ver A4): determinista primero, Groq entre candidatos del catálogo solo si unmatched, id validado, cacheado, marcado `"ia"`. Si ni así: se ingesta con warning visible. |
| ¿Hacer algo con el dedupe (A1)? | ❌ **Nada por ahora** | Harry lo bajó a media-baja y el ledger es el mecanismo oficial. La única mejora barata evaluada (pre-chequeo contra `/legal-documents/list` antes de ingestar) se descartó hoy: duplica requests, depende de la normalización interna del backend (riesgo de falsos negativos) y solo protege contra pérdida del ledger — más barato respaldar el ledger. Se reevalúa si algún día hay corridas multi-máquina. |

Archivos de la cuarta pasada: `types/spij/index.ts` (`MatchConfidence` + `"ia"`),
`utils/classifier/index.ts` (`topCandidates`, `classifFromEntityId`, `cacheSet`),
`services/llm/index.ts` (`elegirEntidad`), `utils/ingest/index.ts`
(`resolveEntityIA`, `areaFallback`, warnings compuestos). Typecheck limpio.

Cómo auditar ingestas aceptadas pero imperfectas (emisor no enlazado, sin
emisor, o área por defecto):

```bash
grep '"warning":' state/spij_ingest/ledger.jsonl
```

Y la distribución de clasificación de emisor (cuánto resolvió la IA) sale en el
resumen final de cada corrida: `conf={exact: N, fuzzy: N, ia: N, unmatched: N}`.

### Quinta pasada (2026-07-21) — extracción compartida al construir el módulo PJ

Al implementar el **segundo** módulo (PJ), en vez de duplicar código se promovió
a `src/` lo que toda fuente comparte. Esto evita la deuda de N copias del mismo
cliente de ingesta / contrato / ledger a medida que se sumen fuentes:

| Se movió a `src/` | Antes vivía en | Ahora lo usan |
| --- | --- | --- |
| `utils/store` (ledger/checkpoint genérico `LedgerRecord`) | `modules/spij/utils/store` | SPIJ (fachada tipada) + PJ |
| `services/assistant` (cliente de ingesta `IngestClient`) | `modules/spij/services/assistant` | SPIJ (fachada) + PJ |
| `types/common` (contrato `Metadata`, `IngestData`, `IngestResult`) | `modules/spij/types/spij` | ambos |

SPIJ quedó con **fachadas delgadas** que adaptan su `Ctx` al núcleo compartido,
así sus call sites no cambiaron y su comportamiento es idéntico (typecheck limpio).
El módulo PJ (`src/modules/pj/`, subcomando `pj`) espeja la estructura de SPIJ y
reusa `src/utils` (http, log, text, time, store) + `src/services/assistant`. Su
clasificación es **determinista desde el árbol** (materia → área, emisor
constante Poder Judicial/Corte Suprema), sin IA — alineado con Harry: se usa el
dato de la fuente cuando existe, IA solo cuando no. Validado offline contra HTML
real (parse, área, metadata, paginación, fechas); typecheck y build limpios. La
corrida en vivo end-to-end queda para la máquina de desarrollo (ver
`plan-poder-judicial.md` §5; el portal rate-limitea desde IP de datacenter).

### Sexta pasada (2026-07-22) — intento de corrida en vivo + gotchas

Al conectar el scraper al assistant local e intentar la ingesta real salieron
tres cosas, todas resueltas o documentadas (detalle end-to-end en
`estado-integracion-legal.md`):

- **`fetch` en vez de axios en el módulo PJ** — el bot manager del PJ (Radware)
  **cuelga a axios (timeout) pero deja pasar `fetch` (undici)**. Verificado en
  vivo (fetch: 200 OK 69KB; axios: timeout). `src/modules/pj/services/pj/index.ts`
  ahora usa `fetch`. SPIJ sigue con axios (otro sitio, sin ese bot manager).
- **`pnpm run` roto por build scripts** — pnpm 11 exige aprobar los builds de
  esbuild/puppeteer o el pre-`install` falla (`ERR_PNPM_IGNORED_BUILDS`). Resuelto
  en `pnpm-workspace.yaml` (`allowBuilds: {esbuild: false, puppeteer: false}`).
  Para SPIJ hay que poner `puppeteer: true` (+`pnpm install`, baja Chromium).
- **Throttle por volumen del PJ** a nivel de conexión (`UND_ERR_CONNECT_TIMEOUT`)
  tras el uso intenso de hoy. Transitorio; el navegador del owner sí entra (tiene
  sesión/fingerprint real). El ledger hace la corrida reanudable.

`.env` del scraper creado y verificado (INGEST_BASE_URL→:8000, INGEST_TOKEN=
ASSISTANT_SYNC_TOKEN, GROQ del assistant; source correcto por módulo). Assistant
local arranca OK (1 head Alembic, sin problema de migración). Qdrant
`legal_documents_pe` estaba vacío (0 puntos); los 8 "documentos basura" eran demo
del seed en Postgres → script `clean_demo_docs.py` (en el assistant) para borrarlos
conservando PJ/SPIJ.
