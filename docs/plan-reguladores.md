# Plan Reguladores — módulos `osinergmin` · `osiptel` · `sunass` · `ositran` (P4)

> Escrito 2026-07-30. Cuatro módulos gemelos (decisión del owner: una carpeta
> por regulador, respetando la convención un-módulo-por-fuente); los cuatro
> publican su normativa en gob.pe con el mismo patrón y calcan el molde
> compartido (cliente gob.pe + OCR).

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

- Cada módulo (`src/modules/<regulador>/`) fija en sus constants: slug
  gob.pe, sigla (citas/emisor por sigla única, fallback nombre) y fuente
  canónica (tanda P4, huella `9d59636e…` en los 3 repos, espejos ya en main).
- Barrido SIN término ni filtro (toda la normativa del regulador es el
  alcance de su fila); ledger y estado propios (`state/<regulador>_ingest/`).
- `citation`: `Resolución {nº}, {SIGLA}, {fecha}` (la sigla hace legible la
  cita; el `source` persiste el nombre canónico completo).
- OCR fallback compartido incluido.

## 3. Mandos y verificación

`pnpm <regulador> [--limit n]` · `<REGULADOR>_MAX_SHEETS` ·
`<REGULADOR>_DELAY` / `<REGULADOR>_CONCURRENCY` (p.ej. `pnpm sunass --limit 5`,
`OSIPTEL_MAX_SHEETS=10`).
Smoke verificado: **3/3 por regulador + 2/2 tras el refactor a carpetas
propias** (reanudación del ledger repartido comprobada), 0 errores,
born-digital, emisor y fuente canónica correctos en Qdrant.
