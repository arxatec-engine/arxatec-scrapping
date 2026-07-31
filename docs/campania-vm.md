# Campaña en VM — el millón con los módulos ya validados

> Escrito 2026-07-30. Objetivo aprobado por el owner: dejar una máquina virtual
> corriendo **al menos 2 meses** hasta completar el corpus de los módulos ya
> validados, con la garantía de que **nada queda a medias sin que se note**.
> Groq sin tope de gasto (decisión del owner 2026-07-30). El módulo `gobpe`
> (5.1M normas) queda AL FINAL de la cola de desarrollo, fuera de esta campaña.

## 1. El objetivo y por qué estas fuentes

| Fuente | Volumen | Por qué entra |
| --- | --- | --- |
| TC | ~73.7k | checkpoint mensual reanudable; termina primero |
| Tribunal Fiscal | ~7.7k | RTF vía gob.pe; escaneadas → OCR local (lento pero desatendido) |
| INDECOPI | ~3k | resoluciones/normas vía gob.pe, born-digital |
| Trib. Contrataciones | decenas de miles (TCP dentro de 85.7k del OECE) | vía gob.pe, born-digital |
| Trib. Registral (SUNARP) | miles (TR+Plenos dentro de 70k de SUNARP) | vía gob.pe, born-digital |
| Trib. Servicio Civil | ~12k+ (2 salas) | vía gob.pe, born-digital |
| Trib. Fisc. Ambiental | ~7.3k | vía gob.pe (publicaciones); antiguas → OCR |
| Reguladores ×4 | ~51.6k | osinergmin/osiptel/sunass/ositran (módulo propio cada uno) vía gob.pe |
| SUNAT | miles (informes vinculantes 1997→hoy) | árbol estático propio; fecha = piso del año |
| El Peruano | ~200k+ (2013→hoy) | universo enumerable por CSVs; `--todos` itera todos los periodos |
| SPIJ | ~875k | API autenticada estable; el total lo dice la propia API |
| **Total** | **~1.15M** | **la meta del millón, solo con módulos validados** |

**PJ queda FUERA de la VM**: su bot manager (Radware) bloquea IPs de
datacenter. Es chico (~5–8k) y se corre aparte desde una IP residencial
(`pnpm pj`).

La clave del diseño: en las tres fuentes el universo es **enumerable** (la API
de SPIJ da su total, los CSV de El Peruano traen conteo exacto, TC va por
meses), así que "completo" es medible en todo momento con `pnpm status` — el
requisito de "que no quede incompleto" se verifica, no se supone.

## 2. Las piezas (todas en el repo)

- **`pnpm all --todos --skip pj`** — una pasada completa: entidades primero,
  luego tc → elperuano (todos los periodos) → spij. Módulos aislados,
  idempotente por ledger: re-ejecutarla continúa/verifica, nunca duplica.
- **`ops/campaign.sh`** — la pasada + respaldo rotado de `state/` (últimos 14)
  + `pnpm status` al final. Log natural: la salida del timer (journalctl).
- **`ops/arxatec-scraping.service` + `.timer`** — el supervisor: systemd
  relanza la pasada cada 6 h contadas desde que la anterior terminó (sin
  solapes) y recupera pasadas perdidas si la VM se reinició (`Persistent`).
- **`pnpm status`** — el vistazo de 10 segundos: registrados / ok / pendientes
  / errores permanentes / warnings por fuente, sin tocar la red.

## 3. Puesta en marcha en la VM

```bash
# 1. Dependencias del sistema
#    node >= 18, pnpm, git y Chrome para Puppeteer:
git clone git@github.com:arxatec-engine/arxatec-scrapping.git /opt/arxatec-scrapping
cd /opt/arxatec-scrapping && pnpm install
npx puppeteer browsers install chrome     # SPIJ y elperuano renderizan PDF
# poppler-utils (pdftoppm): lo exige el OCR local de tfiscal
#   Debian/Ubuntu: apt install poppler-utils · Arch: pacman -S poppler

# 2. Configuración (gitignored)
#    .env con: INGEST_BASE_URL=<backend>  INGEST_TOKEN=<ASSISTANT_SYNC_TOKEN>
#              GROQ_API_KEY=<key>
#    NO definir INGEST_SOURCE/INGEST_STATUS (romperían el source por módulo).

# 3. Prueba de humo (10 docs por módulo, ~minutos)
pnpm all --todos --skip pj --limit 10 && pnpm status

# 4. Encender el supervisor
sudo cp ops/arxatec-scraping.{service,timer} /etc/systemd/system/
#    (ajustar User= y WorkingDirectory= si difieren)
sudo systemctl daemon-reload
sudo systemctl enable --now arxatec-scraping.timer

# 5. Seguimiento
systemctl list-timers arxatec-scraping.timer   # próxima pasada
journalctl -u arxatec-scraping -f              # en vivo
cd /opt/arxatec-scrapping && pnpm status       # avance por fuente
```

## 4. Qué puede pasar en 2 meses y qué hace el sistema solo

| Evento | Qué pasa | Intervención |
| --- | --- | --- |
| La VM se reinicia / el proceso muere | El timer relanza; el ledger retoma donde quedó | ninguna |
| busquedas.elperuano.pe intermitente | timeout corto + 6 reintentos por doc; lo que falle queda `pendiente` y la siguiente pasada lo reintenta | ninguna |
| gob.pe throttlea el refresco de entidades | la pasada continúa con el catálogo versionado actual | ninguna |
| El backend de ingesta se cae | los docs fallan como transitorios → pendientes → siguiente pasada | levantar el backend |
| `entidades` trae NUEVAS | quedan en el catálogo local, pero el backend solo las enlaza si se siembran | correr `catalog_seed` en el assistant cuando el log lo avise |
| Groq falla en un doc | el área cae al default CON `warning` en el ledger (no se pierde el doc) | revisar `pnpm status` (columna WARNINGS) y reclasificar al final si hace falta |
| Un módulo revienta del todo | los demás siguen (aislamiento del orquestador) | mirar `state/<fuente>/scraper.log` |

**Los warnings son el control de calidad**: ingestas aceptadas pero imperfectas
(emisor sin enlazar, área por defecto). No bloquean la campaña; se auditan con
`grep '"warning":' state/<fuente>/ledger.jsonl` y se corrigen re-ingestando
(la identidad por `source_url` reemplaza sin duplicar).

## 5. Dimensionamiento del lado del backend (avisar al owner)

- ~1.15M documentos → millones de chunks embebidos (Vertex) + S3 + Postgres +
  Qdrant. El coste y la capacidad del backend de ingesta deben estar
  dimensionados ANTES de abrir el grifo completo.
- Ritmo aproximado de la VM: 2 docs en paralelo, ~2–4 s por doc efectivo →
  ~40–80k docs/día teóricos; el cuello real será el backend (embeddings).
- Antes de la corrida de producción: correr `app/storage/reset_legal.py` en el
  entorno destino si se quiere partir de cero (ver TRAZABILIDAD_FUENTES.md).
