# Arquitectura para ejecutar el scraping en producción

> Escrito 2026-08-03 para decidir **dónde y cómo** se corre la campaña.
> Responde a los seis puntos planteados (monitoreo, ahorro de cómputo,
> antibot, calidad de ingesta, estado/reanudación) con **mediciones hechas en
> este repo**, no con estimaciones.

## 0. Resumen ejecutivo (las tres decisiones)

| Pregunta | Recomendación | Razón de una línea |
| --- | --- | --- |
| ¿Railway o PC propia? | **PC propia** para el scraper; Railway solo si se quiere para el backend | Railway da **IP de datacenter** → el Poder Judicial queda bloqueado, y facturar 24/7 durante 2 meses es el peor caso del pago por uso |
| ¿20 sesiones o una a una? | **Secuencial (`pnpm all`)**, subiendo a 2-3 en paralelo si sobra RAM | 20 sesiones = **~16 GB de RAM** y **cero ganancia**: el cuello de botella es el backend de ingesta, no el scraper |
| ¿Cómo monitoreo? | Lo que ya existe (`pnpm status`, log por módulo, ledger) + `journalctl` | El monitoreo NO necesita sesiones paralelas: cada módulo ya escribe su propio log y su propio registro |

## 1. Mediciones reales (2026-08-03, en este repo)

| Qué | Medido | Cómo |
| --- | --- | --- |
| RAM de UNA sesión con Chrome | **~800 MB** (796 MB al lanzar, 827 MB renderizando PDF) | `launchBrowser()` + `renderPdf()` reales, RSS de todos los procesos |
| Módulos que lanzan Chrome | **19 de 21** (todos menos `tc` y `pj`) | `grep launchBrowser src/modules/` |
| Módulos que usan OCR | **15 de 21** | `grep ocrPdf src/modules/` |
| Concurrencia interna por defecto | **2 documentos a la vez**, en los 21 módulos | `*_CONCURRENCY` = 2 |

Dos consecuencias que mandan sobre todo lo demás:

1. **Chrome se lanza UNA vez por corrida de módulo, no por documento.** Por eso
   una corrida secuencial consume ~1 GB constante, sin importar cuántos
   documentos procese.
2. **El OCR es lo caro en CPU**, no en RAM: `tesseract.js` (WASM) satura un
   núcleo por página. En una PC modesta, los módulos con muchos escaneados
   (`adlp`, `tfiscal`, `oefa`, `sunat`) son los que marcan el ritmo.

## 2. ¿Railway o la PC propia?

### El argumento que decide: la IP

`pj` (Poder Judicial) está detrás del bot manager **Radware**, que bloquea por
**IP de datacenter** — está verificado y documentado en
[`anti-bloqueo-scraping.md`](./anti-bloqueo-scraping.md). En Railway (o
cualquier nube) `pnpm pj` simplemente **no funciona**: por eso la guía de la VM
ya obliga a `--skip pj`. Con la PC propia, detrás de una conexión residencial,
`pj` corre sin problema y se cubre una fuente más.

Además, gob.pe throttlea por volumen a nivel de conexión (visto en `pj`); las
IPs de datacenter suelen ser las primeras en recibir ese trato.

### El argumento del dinero

El scraping es un proceso de **larga duración** (semanas, 24/7). Ese es
exactamente el peor caso para la facturación por uso de Railway, que cobra por
**RAM × tiempo** y **vCPU × tiempo** de forma continua.

Orden de magnitud (verificar el precio vigente, no lo tomes como cotización):
con ~2 GB de RAM y 1 vCPU sostenidos, un mes ronda **$30-45**, así que la
campaña de 2 meses ronda **$60-90**, más el egreso de red — y el scraper
descarga muchísimo PDF.

La PC ya está comprada: su coste marginal es **la electricidad**. Una máquina
de escritorio típica consumiendo ~60 W durante 2 meses son ~86 kWh; a tarifa
peruana (~S/ 0.75/kWh) son **~S/ 65 (≈ $17)**. Es entre 4 y 5 veces más barato,
y el dinero no se va a un tercero.

### El argumento de la estabilidad (y el riesgo escondido)

Tu observación de que Railway se cae cada tanto **no es el problema principal**:
gracias al ledger, una caída no pierde datos, solo tiempo. El riesgo grave es
otro:

