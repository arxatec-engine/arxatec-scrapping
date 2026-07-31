# Plan Reguladores — módulo `reguladores` (P4: OSINERGMIN, OSIPTEL, SUNASS, OSITRAN)

> Escrito 2026-07-30. UN módulo, CUATRO fuentes (como `sunarp` cubrió dos
> filas): los cuatro reguladores publican su normativa en gob.pe con el mismo
> patrón, así que un solo barrido parametrizado evita cuadruplicar el molde.

## 1. Reconocimiento (todo vía el cliente gob.pe compartido)

| Regulador | Normas en gob.pe | Muestra |
| --- | --- | --- |
| OSINERGMIN | ~28.9k | `152-2026-OS/CD`, `85-2026-OS/PRES` |
| OSIPTEL | ~8k | `083-2026-GG/OSIPTEL` |
| SUNASS | ~4.5k | `028-2026-SUNASS-PE` |
| OSITRAN | ~10.3k | `044-2026-CD-OSITRAN` |
| **Total** | **~51.6k** | frescos (julio 2026), PDF en CDN |

Alcance de la fila: la **normativa** del regulador (consejo directivo,
presidencia, gerencia, tarifas, reglamentos) → `type=normative`. Sus
tribunales de reclamos de usuarios (TRASU/JARU/TRASS: reclamos individuales,
bajo valor jurídico y con datos personales) quedan fuera a propósito.

## 2. El módulo

- `REGULADORES` (constants) define cada uno: slug gob.pe, key del catálogo
  canónico, sigla (citas/emisor) y nombre de entidad (fallback).
- Barrido por regulador SIN término ni filtro (toda su normativa es el
  alcance); **ledger compartido** (los ids de gob.pe son únicos globales) con
  la institución en cada registro.
- `source` y `issuer` POR DOCUMENTO según su regulador — primera vez que un
  módulo emite varias fuentes canónicas (tanda P4, huella `9d59636e…` en los
  3 repos, espejos ya en main).
- `citation`: `Resolución {nº}, {SIGLA}, {fecha}` (la sigla hace legible la
  cita; el `source` persiste el nombre canónico completo).
- OCR fallback compartido incluido.

## 3. Mandos y verificación

`--limit n` / `REG_LIMIT` (tope GLOBAL) · `--solo <slugs>` / `REG_SOLO`
(p.ej. `--solo osiptel,sunass`) · `REG_MAX_SHEETS` (por institución) ·
`REG_DELAY` / `REG_CONCURRENCY`.
Smoke verificado: **3/3 por regulador (12/12), 0 errores**, born-digital,
emisor y fuente canónica correctos por documento en Qdrant.
