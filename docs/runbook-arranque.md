# Runbook de arranque — cómo se corre esto desde cero

> Para quien llega nuevo (o para retomar tras un parón). Responde tres
> preguntas: **¿cómo arranco?**, **¿qué hago si se cae?** y **¿cómo sé que
> salió bien?**. El tablero de qué fuentes existen está en
> [`registro-scraping.md`](./registro-scraping.md); la campaña desatendida de
> 2 meses, en [`campania-vm.md`](./campania-vm.md).

## 0. La idea en una frase

Cada módulo es **reanudable e idempotente**: lleva un *ledger* (registro
append-only) en `state/<fuente>_ingest/ledger.jsonl` con cada documento y su
resultado. **Si algo se cae — la red, el backend, la luz — se vuelve a correr
EL MISMO COMANDO y continúa donde quedó**, sin duplicar lo ya ingestado. No
hay comando especial de "reanudar": reanudar *es* re-ejecutar.

## 1. Requisitos (una sola vez)

```bash
pnpm install                              # gestor: pnpm, NUNCA npm
npx puppeteer browsers install chrome     # spij, elperuano, spley, adlp… renderizan PDF
sudo pacman -S poppler                    # (Debian: apt install poppler-utils) lo exige el OCR
```

`.env` en la raíz del repo (gitignored):

```
INGEST_BASE_URL=http://127.0.0.1:8000
INGEST_TOKEN=<el ASSISTANT_SYNC_TOKEN del assistant, idéntico>
GROQ_API_KEY=<key>
LLM_MODEL="openai/gpt-oss-20b"     # ⚠ ver aviso abajo
```

⚠ **`LLM_MODEL` NO puede quedar en `llama-3.1-8b-instant`**: Groq lo apaga el
**2026-08-16**. Si se queda fijado ahí, a partir de esa fecha la API responde
400, el scraper **sigue ingestando** pero el área legal de TODOS los documentos
cae al valor por defecto — degradación silenciosa. El código ya trae
`openai/gpt-oss-20b` como default (verificado el 2026-08-04: clasifica igual o
mejor) y avisa por consola si el modelo falla, pero **una línea en el `.env`
gana sobre el default del código**: revísala.

⚠ **No definir `INGEST_SOURCE` ni `INGEST_STATUS`**: son globales y pisarían
la fuente/estado que cada módulo calcula.

## 2. Antes de cada sesión de trabajo

```bash
# 1. El backend que recibe la ingesta (otro repo)
cd ../arxatec-lawyer-assistant && poetry run uvicorn app.main:app   # tarda ~2 s
# 2. Comprobar que responde
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/docs   # 200
```

Postgres (`:5432`) y Qdrant (`:6333`) corren como servicios del sistema.

**GOTCHA**: al matar el uvicorn, los procesos hijos siguen reteniendo el
puerto 8000. Matar por PID: `ss -tlnp | grep 8000`.

## 3. El orden de arranque (paso a paso)

**Regla de oro: `entidades` va SIEMPRE primero.** El backend solo vincula
emisores cuyos ids ya existan en su Postgres; sin catálogo, todos los
documentos entran sin emisor.

```bash
pnpm entidades --dry      # 0. mirar el reporte, sin escribir
pnpm entidades --sync     # 1. catálogo local + seed del assistant
# 2. si trajo entidades NUEVAS, sembrarlas en el backend:
cd ../arxatec-lawyer-assistant
poetry run python -m app.seed.legal_documents.catalog_seed
```

Luego los módulos. El orden recomendado es **de menor a mayor**: los chicos
validan el pipeline completo en minutos, y los gigantes van al final.

| # | Comando | Volumen de la fuente | Notas |
| --- | --- | --- | --- |
| 1 | `pnpm osinergmin` · `pnpm osiptel` · `pnpm sunass` · `pnpm ositran` | ~51.6k entre los 4 | Reguladores vía gob.pe, born-digital: los más rápidos |
| 2 | `pnpm indecopi` | ~3k | born-digital |
| 3 | `pnpm tfiscal` | ~7.7k | Escaneadas → OCR (lento, desatendido) |
| 4 | `pnpm oefa` | ~7.3k | Publicaciones; antiguas → OCR |
| 5 | `pnpm sunarp` · `pnpm servir` · `pnpm tce` | miles c/u | Mismo patrón gob.pe |
| 6 | `pnpm sunat` | miles | Árbol estático propio |
| 7 | `pnpm spley` | ~15k proyectos | Status "En revisión" |
| 8 | `pnpm adlp` | ~20.5k leyes | **Trae la vigencia real** (Vigente/Derogado); casi todo OCR |
| 9 | `pnpm doctrina` | 7 repositorios | OAI-PMH; `--repos <slug>` para uno solo |
| 10 | `pnpm tc` | ~73.7k | Checkpoint mensual |
| 11 | `pnpm pj` | ~5–8k | ⚠ Solo desde **IP residencial** (bot manager Radware) |
| 12 | `pnpm elperuano --todos` | **~200k+** | El descomunal: itera los 29 periodos |
| 13 | `pnpm spij` | **~875k** | El más grande de todos |
| — | `pnpm gobpe` | 5.1M | **Fuera de `pnpm all` por decisión**: se corre a mano |

