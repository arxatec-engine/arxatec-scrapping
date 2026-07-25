# Catálogo de entidades del Estado — fuente, refresco y orden de ejecución

> Módulo `src/modules/entidades/` · comando `pnpm entidades` (o `npx tsx src/cli.ts entidades`).
> Refresca `public/data/entity.json`, el catálogo que usan (1) el matcher de emisores de los
> scrapers y (2) el filtro "Entidad" de la biblioteca jurídica del assistant.

## 1. La fuente: el directorio oficial de gob.pe

Los datos salen del **buscador de instituciones de la Plataforma Digital Única del Estado**
(gob.pe), consumiendo el MISMO endpoint JSON que usa el propio portal:

```
https://www.gob.pe/busquedas.json?contenido[]=instituciones&sheet=<página>
```

- Paginado: 25 instituciones por página (`sheet=1..N`); el portal reporta ~3.700 en total.
- Cada resultado trae `name_with_parent` ("Universidad Nacional de Barranca (UNAB)",
  "Corte Superior de Justicia de Pasco - CSJP") y `action_url` (el slug oficial, ej. `/unab`).
- Versión humana para verificarlo en el navegador:
  `https://www.gob.pe/busquedas?contenido[]=instituciones` — y el índice por categorías en
  `https://www.gob.pe/estado` (poder ejecutivo, legislativo, judicial, organismos autónomos,
  gobiernos regionales y locales).
- Ritmo educado: 1 request cada 0.4 s (configurable con `--delay <segundos>`), User-Agent de
  navegador, 3 reintentos con backoff. La corrida completa toma ~2–12 min según latencia.

## 2. Por qué este scraper NO tiene ledger (la "memoria" es el catálogo)

A diferencia de spij/pj/tc, aquí **no hay `state/ledger`**: cada corrida descarga el directorio
COMPLETO y lo compara contra `public/data/entity.json`. El catálogo es la única memoria, y es un
archivo versionado en git que se puede inspeccionar y revertir. Eso hace el refresco confiable:

- **Nada se borra ni se renombra**: los ids del catálogo ya están referenciados en el Postgres del
  assistant (`legal_document_entities`) y en los payloads de Qdrant. Una entidad existente
  conserva id y nombre aunque gob.pe la escriba distinto (la diferencia se REPORTA como
  "renombre sugerido", no se aplica).
- **Solo se AÑADE lo nuevo**, con id determinista (uuid v5 del nombre normalizado): correr el
  scraper dos veces produce exactamente los mismos ids.
- **Match en dos pases**: nombre normalizado exacto y, si falla, firma de tokens sin preposiciones
  ("Municipalidad Provincial **del** Cusco" = "Municipalidad Provincial **de** Cusco") — solo
  cuando la firma es única en el catálogo.
- **Subgrupo inferido del propio catálogo** por mayoría de prefijo (ej. "MUNICIPALIDAD DISTRITAL"
  → subgrupo *Distrital*, 1003/1019). Sin mayoría clara (≥80 %, ≥3 muestras) queda
  `subgroup_id: null` y se reporta — el matcher ignora entidades sin subgrupo, así que un hueco
  nunca produce un vínculo malo.
- Cada corrida deja `state/entidades/report.json` con los números (nuevas, inferidas, renombres,
  ausentes) ANTES de decidir: `--dry` genera solo el reporte sin tocar nada.

## 3. Orden de ejecución del scraping (el pipeline completo)

El vínculo documento→entidad se resuelve **en el momento de la ingesta** (el backend solo enlaza
ids que existan en su Postgres). Por eso el catálogo va SIEMPRE antes que los documentos:

```
1. pnpm entidades --dry            # ver el reporte: ¿hay nuevas? ¿inferencias razonables?
2. pnpm entidades --sync           # escribe public/data/entity.json Y el seed del assistant
   (ruta del seed: ENTIDADES_ASSISTANT_TIPOS o ../arxatec-lawyer-assistant/app/seed/legal_documents/tipos)
3. (en el assistant)  poetry run python -m app.seed.legal_documents.catalog_seed
   # upsert idempotente: siembra las entidades nuevas en Postgres
4. pnpm spij / pnpm pj / pnpm tc   # los documentos, ya con el catálogo completo
```

Notas:

- **"¿Entidades corre solo si hay nuevas?"** — corre siempre y es barato; si no hay nuevas es un
  no-op (0 añadidas) y el reporte lo dice. La regla simple: *entidades primero, siempre*, antes de
  cualquier corrida grande de documentos.
- **Cadencia**: el directorio del Estado cambia despacio (nuevos programas, OCDs, licenciamientos
  de universidades). Mensual es de sobra; lo importante es correrlo antes de cada re-ingesta
  masiva.
- **Documentos ya ingestados con emisor sin vincular**: tras sembrar el catálogo, basta re-correr
  el scraper de esa fuente — la identidad por `source_url` hace que la re-ingesta REEMPLACE el
  documento y esta vez enlace la entidad (sin duplicar).
- El assistant es la **fuente de verdad** del catálogo (`app/seed/legal_documents/tipos/`);
  `public/data/` de este repo es su espejo de trabajo. `--sync` mantiene ambos iguales.
