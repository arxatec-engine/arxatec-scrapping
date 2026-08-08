# Cuántos scrapers se pueden lanzar a la vez, y en qué orden

> Escrito 2026-08-07. Responde a una pregunta del owner: si se alquila una
> máquina de 32 GB para abrir «los 33 scrapers», ¿cuántos se pueden lanzar de
> verdad en paralelo y con qué orden, sin autobloquearnos?
>
> Commits verificados: este repo en `b2c69b2` (main) y `arxatec-lawyer-assistant`
> en `2d540b0` (main). Todo lo de §1 y §2 sale de leer el código, no la
> documentación.
>
> Registro hermano, con el análisis de la ingesta autónoma por scraper:
> `arxatec-lawyer-assistant/docs/registro/2026-08-07/AUDITORIA_PROPUESTA_CUELLO_BOTELLA.md`.

---

## 0. La respuesta corta

**No son 33 procesos, y el techo no es la RAM: son ~8-10 módulos simultáneos, y
el límite lo pone el host, no la máquina.**

La intuición del owner era correcta y se queda corta: hay módulos que pegan a la
misma página. No son 10 — son **14 de 22 módulos** contra **un solo host**,
`www.gob.pe`.

---

## 1. El mapa de hosts (verificado en el código)

Trece módulos importan `src/services/gobpe/`, cuyo único host es
`https://www.gob.pe`; `entidades` lo usa también. Los demás tienen host propio.

| Carril (host) | Módulos | Nº |
| --- | --- | --- |
| **`www.gob.pe`** | `essalud`, `gobpe`, `indecopi`, `oefa`, `osinergmin`, `osiptel`, `ositran`, `servir`, `sunarp`, `sunass`, `tce`, `tfiscal`, `tfl`, `entidades` | **14** |
| `*.congreso.gob.pe` | `adlp` (`www.leyes…`), `spley` (`api.` + `wb2server.`) | 2 |
| `*.minjus.gob.pe` | `spij` (`spij.` + `spijwsii.`) | 1 |
| `www.pj.gob.pe` | `pj` | 1 |
| `www.sunat.gob.pe` | `sunat` | 1 |
| `*.sedetc.gob.pe` | `tc` (`jurisprudencia.` + `jurisbackend.`) | 1 |
| `busquedas.elperuano.pe` + `datosabiertos.gob.pe` | `elperuano` | 1 |
| 8 hosts universitarios (PUCP, UPC, ULima, UNI, URP, AMAG, SciELO) | `doctrina` | 1 |

**8 carriles**, no 22. Y uno de ellos lleva 14 módulos dentro.

### 1.1 El agravante: el throttle es por proceso

`src/utils/http/index.ts` → `newThrottle()` devuelve **un objeto en memoria**. Es
decir, el ritmo cortés que respeta cada módulo **no se comparte entre procesos**.
Hoy no se nota porque `pnpm all` corre los 20 scrapers **en secuencia**: nunca
hay dos a la vez contra el mismo host.

El problema aparece **exactamente** al hacer lo que se quiere hacer: lanzarlos en
paralelo. Catorce procesos con su propio throttle contra `www.gob.pe`, a ~1
petición cada 0,4 s por módulo, son **~35 req/s** contra un portal del Estado. Eso
no es paralelismo: es la forma más rápida de que nos bloqueen la IP.

---

## 2. Cuántos entran de verdad

Cuatro límites, y gana el más bajo:

| Límite | Cuánto permite | ¿Es el que manda? |
| --- | --- | --- |
| **Hosts** | 7 carriles propios + 1-3 del carril `gob.pe` = **8-10 módulos** | **SÍ** |
| RAM (Chrome ~800 MB × 19 de 22 módulos) | ~35 módulos en 32 GB | No, sobra |
| CPU (OCR satura un núcleo por página; 15 módulos usan OCR) | ≈ núcleos − 2 | Solo si la máquina trae pocos núcleos |
| Cuota de Vertex, aguas abajo | Desconocida (403 al consultarla) | **Posible techo real** |