Cualquiera acepta `--limit n` para una prueba corta.

## 4. Los dos comandos que importan

### `pnpm verify <fuente> [n]` — ¿salió bien?

Corre el módulo con `--limit n` (default 5) y **da un veredicto mecánico**
comparando el ledger antes y después, en vez de obligarte a leer el log:

```bash
pnpm verify adlp 10               # smoke de 10 docs
pnpm verify doctrina 5 --repos upc  # flags extra pasan al módulo
```

- `PASS` — ingestó documentos nuevos sin fallos permanentes.
- `PASS (al día)` — no había nada nuevo; la reanudación es idempotente.
- `FAIL` — el módulo murió o hay fallos permanentes nuevos.
- Sale con código **0 / 1 / 2** (2 = problema de entorno, p. ej. el backend
  caído), para que un script o un agente pueda leer el resultado sin
  interpretar texto.

Úsalo siempre que toques un módulo o añadas una fuente.

### `pnpm status` — ¿cómo va todo?

El vistazo de 10 segundos: registrados / ok / pendientes / permanentes /
warnings por fuente. **No toca la red**, se puede correr en cualquier momento,
incluso con una corrida en curso.

## 5. Si algo falla

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| La corrida se cortó a medias | Normal (red, Ctrl-C, reinicio) | **Re-ejecutar el mismo comando**: el ledger retoma |
| `pendientes > 0` en `pnpm status` | Fallos transitorios (sitio intermitente) | Re-ejecutar; el módulo reintenta 4 pasadas al final de cada corrida |
| `permanentes > 0` | El documento no se puede ingestar (404, PDF vacío) | Mirar `state/<fuente>_ingest/scraper.log`; suele ser correcto (p. ej. una ley sin PDF en el archivo) |
| `warnings > 0` | Ingestó **bien**, pero imperfecto: emisor sin enlazar, área por defecto, texto por OCR | No bloquea. Auditar con `grep '"warning":' state/<fuente>_ingest/ledger.jsonl` |
| HTTP 401 en la ingesta | `INGEST_TOKEN` no coincide con el del assistant | Comparar con su `ASSISTANT_SYNC_TOKEN` (va entre comillas en su `.env`: leer con dotenv, **nunca** con `cut`) |
| Todo falla con 500 en embeddings | Al backend le falta `.gcloud_key.json` | Colocar la service-account de Vertex en el assistant |
| `[llm] fallo #N con el modelo …` en consola, y `warnings` sube en `pnpm status` | El modelo de Groq no responde (apagado, sin cuota o mal escrito) | Fijar `LLM_MODEL` a un modelo vigente. **Sin esto la ingesta continúa pero clasifica todo con el área por defecto** |
| Un módulo revienta entero en `pnpm all` | Los demás siguen (están aislados) | Correrlo suelto para ver su error |

**`state/` es activo de producción**: es lo único que evita re-ingestar todo.
Nunca se borra a la ligera; `ops/campaign.sh` lo respalda solo (últimos 14) y
antes de un reset se hace `tar czf state/backups/pre-reset-<fecha>.tar.gz state/`.

## 6. Empezar de CERO (borrar todo y re-ingestar)

Solo para pruebas limpias. Son **dos** limpiezas, y hay que hacer las dos o
quedan desincronizadas:

```bash
# 1. El backend (borra documentos en Postgres + Qdrant; NO toca catálogos)
cd ../arxatec-lawyer-assistant
poetry run python -m app.storage.reset_legal --yes        # añade --s3 para borrar también el bucket
# 2. El historial del scraper (respaldando antes)
cd ../arxatec-scrapping
tar czf state/backups/pre-reset-$(date +%Y%m%d).tar.gz --exclude=state/backups state/
find state -mindepth 1 -maxdepth 1 -type d ! -name backups ! -name entidades -exec rm -rf {} +
pnpm status    # todo en 0
```

`reset_legal` **no borra los catálogos** (`legal_entities` y sus grupos): las
~4.2k entidades sobreviven, que es lo que se quiere — sin ellas ninguna
ingesta podría vincular emisores.

## 7. Desatendido (la VM): `ops/campaign.sh`

Para la campaña larga no se corre nada a mano. El script **no lleva
argumentos**: siempre hace la pasada completa.

```bash
./ops/campaign.sh                                # una pasada, a mano
sudo systemctl start arxatec-scraping.service    # una pasada, vía systemd
sudo systemctl enable --now arxatec-scraping.timer  # el supervisor: cada 6 h
systemctl list-timers arxatec-scraping.timer     # cuándo toca la próxima
journalctl -u arxatec-scraping -f                # verla en vivo
```

Cada pasada hace tres cosas: `pnpm all --todos --skip pj` (todos los módulos
en el orden de `DOC_SCRAPERS`), respaldo rotado de `state/` (últimos 14) y
`pnpm status`. Es idempotente: si la anterior murió a medias, esta retoma;
si no hay nada nuevo, es barata. Guía de despliegue completa en
[`campania-vm.md`](./campania-vm.md).
