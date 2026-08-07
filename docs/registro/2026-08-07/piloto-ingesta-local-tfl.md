# Piloto: `tfl` ingiriendo por su cuenta

> Escrito 2026-08-07. Primer módulo que deja de pasar por
> `POST /legal-documents/ingest` y escribe él mismo en Vertex, Qdrant,
> PostgreSQL y S3. Todo lo de aquí está **ejecutado**, no proyectado.
>
> Commits verificados: este repo en la rama `feat/ingesta-local` (`71ab190`) ·
> `arxatec-lawyer-assistant` en `2d540b0` (main).
>
> Contexto y decisión: [`plan-lanzamiento-paralelo.md`](./plan-lanzamiento-paralelo.md) §7.
> Este documento es el **modelo a replicar** en los otros 7 módulos.

---

## 1. Qué se construyó

`src/services/ingest-local/` — una librería compartida, **no** una copia por
módulo:

| Fichero | Qué hace |
| --- | --- |
| `index.ts` | Orquesta: extraer → trocear → embeddings → Qdrant → PG → S3 |
| `ids.ts` | `document_id` y ids de punto deterministas (uuid5) |
| `chunk.ts` | Cabecera por chunk, troceado y los 41 metadatos |
| `text.ts` | Extracción de texto del PDF (`unpdf`) |
| `embeddings.ts` | Vertex con semáforo **por proceso** y reintento ante 429 |
| `qdrant.ts` | *delete-first* + upsert con el formato de punto exacto |
| `postgres.ts` | Upsert del documento y reemplazo de vínculos con entidades |
| `s3.ts` | Subida del original |
| `config.ts` | Lectura de entorno, con fallo temprano y explícito |

### 1.1 La decisión que hace barato replicarlo

Se respeta una costura que **ya existía**:

```
ingestRequest(ctx, pdfBytes, filename, metadata) → IngestResult
```

Como las dos rutas devuelven el mismo `IngestResult`, **el módulo no se entera
de cuál se usó**: el ledger, el fallback de OCR, los warnings y `pnpm verify`
siguen funcionando sin tocar una línea. Cablear un módulo nuevo es cambiar su
fachada de ingesta (unas 20 líneas) y nada más.

`INGEST_MODE=local` lo activa; **por defecto sigue siendo `remote`**, así que
ningún módulo cambia de comportamiento sin pedirlo.

---

## 2. Qué se midió

### 2.1 Antes de escribir el port: ¿es alcanzable la equivalencia?

| Pieza | Resultado | Conclusión |
| --- | --- | --- |
| Troceador (`@langchain/textsplitters` vs Python) sobre el mismo texto | **19/19 chunks idénticos carácter a carácter** | Porta exacto |
| Extracción de PDF (`unpdf` vs `pypdf`), PDF real de 10 páginas | 99,6 % de similitud media (mín. 98,7 %) | **La igualdad byte a byte no es alcanzable** |

Por eso el criterio de aceptación exige igualdad donde es un **contrato** e
equivalencia donde es una **implementación**.

### 2.2 El mismo PDF por las dos rutas

Se envió el **mismo fichero** (845 KB, 4 páginas) al assistant con un
`source_url` distinto —para no pisar lo que escribió Node— y se compararon los
puntos resultantes:

| | Node (local) | Assistant (Python) |
| --- | --- | --- |
| Chunks | **22** | **22** |
| Similitud del texto por chunk (sin cabecera) | **94,1 % de media**, mín. 72,9 % | — |

La divergencia es el arrastre de las pequeñas diferencias del extractor: el
contenido es el mismo, cambian espaciados.

### 2.3 Estructura del punto: idéntica

| | Node | Assistant |
| --- | --- | --- |
| Claves de payload | `page_content`, `metadata` | iguales |
| Nº de metadatos | **41** | **41** (mismo conjunto de claves) |
| Vector | sin nombre, 1024 dims | igual |
| Forma del chunk | cabecera + `---` + `[PAGE n]` + texto | igual |

### 2.4 La prueba que de verdad importa

**El lector real del assistant recupera lo que escribió Node**: se hizo una
búsqueda con su propio `QdrantVectorStore` filtrando por el documento escrito
en local → **3 resultados**, con título, fuente y la entidad emisora enlazada.

### 2.5 Veredicto mecánico y velocidad

```
pnpm verify tfl 3   (INGEST_MODE=local)   →  PASS — 3 documentos OK
```

| Ruta | Medición | Ritmo |
| --- | --- | --- |
| Remota (2026-08-06) | 3 docs / 110 chunks / 19,6 s | **5,6 chunks/s** |
| **Local (2026-08-07)** | 3 docs / 185 chunks / 13 s | **14,2 chunks/s** |

**≈2,5× más rápido.** No es una comparación perfecta —son documentos distintos y
el assistant corría con un solo worker—, pero es lo que hicieron las dos
configuraciones tal y como están hoy.

---

## 3. Lo que solo apareció al ejecutarlo

Tres desajustes que **ninguna lectura del código habría revelado**, y que van a
repetirse en los otros 7 módulos si no se sabe:

| Síntoma | Causa real |
| --- | --- |
| `column "document_type" does not exist` | La columna se llama **`type`**; el modelo de SQLAlchemy expone `document_type` y mapea a otro nombre |
| `invalid input syntax for type json` | `keywords`/`concepts`/`references` son **JSONB**, no arrays de Postgres: hay que serializarlos |
| `null value in column "created_at"` | `legal_document_entities.created_at/updated_at` son NOT NULL **sin default**: en Python los pone SQLAlchemy |

---

## 4. Deuda abierta del piloto

| Id | Punto | Estado |
| --- | --- | --- |
| P-1 | **Troceado por artículo** para `document_type='codigo'` (254 líneas en Python) sin portar. `tfl` no lo necesita; `spij` y `elperuano` sí | 🔴 |
| P-2 | Solo se extrae **PDF**. El assistant soporta además docx, xlsx, pptx e imágenes | 🟡 según fuente |
| P-3 | `document_relations` no se escribe: ningún módulo envía relaciones hoy | ⏸ |
| P-4 | **OCR**: hoy sigue el rodeo heredado (fallo → OCR → re-render a PDF → reingesta). En local se puede OCR-ear en el sitio y ahorrar el re-render | 🟡 mejora clara |
| P-5 | **Saltar lo ya ingerido**: si el `content_hash` no cambió, no hace falta volver a pagar los embeddings. Hoy se re-embebe siempre | 🟡 ahorro directo |
| P-6 | Cuota de Vertex: con 8 módulos el techo efectivo es 8 × `EMBEDDING_MAX_CONCURRENCY`. **Sigue sin conocerse** | 🔴 |

---

## Registro de cambios

| Fecha | Commit verificado | Qué cambió |
| --- | --- | --- |
| 2026-08-07 | `71ab190` (rama `feat/ingesta-local`) · `2d540b0` (assistant) | Nace el registro. Librería `ingest-local`, `tfl` cableado tras `INGEST_MODE`, y las mediciones: 22 chunks por ambas rutas, 94,1 % de similitud de texto, estructura de punto idéntica, el lector del assistant recupera lo escrito por Node, `pnpm verify tfl 3` en PASS y ≈2,5× de ritmo. |