**Conclusión incómoda pero útil: la máquina de 32 GB está sobredimensionada para
la parte de scraping.** Con 8-10 módulos y Chrome, son ~8 GB. Lo que conviene
mirar al alquilarla son los **núcleos** (por el OCR) y el **ancho de banda**, no
los GB.

### 2.1 El paralelo que conviene ver

Este problema es **el mismo** que el de la cuota de Vertex del registro hermano:

> un recurso compartido necesita un contador compartido.

- 14 módulos contra un host, cada uno con su throttle → nos bloquea gob.pe.
- 25 módulos pidiendo embeddings, cada uno con su semáforo → nos bloquea Vertex.

Y la consecuencia importante para la decisión de arquitectura: **para 14 de los
22 módulos, el techo es el presupuesto de un único host**. Ninguna de las
opciones sobre la mesa —ingesta autónoma por scraper, 32 GB, nginx— mueve ese
techo ni un punto.

---

## 3. Plan de acción

### Fase A — decidir el modelo de lanzamiento (sin código)

Dos formas de respetar el carril `gob.pe`:

| Opción | Cómo | Coste | Techo |
| --- | --- | --- | --- |
| **A1 · Cola por carril** | Los 14 de gob.pe corren **uno detrás de otro**; los otros 7 carriles, en paralelo | Ninguno: es orquestación, un script | 8 simultáneos |
| **A2 · Presupuesto compartido** | Token bucket compartido (fichero o Redis) para `www.gob.pe`; varios módulos a la vez respetando **un** ritmo total | Medio: hay que escribirlo y probarlo | 8-10, ajustable |

**Recomendación: empezar por A1.** No requiere código nuevo en los módulos, se
puede montar con el orquestador, y ya da 8 carriles en paralelo — que es **8×**
lo que hay hoy (`pnpm all` secuencial). A2 solo si se comprueba que el carril
gob.pe es el que retrasa la campaña.

### Fase B — medir el presupuesto real de `www.gob.pe`

Antes de fijar cuántos caben en ese carril hay que saber qué tolera. Con **un
solo módulo**, subir su concurrencia por escalones (2 → 4 → 6) y registrar
cuándo aparecen 429/403 o caídas de latencia. Ese número es el presupuesto del
carril, y se reparte entre los 14. **Es un dato que hoy nadie tiene.**

### Fase C — piloto de una fuente

Se mantiene `tfl` como piloto (única fuente con dos líneas base medidas), con el
criterio de igualdad mecánica del registro hermano. **Ojo**: `tfl` está en el
carril `gob.pe`, así que sirve para el piloto de *ingesta* pero **no** para medir
el presupuesto del carril en solitario — para la Fase B conviene un módulo de
carril propio, p. ej. `tc` o `elperuano`.

### Fase D — despliegue por olas

Olas de 8, una por carril, con la **regla de fallo del owner**:

> Si una fuente falla porque su sitio está caído, **no se detiene la tanda**: se
> anota como pendiente, se pasa a la siguiente y se reintenta al cerrar la ronda.

Esto ya es barato de implementar porque cada módulo tiene su ledger: reintentar
es reejecutar el mismo comando.

**Ola tipo** (un módulo por carril, sin colisión de host):

```
Ola 1: tc · elperuano · spij · pj · sunat · adlp · doctrina · [gob.pe: tfl]
Ola 2: … (los carriles propios que queden) + [gob.pe: essalud]
Ola 3: …                                   + [gob.pe: indecopi]
```

Los 7 carriles propios se agotan en 1-2 olas; el carril `gob.pe` marca el ritmo
con sus 14 turnos. **Ese carril es el camino crítico de toda la campaña**, y
conviene ordenarlo por valor: primero los módulos con más documentos.

### Fase E — no antes de tener B

Subir concurrencia dentro de los módulos, o pasar a A2, solo con el número de la
Fase B en la mano.

---

