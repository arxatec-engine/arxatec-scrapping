# La identidad del documento es la URL, y gob.pe publica la misma resolución dos veces

> Escrito 2026-08-20 · verificado contra `main` de `arxatec-scrapping` y contra el
> PostgreSQL local del assistant tras una ingesta real de TFL.
> Método: ingesta acotada (`tfl --limit 12`, dos tandas) y consulta directa a la
> base. Encontrado desde `arxatec-lawyer-service` al montar un golden set de
> recuperación; se registra aquí porque la causa vive en la ingesta.
> Fecha por `date +%F` (local `-05`).

## Lo que pasa

En 24 documentos ingestados del Tribunal de Fiscalización Laboral, **dos comparten
número**:

```sql
select document_number, count(*) from documents
group by document_number having count(*) > 1;
-- 005-2023-SUNAFIL-TFL | 2
```

Y no es un fallo de la ingesta: son **dos URL distintas** publicadas por gob.pe
para la misma resolución.

| `document_id` | `source_url` |
| --- | --- |
| `f6b50c8e…` | `…/sunafil/normas-legales/3914769-005-2023` |
| `90bbbe06…` | `…/sunafil/normas-legales/3914799-005-2023` |

## Por qué la ingesta no lo puede evitar hoy

Es una consecuencia deliberada del diseño de identidad, documentada en el propio
código (`src/services/ingest-local/ids.ts:7-8`):

> «`source_url` es la identidad natural: re-ingestar la misma fuente produce el
> MISMO `document_id` y por tanto reemplaza en vez de duplicar.»

Esa decisión es correcta y resuelve el problema frecuente —reingestar sin duplicar—.
Lo que no cubre es el caso inverso: **la misma resolución publicada bajo dos
direcciones**. Con URL distinta, `buildDocumentId` produce dos ids y las dos entran.

## Qué cuesta

En el corpus pequeño de la prueba es ruido menor. A escala importa por tres vías:

1. **Recuperación**: los dos documentos compiten por el mismo `top_k`, así que una
   consulta de `fast` (3 documentos) puede gastar dos de sus tres huecos en la
   misma resolución.
2. **Coste**: se embebe y se almacena dos veces el mismo texto.
3. **Citas**: el asistente puede citar la misma resolución como si fueran dos
   fuentes distintas que se respaldan entre sí.

## Lo que NO es

No es un problema del `arxatec-lawyer-service`. El service solo lee de Qdrant y
PostgreSQL; no decide identidad de documento. Se registra aquí porque el arreglo,
si se hace, vive en la ingesta.

## Opciones, sin recomendación cerrada

| Opción | Qué implica |
| --- | --- |
| Dejarlo | Es la única fuente donde se ha observado; puede ser una rareza de SUNAFIL en gob.pe. Barato, y honesto mientras no se mida en más fuentes. |
| Deduplicar por `(source, document_number, país)` al ingestar | Ataca la causa, pero cambia la identidad natural y hay que decidir qué URL gana cuando difieren. |
| Detección posterior | Un chequeo que liste números repetidos por fuente y deje la decisión a una persona. No bloquea la ingesta. |

Antes de elegir conviene saber **si pasa en más fuentes**: con una sola
observación no se sabe si es un caso aislado o el patrón de gob.pe.

## Lo que queda abierto

| id | Qué | Estado |
| --- | --- | --- |
| **DU-1** | Medir cuántos números repetidos hay por fuente cuando el corpus crezca | 🔴 abierto, es el paso previo a decidir |
| DU-2 | Decidir la política de identidad ante la misma resolución en dos URL | 🟡 a decisión del owner |

## Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-08-20 | Nace. Detectado al montar un golden set en el service: `005-2023-SUNAFIL-TFL` entró dos veces porque gob.pe lo publica bajo dos URL y la identidad del documento se deriva de `source_url`. |
