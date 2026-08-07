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

## 5. Revisión del piloto: tres fallos que la lectura no dio

Se repasó el código ya funcionando, y aparecieron tres cosas. Merecen quedar
escritas porque **las tres se repetirían en los otros 7 módulos**:

| Fallo | Por qué importa |
| --- | --- |
| **pdf.js *desprende* el ArrayBuffer** que recibe | Tras extraer el texto, el PDF quedaba inservible. Rompía S3 **y habría roto el fallback de OCR**, que reutiliza esos mismos bytes. Se le pasa una copia |
| Credenciales de S3 con nombres no estándar | El assistant usa `AWS_KEY_ACCESS`/`AWS_KEY_ACCESS_SECRET`; el SDK de AWS busca `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`. Con la cadena por defecto **la subida falla por autenticación aunque el bucket esté bien** |
| Semáforo reinventado y clasificación de errores por regex | El repo ya tenía `semaphore()` en `utils/http`. Y adivinar el código de estado con una regex de `4xx\|5xx` puede confundir cualquier número del mensaje: clasificar mal es caro en las dos direcciones |

**S3 verificado de punta a punta** tras el arreglo: el original aparece en
`public/legal_documents/PE/<document_id>/005-2023-SUNAFIL-TFL.pdf` (455 KB), con
la misma convención de ruta que usa el assistant.

---

## 6. Plan por fases para los otros 7 módulos

El objetivo no es clonar `tfl`: **cada fuente es distinta**. Lo que se replica es
la *lógica* —ingesta local, ritmo cortés, antibloqueo, reanudación— y, donde se
pueda, se mejora.

### Fase 1 · Lo que hay que resolver ANTES de tocar módulos

Son deudas del piloto que bloquean a fuentes concretas:

| Id | Qué | Bloquea a |
| --- | --- | --- |
| P-1 | Troceado **por artículo** para `document_type='codigo'` | `spij`, `elperuano` |
| P-2 | Extracción de **docx/xlsx/pptx/imágenes** | según lo que sirva cada fuente |
| P-6 | **Cuota de Vertex**: con 8 módulos el techo es 8 × `EMBEDDING_MAX_CONCURRENCY` | los 8 |

**P-6 es el único que puede tumbar la campaña entera** y sigue sin dato.

### Fase 2 · El módulo unificado de `gob.pe` (el más grande)

Absorbe 13 subfuentes, y es donde el ritmo cortés importa de verdad porque las 13
comparten `www.gob.pe/busquedas.json`.

Lo que se gana al fundirlas en un proceso: **un throttle compartido de verdad**
(hoy son 13 independientes), **un Chrome en vez de 13** (~9,6 GB) y un pool de
OCR controlado.

Orden sugerido dentro del módulo: por volumen de documentos, porque **este carril
es el camino crítico de la campaña**.

Antes de subir su concurrencia: medir qué tolera `www.gob.pe` con **una** sola
subfuente, por escalones (2 → 4 → 6), anotando cuándo aparecen 429/403. Ese
número es el presupuesto del carril y se reparte entre las 13.

### Fase 3 · Los carriles propios, por dificultad creciente

| Orden | Módulo | Por qué en esa posición |
| --- | --- | --- |
| 1 | `tc` | Carril propio, sin antibot conocido: el segundo piloto más barato |
| 2 | `sunat` | Carril propio; ojo al charset mixto UTF-8/latin-1 |
| 3 | `congreso` (`adlp` + `spley`) | Su HTTPS es **intermitente** (cuelga o responde al toque, no está caído): exige timeout corto y reintento con espera creciente |
| 4 | `elperuano` | Mucho volumen y visor intermitente. **Necesita P-1** |
| 5 | `doctrina` | 8 hosts universitarios distintos; los repositorios OAI sirven a veces su SPA con un falso 200 |
| 6 | `spij` | Entra por API con cuenta: distinto a todo lo demás. **Necesita P-1** |
| 7 | `pj` | **El último a propósito**: Radware bloquea por IP de datacenter y throttlea por conexión. Exige IP residencial y ritmo lento |

### Fase 4 · Regla de operación (decisión del owner)

> Si una fuente falla porque su sitio está caído o la bloquea el antibot, **no se
> detiene la tanda**: se anota como deuda, se pasa a la siguiente y se reintenta
> al cerrar la ronda.

Esto ya es barato porque cada módulo tiene su ledger: reintentar es reejecutar el
mismo comando.

### Fase 5 · Mejoras sobre la ruta de Python (opcionales, medibles)

No es obligación replicar lo que hacía el assistant si se puede hacer mejor:

| Id | Mejora | Ganancia |
| --- | --- | --- |
| P-4 | **OCR en el sitio**: hoy se hereda el rodeo «falla → OCR → re-render a PDF → reingesta». En local se puede OCR-ear y trocear directamente | Se ahorra un render y una segunda pasada completa |
| P-5 | **Saltar lo ya ingerido**: si el `content_hash` de los chunks no cambió, no volver a pedir los embeddings | Ahorro directo de dinero en re-ingestas |

### Qué NO se toca en ningún módulo

El formato del punto de Qdrant, los ids deterministas y el esquema de PostgreSQL
**no son estilo, son contrato**: el chat del assistant lee de esa misma
colección. Mejorar la extracción o el ritmo, sí; cambiar la forma del dato,
solo con los tres repos a la vez.

---

## Registro de cambios

| Fecha | Commit verificado | Qué cambió |
| --- | --- | --- |
| 2026-08-07 | `e2fb04e` (rama `feat/ingesta-local`) · `2d540b0` (assistant) | Revisión del piloto (§5): pdf.js desprende el ArrayBuffer y dejaba inservible el PDF para S3 y para el OCR; las credenciales de S3 tienen nombres que el SDK de AWS no reconoce; y se reutiliza el semáforo del repo en vez del que había escrito. S3 verificado de punta a punta. Nace §6 con el plan por fases de los 7 módulos restantes. |
| 2026-08-07 | `71ab190` (rama `feat/ingesta-local`) · `2d540b0` (assistant) | Nace el registro. Librería `ingest-local`, `tfl` cableado tras `INGEST_MODE`, y las mediciones: 22 chunks por ambas rutas, 94,1 % de similitud de texto, estructura de punto idéntica, el lector del assistant recupera lo escrito por Node, `pnpm verify tfl 3` en PASS y ≈2,5× de ritmo. |