> ⚠ **En Railway, `state/` DEBE ir en un volumen persistente.** El sistema de
> archivos de un contenedor es efímero: si no se configura un volumen, cada
> redeploy o reinicio **borra los ledgers**, y la siguiente pasada **re-ingesta
> todo desde cero**. Eso no solo pierde tiempo: dispara de nuevo el coste de
> embeddings del backend por documentos que ya estaban.

En la PC propia ese riesgo no existe: `state/` es un directorio normal y
`ops/campaign.sh` ya lo respalda rotando los últimos 14.

### Lo que ya está escrito juega a favor de la PC

`ops/campaign.sh` + `ops/arxatec-scraping.service` + `.timer` son un supervisor
systemd **ya hecho y documentado** para una máquina Linux. En Railway habría
que rehacer ese andamiaje con su propio modelo de servicios y cron.

### Un punto de seguridad a favor

El scraper **solo necesita salida** a internet, no entrada: nadie tiene que
alcanzarlo desde fuera. No hay que abrir puertos ni exponer la PC. (El backend
sí necesita ser accesible, y ese sí es buen candidato para Railway.)

### Arquitectura recomendada (híbrida)

```
   PC propia (Linux server, IP residencial)        Donde ya viva / Railway
   ┌──────────────────────────────────┐            ┌────────────────────┐
   │ arxatec-scrapping                │            │ assistant (Python) │
   │  systemd timer → campaign.sh     │  HTTPS     │  /legal-documents/ │
   │  pnpm all --todos                │ ─────────► │      ingest        │
   │  state/ (ledgers) + respaldos    │            │  PG + Qdrant + S3  │
   │  Chrome + OCR local              │            └────────────────────┘
   └──────────────────────────────────┘
        solo SALIDA a internet                       aquí sí hace falta
        (no hay que abrir puertos)                   estar accesible
```

**Cuándo reconsiderar Railway para el scraper**: si algún día la PC no puede
sostener el ritmo y el backend deja de ser el cuello de botella. Incluso
entonces, `pj` seguiría teniendo que correr desde una IP residencial.

## 3. ¿20 sesiones en paralelo o una a una?

La intención (ver la ingesta fuente por fuente) es **correcta**; el mecanismo
propuesto es el equivocado. Tres razones:

### a) No cabe en la RAM

**20 sesiones × ~800 MB = ~16 GB solo de scrapers**, más el sistema operativo.
En una PC "no tan potente" (8-16 GB) no entra. Y lo que pasa cuando no entra es
peor que ir lento: el sistema empieza a usar swap, y el thrashing hace que el
conjunto rinda **menos que la ejecución secuencial**.

La cuenta para dimensionar:

```
sesiones_paralelas_máximas = (RAM_total_GB - 2) / 1
```

(el −2 es el margen para el sistema; 1 GB por sesión con Chrome).
Con 8 GB → **6 sesiones como techo teórico**, 3-4 como cifra prudente.
Con 16 GB → 10-12 de techo, 6 prudente. **Nunca 20.**

### b) No acelera nada: el cuello de botella está en el backend

Cada documento que baja el scraper se manda a
`POST /legal-documents/ingest`, y ahí el backend hace lo caro: extraer texto,
**generar embeddings** (Vertex), escribir en S3, Postgres y Qdrant. Veinte
scrapers en paralelo no hacen ese trabajo más rápido: **hacen cola en el mismo
backend**. El resultado es la misma velocidad con 20 veces más RAM ocupada.

La regla práctica: **subir el paralelismo del scraper solo cuando se compruebe
que el backend está ocioso**, no antes.

### c) El monitoreo ya está resuelto sin paralelismo

Esto es lo importante: **no hace falta una sesión por fuente para ver cómo va
cada fuente**. Ya existe, corriendo todo secuencialmente:

