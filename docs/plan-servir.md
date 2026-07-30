# Plan SERVIR — módulo `servir` (P3, Tribunal del Servicio Civil)

> Escrito 2026-07-30. Quinto módulo P3, cuarto sobre el cliente gob.pe
> compartido (patrón consolidado: ~30 min por módulo con smoke incluido).

## 1. Reconocimiento

- SERVIR publica **~168k normas** en gob.pe (la institución con más volumen
  vista hasta ahora). Sin término, el stream trae resoluciones institucionales
  (PE, GG-ORH); con **término "TSC"** salen las resoluciones de las dos salas
  del Tribunal, con PDF en CDN.
- El formato del número varía por época: `005982-2024-Servir/TSC:Primera
  Sala`, `03726-2023-SERVIR-TSC-Primera_Sala`, `1877-2017-Servir-TSC-…` — el
  filtro es el patrón `SERVIR…TSC` con separador flexible.
- Las colecciones por sala del portal (Sala 1: ~236 hojas ≈ 5.9k; Sala 2;
  precedentes) enumeran lo mismo que el stream — no hicieron falta.

## 2. El módulo

| Campo | Valor |
| --- | --- |
| `type` | `jurisprudence` |
| `document_number` | número verbatim |
| `citation` | `Resolución {nº}, Tribunal del Servicio Civil, {fecha}` |
| `court_chamber` | del número: "Primera Sala" / "Segunda Sala" |
| `issuer_entity_ids` | **fijo**: SERVIR (sigla única → fallback "Autoridad Nacional del Servicio Civil") |
| `source` | canónico `tservir` = "Tribunal del Servicio Civil" (alias SERVIR/TSC) |

Cliente gob.pe compartido + OCR fallback. Sin checkpoint (barrido + ledger).

## 3. Mandos y verificación

`--limit n` / `SERVIR_LIMIT` · `SERVIR_TERM` (default "TSC") ·
`SERVIR_MAX_SHEETS` · `SERVIR_DELAY` / `SERVIR_CONCURRENCY`.
Smoke verificado: **10/10 OK** — resoluciones de la Primera Sala de 8–17
páginas (17–39 chunks), born-digital, emisor enlazado, cita y sala en Qdrant.
