# Ejecución de las fases: los módulos pasan a ingerir por su cuenta

> Escrito 2026-08-07, durante la ejecución. Se va rellenando con resultados
> **medidos**, no previstos.
>
> Commit verificado: rama `feat/modulos-completos` en `abcc2fb` ·
> `arxatec-lawyer-assistant` en `2d540b0` (main).
>
> Plan de partida: [`fases-7-modulos.md`](./fases-7-modulos.md).
> Modelo replicado: [`piloto-ingesta-local-tfl.md`](./piloto-ingesta-local-tfl.md).

---

## 1. El cambio que hizo barata la replicación

El plan decía «un fichero por módulo, ~25 líneas». Al llegar a `tc` apareció algo
mejor: **`tc` usa `services/ingest` y los otros 20 usan `services/assistant`**.
Poniendo la bifurcación en **esos dos clientes compartidos**, los 21 módulos
heredan el modo local sin fachada propia.

Resultado: en vez de 21 ficheros con la misma decisión —21 sitios donde puede
divergir— hay **dos**. Lo único que quedó por módulo fue quitar la exigencia de
`INGEST_BASE_URL` en su `prepare()`, que en modo local no aplica (`pj` llevaba
coma final en el `throw` y necesitó su propio parche).

---

## 2. El hallazgo caro del día: el corpus se estaba clasificando mal ENTERO

**No lo buscaba.** Salió al ver que los 25 documentos de SUNAT —informes
tributarios— quedaban como «Derecho administrativo / Procedimiento
administrativo». Los 25. Y los del Tribunal Constitucional, también.

### 2.1 La cadena completa

1. `analizarNorma` (Groq) clasifica el área legal antes de ingerir.
2. Con `openai/gpt-oss-20b` —un modelo de **razonamiento**— y
   `response_format: json_object`, Groq devuelve **HTTP 400 «Failed to generate
   JSON»** en ráfaga. Comprobado: 8 llamadas seguidas, 8 fallos.
3. `analizarNorma` tenía un **`catch` vacío**: el 400 se convertía en análisis
   vacío.
4. Sin subárea, el módulo cae al área por defecto y escribe en el ledger «la IA
   no clasificó la subárea» — que **suena a duda del modelo, no a una API
   rechazando la petición**. Por eso llevaba tiempo pasando desapercibido.

### 2.2 Por qué importa

La plataforma **filtra por `legal_area` / `subarea`**. Un corpus entero marcado
como administrativo hace invisibles los documentos en el filtro que les
corresponde. No es cosmético: es el dato por el que el abogado busca.

**No lo causó la ingesta local**: la clasificación ocurre antes, en el módulo.
Venía de antes y afectaba también a la ruta del assistant.

### 2.3 El arreglo y la comprobación

- El `catch` deja de ser mudo: registra status y mensaje.
- Modelo por defecto a `llama-3.3-70b-versatile` (el default anterior del
  código, `llama-3.1-8b-instant`, se apaga el **2026-08-16**).

| | Antes | Después |
| --- | --- | --- |
| 9 llamadas en ráfaga | 0 clasificadas | **9/9** |
| Informe de SUNAT | Derecho administrativo | **Derecho tributario / Obligaciones tributarias** |
| Sentencia del TC | Derecho administrativo | **Derecho constitucional / Derechos fundamentales** |
| Resolución de SUNAFIL | Derecho administrativo | **Derecho laboral / Relaciones laborales** |

Y sobre datos reales, los 25 documentos del TC pasaron de un único área a
repartirse en penal, constitucional, laboral y administrativo.

**Consecuencia operativa**: los 34 documentos ingeridos antes del arreglo se
borraron y se rehicieron. Con el corpus real habrá que decidir si se reingesta
lo ya cargado (§5, deuda D-3).

---

## 3. Resultados por fase (25 documentos cada una)

| Fase | Módulo | Veredicto | Notas |
| --- | --- | --- | --- |
| 1 | `tc` | **PASS** 25/25 · 0 warnings | Corpus estimado de la fuente: 74 022 |
| 2 | `sunat` | **PASS** 25/25 · 0 warnings | Antes del arreglo: 25 warnings de clasificación |
| 3a | `adlp` | **PASS** 25/25 · 16 warnings | Los 16 son OCR de escaneados: **confirma que el fallback de OCR funciona con ingesta local** |
| 3b | `spley` | **PASS** 25/25 · 0 warnings | API con parámetros cifrados; PDF propio renderizado |
| 4 | `elperuano` | **PASS** 25/25 · 0 warnings | Sin incidencias del visor en esta tanda |
| 5 | `doctrina` | **PASS** 25/25 · 25 warnings | Warnings **correctos**: las universidades privadas no están en el catálogo de entidades del Estado |
| 6 | `spij` | **PASS** 25/25 · 0 warnings | Funciona con la cuenta pública del código (`spijext`): **no hacen falta credenciales**, al contrario de lo que yo había anotado |
| 7 | carril `gob.pe` | **PASS 13/13** | Las 13 subfuentes, más la fusión en un proceso (§3.2) |

