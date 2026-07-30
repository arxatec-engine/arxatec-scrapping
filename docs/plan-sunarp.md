# Plan SUNARP — módulo `sunarp` (P3, Tribunal Registral + SIP)

> Escrito 2026-07-30. Cuarto módulo P3, tercero sobre el cliente gob.pe
> compartido. Cubre DOS filas del Excel: "SUNARP – Tribunal Registral" y
> "SUNARP – SIP (precedentes)".

## 1. Reconocimiento

- El sitio propio de SUNARP redirige a gob.pe y **el SIP está caído**
  (`sip.sunarp.gob.pe` no responde) — gob.pe es el canal oficial vigente.
- SUNARP publica ~70k normas en gob.pe, mezcladas (zonas registrales,
  gerencias, superintendencia). Con término "tribunal registral" +
  filtro por patrón del número quedan las del Tribunal:
  - `…-SUNARP-TR[-sede]` — resoluciones de casos del Tribunal Registral;
  - `…-SUNARP/PT` — acuerdos de **Pleno** (donde nacen los precedentes de
    observancia obligatoria → esto cubre la fila SIP).

## 2. El módulo

Molde tce (cliente gob.pe compartido + filtro por patrón) con término
configurable (`SUNARP_TERM`, default "tribunal registral"):

| Campo | Valor |
| --- | --- |
| `type` | `jurisprudence` |
| `document_number` | número verbatim ("2442-2021-SUNARP-TR", "107-2025-SUNARP/PT") |
| `citation` | `Resolución {nº}, Tribunal Registral, {fecha}` |
| `court_chamber` | `/PT` → "Pleno del Tribunal Registral" · `-TR-X` → "Tribunal Registral — Sede X" · `-TR` → "Tribunal Registral" |
| `issuer_entity_ids` | **fijo**: SUNARP (sigla única → fallback nombre completo) |
| `source` | canónico `tregistral` = "Tribunal Registral" (alias SUNARP) |

OCR fallback compartido incluido. Sin checkpoint (barrido + ledger).

## 3. Mandos y verificación

`--limit n` / `SUNARP_LIMIT` · `SUNARP_TERM` · `SUNARP_MAX_SHEETS` ·
`SUNARP_DELAY` / `SUNARP_CONCURRENCY`.
Smoke verificado: **10/10 OK** — 8 acuerdos de Pleno + 2 resoluciones de casos
(14–18 páginas), born-digital, emisor SUNARP enlazado, cita completa en Qdrant.
