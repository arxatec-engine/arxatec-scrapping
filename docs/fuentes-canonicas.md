# Fuentes jurídicas canónicas — la regla de los tres repos

> Catálogo: `src/services/sources/index.ts` · Espejos: assistant
> `app/storage/legal_documents/shared/sources.py` · platform
> `src/types/legal_documents` (enum + alias). Cambiar una fuente exige tocar
> los tres; cada repo tiene validación que fija el mapeo.

## La regla

Cada fuente tiene tres piezas, con roles que NO se mezclan:

| Pieza | Ejemplo | Para qué sirve | Dónde puede aparecer |
| --- | --- | --- | --- |
| `key` | `tc` | Identificador técnico (nombre del módulo, env, logs) | Código y configuración |
| `canonicalName` | `Tribunal Constitucional` | El nombre oficial COMPLETO | **Lo único que se persiste en la base y se muestra en la UI** |
| `aliases` | `TC`, `Tribunal constitucional` | Siglas y variantes históricas | Solo detección, normalización y búsqueda |

- Una sigla **jamás** se guarda como `source` ni se muestra en el filtro.
- La comparación de alias ignora mayúsculas y tildes.
- Un valor **desconocido** se pasa tal cual y se ADVIERTE en el log — no se
  inventan expansiones de siglas no registradas.
- **Fuente ≠ entidad emisora ≠ área legal**: un documento del SPIJ tiene
  fuente `Sistema Peruano de Información Jurídica`, emisor (p. ej.)
  `Ministerio de Educación` y área `Derecho de educación`. Tres campos, tres
  catálogos, nunca se sustituyen entre sí.

## Dónde se aplica

1. **Scrapers (este repo)**: los defaults de `INGEST_SOURCE` salen de
   `sourceByKey(key).canonicalName`, y ambos clientes de ingesta
   (`src/services/assistant`, `src/services/ingest`) re-normalizan
   `metadata.source` justo antes de enviar — aunque alguien exporte
   `INGEST_SOURCE=TC`, a la base llega el nombre completo.
2. **Assistant**: el endpoint `/legal-documents/ingest` normaliza `source` al
   validar (choke point único: TODO documento pasa por ahí), y el buscador de
   la biblioteca expande alias (buscar `TC` encuentra documentos de
   `Tribunal Constitucional`).
3. **Platform**: el enum `LEGAL_SOURCE` solo contiene nombres canónicos, y la
   UI normaliza defensivamente valores legados antes de mostrarlos.

## Cómo agregar una fuente nueva

1. Registrar `key` + `canonicalName` + `aliases` en los TRES catálogos.
2. El módulo scraper usa `sourceByKey("<key>").canonicalName` como default.
3. Añadir la fila a la tabla de `registro/2026-07-21/estado-integracion-legal.md`.
4. Actualizar la validación/pruebas de cada repo (fijan el mapeo).
5. Nunca añadir la sigla al filtro visual: el enum solo lleva canónicos.