### 3.1 Carril `gob.pe`

Se ejecutan **en secuencia a propósito**: las 13 comparten
`www.gob.pe/busquedas.json` y lanzarlas a la vez es autobloquearse.

**Las 13 en PASS**, ejecutadas una tras otra:

| Subfuente | Veredicto | Segundos |
| --- | --- | --- |
| `essalud` | PASS 25/25 | — |
| `indecopi` | PASS 25/25 | — |
| `oefa` | PASS 25/25 | 211 |
| `servir` | PASS 25/25 | 79 |
| `sunarp` | PASS 25/25 | 75 |
| `sunass` | PASS 25/25 | 93 |
| `osinergmin` | PASS 25/25 | 88 |
| `osiptel` | PASS 25/25 | 79 |
| `ositran` | PASS 25/25 | 71 |
| `tce` | PASS 25/25 | 101 |
| `tfiscal` | PASS 17/17 | 710 · con OCR, la más lenta con diferencia |
| `tfl` | PASS 25/25 | 90 |
| `gobpe` | PASS 25/25 | 125 |

### 3.2 La fusión: `pnpm carril-gobpe`

Verificar las 13 una a una demuestra que funcionan, pero **no arregla el
problema de fondo**: el throttle de `utils/http` es un objeto en memoria, así que
trece procesos son trece ritmos corteses independientes contra un solo portal.

El comando `carril-gobpe` abre **un** navegador y **un** throttle y recorre las
subfuentes en secuencia, inyectándolos. Los 13 `run()` aceptan ahora un carril
opcional: sin él se comportan exactamente como antes, así que los comandos
sueltos siguen sirviendo para pruebas — que es justo lo que pidió el owner.

Lo que **no** cambia: cada subfuente conserva su ledger y su log, así que
`pnpm status` y `pnpm verify` siguen funcionando por fuente.

**Un bug propio, encontrado corriéndolo**: el `--limit` del carril derivaba el
nombre de la variable de entorno del nombre del módulo, y dos de las trece no
siguen el patrón (`indecopi` usa `IND_LIMIT`, `tfiscal` usa `TF_LIMIT`). En la
corrida completa, `indecopi` ignoró el tope y se puso a ingerir sin límite — se
notó porque PostgreSQL creció en cientos de documentos cuando debía crecer de 25
en 25. Ahora la variable se **declara junto a cada subfuente** en vez de
adivinarse. Adivinar nombres por convención, cuando dos casos la rompen, falla
en silencio.

---

## 4. Lo que confirmó la ejecución sobre el piloto

- **El fallback de OCR sobrevive a la ingesta local** (`adlp`, 16 documentos).
  Era el riesgo del bug del buffer desprendido por pdf.js; queda cerrado con
  datos.
- **Ningún módulo necesitó tocar su lógica de scraping**: la costura
  `ingestRequest → IngestResult` aguantó las 7 fases.
- **Ninguna de las seis trampas del piloto reapareció**, que es justo lo que se
  buscaba al ponerlas en la librería compartida y no en cada módulo.

---

## 5. Deuda abierta

| Id | Punto | Estado |
| --- | --- | --- |
| D-1 | **Cuota de Vertex**: con los 8 carriles a la vez el techo efectivo es 8 × `EMBEDDING_MAX_CONCURRENCY`. Sigue sin conocerse (403 con la cuenta de servicio) | 🔴 |
| D-2 | **Presupuesto real de `www.gob.pe`**: cuántas peticiones tolera antes de 429/403. Condiciona cuánta concurrencia admite el carril de 13 | 🔴 |
| D-3 | **Reingesta del corpus ya cargado** con la clasificación arreglada. En local se rehizo; en producción hay que decidirlo | 🔴 decisión del owner |
| D-4 | Fusión de los 13 en un proceso | ✅ hecha: `pnpm carril-gobpe` |
| D-6 | **Corrida completa del carril de punta a punta**: se detuvo a mitad al descubrir el bug del `--limit`. Falta repetirla entera con el arreglo | 🟡 |
| D-5 | `INGEST_SKIP_UNCHANGED=false` en el `.env` local para las pruebas. **En campaña conviene ponerlo a `true`** o se re-paga cada reingesta | 🟡 recordatorio |

---

## Registro de cambios

| Fecha | Commit verificado | Qué cambió |
| --- | --- | --- |
| 2026-08-07 | `abcc2fb` (rama `feat/modulos-completos`) · `2d540b0` (assistant) | Nace el registro con la ejecución de las fases. Lo importante no fue el cableado —que salió más barato de lo previsto al centralizarlo en dos clientes— sino descubrir que el clasificador de área legal fallaba en silencio y todo el corpus caía al área por defecto. |