## 4. Lo que hay que medir (y quién puede)

> ⚠️ **Deuda superada.** Las tablas de deuda de este documento se
> consolidaron el 2026-08-07 en
> [`ejecucion-fases-modulos-completos.md` §5](./ejecucion-fases-modulos-completos.md#5-deuda-registro-único),
> que es el registro único. Lo de aquí se conserva como testigo de lo que
> se sabía ese momento, no como lista viva.


| Id | Dato | Estado |
| --- | --- | --- |
| M-1 | Presupuesto de peticiones que tolera `www.gob.pe` | 🔴 nadie lo ha medido (Fase B) |
| M-2 | Cuota de Vertex del proyecto | 🔴 403 con la cuenta de servicio; hace falta consola |
| M-3 | Núcleos y ancho de banda de la máquina a alquilar | 🔴 sin definir |
| M-4 | Documentos por módulo, para ordenar el carril `gob.pe` por valor | 🟡 `pnpm status` da parte |

---

## 5. Decisiones del owner

| Id | Decisión |
| --- | --- |
| E-1 | ¿A1 (cola por carril) o A2 (presupuesto compartido) para `www.gob.pe`? |
| E-2 | ¿Se hace la Fase B antes de lanzar en paralelo? Sin ese número, la ola es a ciegas |
| E-3 | Sabiendo que el scraping cabe en ~8-10 GB, ¿sigue teniendo sentido la máquina de 32 GB, o el presupuesto va mejor a núcleos y ancho de banda? |
| E-4 | Orden del carril `gob.pe`: ¿por valor legal, por volumen de documentos, o el actual? |

---

## 6. La propuesta del owner: fundir los 13 de gob.pe en un solo módulo

> «Que los scraping de una sola página sean un solo scraping, así lanzamos los 8
> sin preocuparnos. Dentro del módulo se podrá correr cada uno individualmente,
> pero solo para pruebas, no por defecto.»

**Recomendado.** Es más limpio que las dos opciones de §3 y las cubre a la vez:
si el recurso compartido tiene **un solo dueño**, el throttle en memoria que ya
existe **se vuelve el contador compartido** sin escribir coordinación
distribuida. Se resuelve A1 y A2 de una vez, sin Redis.

### 6.1 Lo que además se gana (medido)

Los 13 módulos de gob.pe **lanzan Chrome y usan OCR los 13** (verificado módulo
por módulo). Fundirlos en un proceso:

| | Hoy (13 procesos) | Fundido (1 proceso) |
| --- | --- | --- |
| Instancias de Chrome | 13 × ~800 MB ≈ **10,4 GB** | 1 × ~800 MB |
| Throttle contra `www.gob.pe` | 13 independientes | **1, compartido** |
| Workers de OCR compitiendo por CPU | 13 | 1 pool controlado |

**Se liberan ~9,6 GB de RAM y desaparece la contención de CPU del OCR.** Eso solo
ya cambia el dimensionado de la VPS.

### 6.2 Matiz importante que apareció al medir: hay dos hosts, no uno

Al muestrear los PDF reales salió esto, y conviene tenerlo claro antes de diseñar:

```
www.gob.pe/busquedas.json   ← el BUSCADOR (JSON, pequeño). Es el recurso
                              compartido y el que throttlea. 13 módulos.
cdn.www.gob.pe              ← los PDF (718 KB - 1,6 MB medidos). Es un CDN.
```

El servicio compartido lo dice en su cabecera: la búsqueda va por
`busquedas.json`, **sin páginas de detalle ni Puppeteer**, y el PDF sale del CDN.

Consecuencia: **el presupuesto que hay que compartir es el de las llamadas de
búsqueda**, que son JSON pequeños, no el de las descargas, que van a un CDN hecho
para volumen. El carril gob.pe es **menos estrecho de lo que temíamos** — pero
sigue necesitando un solo contador, que es justo lo que da la fusión.

### 6.3 Lo que hay que cuidar al fundirlos

| Riesgo | Cómo se evita |
| --- | --- |
| Perder el ledger por fuente | **No fusionar ledgers.** Cada subfuente conserva `state/<fuente>_ingest/`, o `pnpm status` y `pnpm verify` dejan de funcionar |
| Un fallo se lleva las 13 | El ledger hace que reanudar sea reejecutar; conviene además aislar cada subfuente en su try/catch para que una caída no aborte la vuelta |
| Que el modo individual se use en producción | Es lo que pide el owner: se conserva **solo para pruebas**, y el camino por defecto es el módulo fundido |
| Perder el veredicto por fuente | `pnpm verify <subfuente>` debe seguir dando PASS/FAIL por separado |

### 6.4 Cómo queda el lanzamiento

```
8 procesos en paralelo, uno por carril:

  1. gobpe-unificado   ← las 13 subfuentes, un throttle, un Chrome
  2. tc
  3. elperuano
  4. spij
  5. pj
  6. sunat
  7. adlp + spley      ← comparten congreso.gob.pe: van en el mismo carril
  8. doctrina
```

Ocho procesos, ~6,4 GB de Chrome, sin colisión de host y sin coordinación
distribuida. **Es el objetivo que buscaba el owner, y sale sin token bucket.**

### 6.5 Dónde está el muro de verdad

Con la fusión hecha, el límite deja de ser el scraping. Los dos techos que
quedan, medidos en el registro hermano del assistant (§11):

1. **Qdrant**: 1,15 M documentos ≈ 20,7 M puntos ≈ **85-127 GB de RAM** con la
   configuración actual (sin cuantizar, vectores en RAM). **En 16 GB se agota
   entre los 145 000 y los 230 000 documentos.** Necesita cuantización int8 y/o
   vectores `on_disk` — y con `on_disk`, **NVMe obligatorio**.
2. **Cuota de Vertex**: sigue sin conocerse (403 al consultarla).

PostgreSQL (~10 sentencias/s, 1,7 GB) y S3 (~690 GB, ~$16/mes) **no son el
problema**. Lo que sí pesa en S3 es el tráfico: ~1,4 TB de tránsito en la VPS del
assistant si el PDF sigue pasando por él.

---

## 7. La arquitectura decidida: 8 módulos completos

Decisión del owner del 2026-08-07, tras §6 y el registro hermano del assistant.

### 7.1 Los 8 módulos

Cada uno pasa a ser un **módulo completo**: scrapea **y** ingiere por su cuenta
(texto, embeddings, Qdrant, PostgreSQL, S3), sin pasar por
`POST /legal-documents/ingest`.

| # | Módulo | Fuentes que absorbe | Carril (host) |
| --- | --- | --- | --- |
| 1 | **`gobpe` unificado** | 13: `essalud`, `indecopi`, `oefa`, `osinergmin`, `osiptel`, `ositran`, `servir`, `sunarp`, `sunass`, `tce`, `tfiscal`, `tfl`, `gobpe` | `www.gob.pe` (búsquedas) + `cdn.www.gob.pe` (PDF) |
| 2 | `tc` | Tribunal Constitucional | `*.sedetc.gob.pe` |
| 3 | `elperuano` | El Peruano | `busquedas.elperuano.pe` |
| 4 | `spij` | SPIJ (API) | `*.minjus.gob.pe` |
| 5 | `pj` | Poder Judicial | `www.pj.gob.pe` |
| 6 | `sunat` | SUNAT | `www.sunat.gob.pe` |
| 7 | `congreso` | `adlp` + `spley` | `*.congreso.gob.pe` |
| 8 | `doctrina` | 8 repositorios universitarios | PUCP, UPC, ULima, UNI, URP, AMAG, SciELO |

**Los 8 se lanzan en simultáneo**: un carril por módulo, sin colisión de host.
Dentro del módulo 1, las 13 subfuentes comparten un throttle y un Chrome, y se
conserva el modo individual **solo para pruebas**, nunca por defecto.

### 7.2 El diseño de la ingesta local

No se duplica lógica 13 ni 8 veces. **Una librería compartida + un cambio de una
línea por módulo**, apoyándose en una costura que ya existe:

```
hoy:    ingestOne() → ingestRequest(ctx, pdfBytes, filename, meta) → HTTP → assistant
nuevo:  ingestOne() → ingestRequest(...)  →  ingestLocal(...)  → Vertex + Qdrant + PG + S3
                       └── misma firma, mismo IngestResult ──┘
```

Al respetar la firma `(ctx, pdfBytes, filename, metadata) → IngestResult`, **el
resto del módulo no se entera**: el ledger, el fallback de OCR, los warnings y
`pnpm verify` siguen funcionando sin tocarlos. Y el flag permite ingerir el
**mismo** documento por las dos rutas para compararlas.

### 7.3 Hallazgo que condiciona el criterio de aceptación

Se comparó la extracción de texto de un PDF real por las dos vías:

| | Páginas | Caracteres |
| --- | --- | --- |
| Python (`PyPDFLoader`/pypdf) | 10 | 23 353 |
| Node (`unpdf`/pdf.js) | 10 | 23 412 |

**Similitud media por página: 99,6 %** (mínimo 98,7 %). Las diferencias son de
espaciado y ligaduras.

Consecuencia: **la igualdad byte a byte del texto NO es alcanzable** con
extractores distintos, y por tanto los embeddings tampoco serán idénticos. El
criterio de aceptación del piloto se ajusta a:

| Debe ser idéntico | Debe ser equivalente |
| --- | --- |
| `document_id` (determinista por `source_url`) | Texto de cada chunk: **≥ 98 % de similitud** |
| Ids de punto (deterministas por índice) | Nº de chunks: igual o ±1 |
| Claves de payload y las 41 de metadatos | La búsqueda devuelve el mismo documento |
| Dimensión del vector (1024, sin nombre) | |
| Filas en `documents`, `legal_document_entities`, `document_relations` | |

### 7.4 Especificación de la VPS (confirmada)

Es una máquina **exclusiva del corpus legal**, no solo del scraping: aloja
Qdrant, PostgreSQL y los 8 procesos.

| Recurso | Decisión |
| --- | --- |
| RAM | **16 GB para empezar, ampliable a 32** — Qdrant pide ~8 GB medidos; el resto es caché y concurrencia |
| Hilos | **Lo más prioritario** — los pide el OCR (15 de los módulos originales) |
| Disco | **1 TB NVMe** (con 256 GB también bastaría: Qdrant + PG son ~90 GB) |
| S3 | El bucket actual, ~0,9-1 TB de PDF |

Detalle y señales de ampliación en
`arxatec-lawyer-assistant/docs/registro/2026-08-07/AUDITORIA_PROPUESTA_CUELLO_BOTELLA.md` §13.

---

## Registro de cambios

| Fecha | Commit verificado | Qué cambió |
| --- | --- | --- |
| 2026-08-07 | `b2c69b2` (este repo) · `2d540b0` (assistant) | Nace el registro. Mapa de hosts extraído del código: 14 de 22 módulos comparten `www.gob.pe` y el throttle es por proceso, así que el paralelismo ingenuo multiplica por 14 el ritmo contra un solo portal. Plan por fases con olas por carril y la regla de «fuente caída, se anota y se sigue». |
| 2026-08-07 | ídem | Nace §6 con la propuesta del owner de **fundir los 13 módulos de gob.pe en uno**: se recomienda, porque el throttle en memoria pasa a ser el contador compartido sin Redis, y **libera ~9,6 GB de RAM** (los 13 lanzan Chrome y usan OCR). Aparece un matiz al medir: el buscador (`www.gob.pe/busquedas.json`) y los PDF (`cdn.www.gob.pe`) son **hosts distintos**, así que lo que hay que racionar son las búsquedas, no las descargas. Se fija el lanzamiento en 8 carriles y se apunta al muro real: Qdrant. |