| Quiero saber… | Comando / archivo |
| --- | --- |
| Avance de las 21 fuentes de un vistazo | `pnpm status` (no toca la red, se puede correr en cualquier momento) |
| Qué está pasando ahora mismo | `journalctl -u arxatec-scraping -f` |
| El detalle de UNA fuente | `state/<fuente>_ingest/scraper.log` |
| Documento por documento, con su resultado | `state/<fuente>_ingest/ledger.jsonl` |
| Ingestas aceptadas pero imperfectas | `grep '"warning":' state/<fuente>_ingest/ledger.jsonl` |
| ¿Este módulo funciona? (veredicto sí/no) | `pnpm verify <fuente> 10` → PASS/FAIL y código de salida 0/1/2 |
| ¿Terminó bien la pasada completa? | Resumen final de `pnpm all` + código de salida |

Cada módulo escribe en su **propio** log y su **propio** ledger aunque corran
en el mismo proceso. La separación por fuente ya existe; abrir 20 terminales
no añade información, solo consumo.

### Recomendación concreta

1. **Empezar secuencial**: `./ops/campaign.sh` (que es `pnpm all --todos --skip pj`).
   ~1 GB de RAM, todo el orden ya definido, resumen y respaldo automáticos.
2. **Medir** con `pnpm status` si el backend va sobrado.
3. **Si sobra capacidad**, subir en dos escalones y no más:
   - `<FUENTE>_CONCURRENCY=4` en los módulos sin OCR (es paralelismo *dentro*
     del módulo: no cuesta otro Chrome, y es lo primero que hay que probar);
   - 2-3 módulos en paralelo en terminales separadas, agrupados por perfil:
     los de OCR (`adlp`, `tfiscal`, `oefa`, `sunat`) **nunca juntos** entre sí,
     porque compiten por CPU.
4. `pj` aparte, siempre, desde la IP residencial y con `PJ_DELAY` alto.

## 4. Antibot: qué se puede y qué no

Detalle completo en [`anti-bloqueo-scraping.md`](./anti-bloqueo-scraping.md).
Resumen del estado real de las 33 fuentes que corren hoy:

| Sitio | Qué tiene | ¿Se puede evitar? |
| --- | --- | --- |
| **Poder Judicial** | Radware: rechaza axios (pasa `fetch`) y **throttlea por IP** | El fingerprint **sí** (ya resuelto). El bloqueo por IP **NO se arregla con código**: exige IP residencial y ritmo lento |
| gob.pe (14 módulos) | Sin antibot; throttlea por volumen de conexión | Sí: ritmo cortés y reanudación por ledger |
| El Peruano, ADLP | **No es antibot**: su infraestructura es intermitente | Sí: timeout corto + reintentos con espera creciente |
| UPC (doctrina) | WAF que rechaza *user-agents de navegador* en su OAI | Sí: identificarse honestamente como cosechador |
| SPIJ | Ninguno: entramos por su API con cuenta gratuita | No aplica |

**Lo que NO se va a hacer** (y conviene decirlo explícitamente al equipo):
rotación de proxies, IPs residenciales alquiladas o disfrazar el tráfico. Son
fuentes **públicas y oficiales** del Estado peruano; el enfoque del repo —
identificarse, ir despacio, reanudar en vez de insistir — es el que mantiene el
acceso a largo plazo y el que aguanta una revisión legal. Un bloqueo permanente
por agresividad costaría mucho más que ir lento.

## 5. Buena ingesta de datos: lo que ya la garantiza

- **Contrato validado en el backend**: fecha obligatoria, `subarea` no vacía,
  `source` canónico con **huella SHA-256 fijada en los tres repos** (si alguien
  cambia el catálogo en uno solo, el test falla).
- **`status` determinista por fuente, nunca IA** — y desde el ADLP, con la
  vigencia real (`Vigente`/`Derogado`) que publica el Congreso.
- **Emisor verificado**: si el backend no vincula la entidad, queda `warning`
  en el ledger (no se pierde el documento, pero queda auditable).
- **OCR con marca**: los escaneados se reingesta con `warning` que dice que el
  texto vino de OCR — se puede rehacer después sin adivinar cuáles fueron.
- **Anti-duplicados**: el ledger por fuente + la exclusión explícita de `gobpe`
  sobre los 10 módulos dedicados de gob.pe.
- **Verificación mecánica**: `pnpm verify <fuente>` da PASS/FAIL por diferencia
  del ledger, con código de salida legible por un script.

## 5b. Riesgo con fecha: el modelo de Groq se apaga el 2026-08-16

