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

## Registro de cambios

| Fecha | Commit verificado | Qué cambió |
| --- | --- | --- |
| 2026-08-07 | `b2c69b2` (este repo) · `2d540b0` (assistant) | Nace el registro. Mapa de hosts extraído del código: 14 de 22 módulos comparten `www.gob.pe` y el throttle es por proceso, así que el paralelismo ingenuo multiplica por 14 el ritmo contra un solo portal. Plan por fases con olas por carril y la regla de «fuente caída, se anota y se sigue». |
