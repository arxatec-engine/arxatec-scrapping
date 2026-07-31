# Plan OEFA — módulo `oefa` (P3, Tribunal de Fiscalización Ambiental)

> Escrito 2026-07-30. Sexto módulo P3. Primera fuente cuyo tribunal publica
> como PUBLICACIONES (no normas) — el cliente gob.pe compartido se generalizó
> para eso (`contenido`/`tipo` opcionales en `fetchRulesPage`).

## 1. Reconocimiento

- El stream de **normas** del OEFA (~9.7k) solo trae resoluciones
  institucionales (CD/PCD/OAD) — las del TFA NO están ahí.
- Las resoluciones del TFA viven como **informes-publicaciones** (items
  `Report` del buscador, ~7.3k publicaciones con término "TFA"), con el mismo
  PDF en CDN. El título ES el número: "Resolución Nº001-2011-OEFA/TFA".
- Colecciones del portal (826 + 32 + 4 items) enumeran menos que el buscador.

## 2. El módulo

| Campo | Valor |
| --- | --- |
| Búsqueda | `contenido=publicaciones`, `tipo=Report`, término "TFA", filtro `OEFA/TFA` en el número |
| `document_number` | número limpio (sin el prefijo "Resolución Nº") |
| `type` | `jurisprudence` |
| `citation` | `Resolución {nº}, Tribunal de Fiscalización Ambiental, {fecha}` |
| `court_chamber` | "Sala Especializada N" si el número trae `-SEn`; si no, el Tribunal |
| `issuer_entity_ids` | **fijo**: OEFA (sigla → fallback nombre completo) |
| `source` | canónico `toefa` = "Tribunal de Fiscalización Ambiental" |

Las TFA antiguas (2011+) son ESCANEADAS: el OCR local compartido las rescata
automáticamente (verificado en el smoke: 33 chunks de un escaneo de 13 págs).

## 3. Mandos y verificación

`--limit n` / `OEFA_LIMIT` · `OEFA_TERM` (default "TFA") · `OEFA_MAX_SHEETS` ·
`OEFA_DELAY` / `OEFA_CONCURRENCY`.
Smoke verificado: **10/10 OK** (escaneadas vía OCR con warning auditable).
La fila "OEFA – API datos abiertos" (P4) es aparte y sigue pendiente.
