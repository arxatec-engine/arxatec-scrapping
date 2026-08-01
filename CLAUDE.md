# CLAUDE.md — arxatec-scrapping

Scraper de fuentes legales públicas del Perú. **Un módulo por fuente** en
`src/modules/` → todos arman el mismo contrato → `POST /legal-documents/ingest`
del backend `arxatec-lawyer-assistant`. Aquí se **construyen y validan** módulos
(smokes de 10–20 docs); las corridas de volumen van en la VM aparte
([`docs/campania-vm.md`](docs/campania-vm.md)).

## Lee esto primero (en orden)

0. [`docs/runbook-arranque.md`](docs/runbook-arranque.md) — **cómo se opera**:
   orden de arranque, reanudación (re-ejecutar el mismo comando), verificación
   y reset. Lo primero si vas a CORRER algo, no a programarlo.
1. [`docs/registro-scraping.md`](docs/registro-scraping.md) — **EL TABLERO VIVO.**
   Las 43 fuentes del Excel, qué está hecho, el contador de avance y el comando
   de cada módulo. La verdad del estado está AQUÍ (la sección "Estado actual" de
   `docs/README.md` es histórica y puede estar vieja).
2. [`docs/README.md`](docs/README.md) — índice de los ~21 docs: estrategia de
   fuentes, anti-bloqueo, campaña VM y un `plan-<fuente>.md` por módulo.
3. Antes de tocar un módulo concreto: su `docs/plan-<fuente>.md`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm <fuente> [--limit n]` | Corre un módulo (`spij`, `pj`, `tc`, `elperuano`, `tfiscal`, `indecopi`, `tce`, `sunarp`, `servir`, `oefa`, `osinergmin`, `osiptel`, `sunass`, `ositran`, `gobpe`, `sunat`, `spley`, `doctrina`). `--limit` = smoke. |
| `pnpm verify <fuente> [n]` | **La señal mecánica**: smoke con `--limit n` (default 5) + veredicto PASS/FAIL por delta del ledger. Úsalo antes de dar un módulo por bueno. |
| `pnpm entidades [--sync]` | Refresca el catálogo de entidades. **SIEMPRE antes** de ingestar docs (el backend solo vincula emisores ya sembrados). |
| `pnpm all` / `pnpm status` | Orquestador (entidades primero, pequeño-primero) / avance por fuente desde los ledgers (no toca la red). |
| `pnpm typecheck && pnpm test` | Obligatorios antes de cada commit. |

Gestor: **pnpm, nunca npm**. Puppeteer exige Chrome
(`npx puppeteer browsers install chrome`). OCR exige poppler (`pdftoppm`).

## Convención de módulos (no romper)

- `src/modules/<fuente>/` con `config/constants/services/utils/run`. Solo
  funciones e interfaces, **sin clases**. TypeScript ESM corrido con `tsx`.
- **Reanudable**: ledger + checkpoint en `state/<fuente>_ingest/` (`pj` usa
  `state/pj_jurisprudencia/`). `state/` es el mecanismo oficial anti-duplicados
  = **activo de producción**: nunca borrarlo; respaldar tras corridas grandes.
- Checklist completo para un módulo nuevo: sección "Cómo añadir un módulo
  nuevo" del registro (módulo → subcomando en `src/cli.ts` + `package.json` →
  `DOC_SCRAPERS` → fuente canónica → emisor → marcar el tablero).

## Contrato de ingesta (lo que rompe silenciosamente)

- Tipos en `src/types/common` (`Metadata`/`IngestData`); cliente en
  `src/services/assistant` (`IngestClient`).
- El backend **exige al menos una fecha** (`effective_date`/`effective_from`/
  `published_at`/`issued_at`) y **`subarea` no vacía** (usar `"General"`).
- `status` es **determinista por fuente, NUNCA lo decide un LLM** (spley =
  `"En revisión"`; el resto `"Vigente"` provisional — decisión del owner). Un
  status inventado hace el doc invisible a los filtros de la plataforma.
- `source` = nombre canónico de `src/services/sources`. El mapa alias→canónico
  tiene **huella SHA-256 fijada en tests de TRES repos** (aquí
  `src/services/sources/index.test.ts`, assistant
  `tests/test_legal_sources.py`, platform `canonical_source.test.ts`): añadir
  una fuente = actualizar catálogo y huella **en los tres a la vez**.
- Emisor: la entidad debe existir en `public/data/entity.json` (si no:
  `pnpm entidades` + sembrar en el assistant). Privadas (universidades) NO
  están en el catálogo del Estado → issuer vacío con warning es lo correcto.
- PDF escaneado → el backend responde 400 → reingesta con el OCR compartido
  (`src/services/ocr`), warning auditable en el ledger.

## Gotchas de red (detalle en `docs/anti-bloqueo-scraping.md` y cada plan)

- **pj**: Radware bloquea axios pero deja pasar `fetch`; `PJ_DELAY` alto, IP
  residencial, sin ráfagas (throttlea por IP a nivel conexión).
- **elperuano**: el visor es intermitente (0.2 s o cuelga >60 s) → timeout
  corto + reintentos; el CSV índice viene en CP850.
- **gobpe**: la paginación topa ~400 hojas → ventanas de 1 día; NO corre en
  `all` (decisión owner).
- **sunat**: charset mixto UTF-8/latin-1; fecha = piso del año.
- **doctrina**: muchos portales sirven su SPA en la ruta OAI (falso 200) —
  confirmar `?verb=Identify` devuelve XML OAI antes de añadir a `REPOS`.
- **spley**: API con params cifrados AES (clave en `services/spley/crypto.ts`);
  el PDF del portal es inestable → se renderiza PDF propio.
- **adlp**: el HTTPS de leyes.congreso.gob.pe es INTERMITENTE (cuelga o
  responde al toque — no está "caído"); el grid del buscador trunca en
  silencio a 20 filas → ventanas de ≤20 números.

## Entorno y verificación

- `.env` (gitignored): `INGEST_BASE_URL` (assistant local :8000) e
  `INGEST_TOKEN` (= `ASSISTANT_SYNC_TOKEN` del assistant; en su .env va entre
  comillas → leer con dotenv, jamás con `cut`). NO definir
  `INGEST_SOURCE`/`INGEST_STATUS` globales (pisarían el source por módulo).
- El smoke real necesita el assistant corriendo. GOTCHA: al matar su uvicorn,
  los hijos retienen `:8000` — matar los PID de `ss -tlnp | grep 8000`.

## Git

- Rama por unidad de trabajo + PR; el owner mergea en GitHub. **Nunca push
  directo a main.** `gh` no está instalado: los PR se crean con la URL
  `github.com/arxatec-engine/arxatec-scrapping/pull/new/<rama>`.
- Al terminar un módulo, el MISMO PR actualiza el registro: ✅ en su fila +
  contador (convención: ✅ = fuente cosechando de verdad, no "cubrible").