El scraper llama a Groq para clasificar el área legal de cada documento y
extraer conceptos y referencias. **Groq apaga `llama-3.1-8b-instant` el
2026-08-16** (lo documentó el equipo del `service` en su
`docs/registro/2026-08-04/MODELOS_GROQ.md`).

Lo que se descubrió al verificarlo aquí el 2026-08-04:

1. **El fallo habría sido SILENCIOSO.** El `catch` de `analizarNorma` devolvía
   un análisis vacío sin registrar nada: la campaña habría seguido ingestando
   con normalidad y **cada documento posterior al 16/08 se habría clasificado
   con el área por defecto**, sin concepts ni references. En una campaña de dos
   meses eso son cientos de miles de documentos mal clasificados antes de que
   alguien lo note.
2. **Cambiar solo el id del modelo NO bastaba.** Los modelos `gpt-oss` emiten
   razonamiento que consume `max_tokens`, y con los 500 que fijaba el código
   Groq respondía `400 Failed to generate JSON`. Hubo que subirlo a 2000.
3. **El `.env` mandaba sobre el código.** Tenía `LLM_MODEL` fijado al modelo
   moribundo, así que arreglar el default no habría servido de nada.

Ya aplicado: default `openai/gpt-oss-20b`, `max_tokens` con holgura y un aviso
por consola en cada fallo (los 3 primeros y luego 1 de cada 50). Verificado que
clasifica **igual o mejor** que el anterior.

> Para el despliegue: al crear el `.env` de la PC servidor, **no copiar el
> `LLM_MODEL` viejo**. Es la clase de detalle que sobrevive a un `scp` del
> archivo de configuración.

## 6. Estado y reanudación

**Ya resuelto, y es la propiedad más importante del sistema**: cada módulo
lleva `state/<fuente>_ingest/ledger.jsonl` (registro append-only, un renglón
por documento con su resultado). **Reanudar es volver a ejecutar el mismo
comando**: continúa donde quedó y no duplica. Si la pasada muere a la mitad —
corte de luz, reinicio, caída del backend — la siguiente retoma sola.

Por eso `state/` es **activo de producción**:

- nunca se borra sin respaldo (`ops/campaign.sh` rota los últimos 14 solo);
- en Railway **obligaría** a un volumen persistente (§2);
- el reset completo, cuando se quiere partir de cero, está en el
  [`runbook-arranque.md`](./runbook-arranque.md) §6.

## 7. Puesta en marcha (lo alcanzable para el jueves)

**Sí llega**: dejar la campaña encendida y produciendo, verificada.

```bash
# En la PC servidor, una sola vez
git clone …/arxatec-scrapping && cd arxatec-scrapping && pnpm install
npx puppeteer browsers install chrome
sudo apt install poppler-utils          # o pacman -S poppler
# .env con INGEST_BASE_URL, INGEST_TOKEN y GROQ_API_KEY

pnpm entidades --sync                   # regla de oro: el catálogo primero
pnpm all --limit 5                      # humo de TODOS los módulos, minutos
pnpm status                             # verificar que ninguno quedó en 0

sudo cp ops/arxatec-scraping.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now arxatec-scraping.timer
```

**NO llega para el jueves** (conviene decirlo antes, no después): tener el
corpus completo. El millón de documentos son **semanas** de corrida continua
— el límite lo pone el backend de embeddings, no el scraper. Lo que se puede
mostrar el jueves es el sistema **corriendo, midiéndose y reanudándose solo**.

## 8. Requisitos de la máquina

| Recurso | Mínimo | Cómodo | Por qué |
| --- | --- | --- | --- |
| RAM | **4 GB** | 8-16 GB | 1 GB por sesión con Chrome + margen del sistema |
| CPU | 2 núcleos | 4+ núcleos | El OCR satura un núcleo por página |
| Disco | 20 GB | 50 GB+ | Los PDF son temporales, pero `state/` y la caché de OCR crecen |
| Red | Estable | — | **Residencial**, no de datacenter (por `pj`) |
| Sistema | Linux con systemd | — | El supervisor de `ops/` es systemd |

Si la PC tiene 4 GB, la campaña **funciona igual**: secuencial, sin paralelismo
extra. Solo va más lento — y como el cuello de botella real es el backend, la
diferencia práctica es menor de lo que parece.
