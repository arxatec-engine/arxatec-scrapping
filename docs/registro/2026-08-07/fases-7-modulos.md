# Las 7 fases: convertir los módulos restantes en módulos completos

> Escrito 2026-08-07. **Playbook ejecutable**, no un plan narrativo: cada fase
> dice qué tocar, con qué señal se da por buena y qué va a fallar.
>
> Commit verificado: rama `feat/ingesta-local` en `905bfe8` (subida a origin) ·
> `arxatec-lawyer-assistant` en `2d540b0` (main).
>
> El modelo a replicar es [`piloto-ingesta-local-tfl.md`](./piloto-ingesta-local-tfl.md);
> los carriles de host salen de [`plan-lanzamiento-paralelo.md`](./plan-lanzamiento-paralelo.md).

---

## 0. La receta común (vale para las 7 fases)

Lo aprendido en el piloto, para no volver a tropezar.

### 0.1 El cambio por módulo es pequeño

`src/services/ingest-local/` ya existe y es compartida. Por módulo se toca **un
solo fichero**: su fachada `services/assistant/index.ts`, para enrutar por
`INGEST_MODE`, más el `prepare()` que hoy exige `INGEST_BASE_URL`. Unas 25
líneas. **Nada más del módulo cambia**: ledger, OCR, warnings y `pnpm verify`
siguen funcionando porque las dos rutas devuelven el mismo `IngestResult`.

### 0.2 Lo que NO se toca nunca

Formato del punto de Qdrant, ids deterministas y esquema de PostgreSQL. **No es
estilo, es contrato**: el chat del assistant lee de esa misma colección. Mejorar
extracción, ritmo o antibloqueo, sí; cambiar la forma del dato, solo con los
tres repos a la vez.

### 0.3 Trampas ya pagadas (no hace falta volver a descubrirlas)

| Trampa | Cómo se manifiesta |
| --- | --- |
| La columna es `type`, no `document_type` | `column "document_type" does not exist` |
| `keywords`/`concepts`/`references` son JSONB | `invalid input syntax for type json` |
| `legal_document_entities` pide `created_at`/`updated_at` | `null value in column "created_at"` |
| **pdf.js desprende el ArrayBuffer** | `Cannot perform Construct on a detached ArrayBuffer` al subir a S3 o al hacer OCR |
| Credenciales de S3 con nombres propios | La subida falla por autenticación aunque el bucket esté bien |
| Cliente de Qdrant por delante del servidor | Aviso de incompatibilidad; fijado a `~1.17.0` |

Las seis están **ya resueltas en la librería**: al replicar no deberían
aparecer. Si aparecen, es señal de que alguien se saltó la librería.

### 0.4 Antes de arrancar cualquier fase

```bash
pnpm entidades          # el emisor debe existir o el vínculo queda vacío
pnpm typecheck && pnpm test
```

Y las variables de `INGEST_MODE=local` (las mismas del assistant, documentadas en
`.env.example`).

### 0.5 Señal de aceptación, idéntica en las 7

```bash
pnpm verify <fuente> 3      # con INGEST_MODE=local, sin assistant levantado
```

**PASS** y, además, comprobar una vez por módulo que el punto escrito tiene 41
metadatos y que la búsqueda lo recupera.

### 0.6 La regla del owner

> Si una fuente falla porque su sitio está caído o la bloquea el antibot, **no se
> detiene la tanda**: se anota como deuda en §9, se pasa a la siguiente y se
> reintenta al cerrar la ronda.

---

## Fase 1 · `tc` — Tribunal Constitucional

**Por qué primero**: carril propio (`*.sedetc.gob.pe`), sin antibot conocido, sin
OCR. Es el segundo piloto más barato y confirma que la receta se replica.

| | |
| --- | --- |
| Toca | `src/modules/tc/services/assistant/index.ts` + su `prepare()` |
| Riesgo | Bajo |
| Señal | `pnpm verify tc 3` → PASS |

Si aquí algo falla, el problema es la receta, no la fuente: arreglar antes de
seguir.

---

## Fase 2 · `sunat`

| | |
| --- | --- |
| Toca | Igual que la Fase 1 |
| Gotcha conocido | **Charset mixto UTF-8/latin-1**; la fecha se toma como piso del año |
| Riesgo | Bajo-medio |
| Señal | `pnpm verify sunat 3` → PASS |

Vigilar que el texto no llegue con mojibake: si el título trae caracteres rotos,
se propaga al `normalized_title` y a la búsqueda.

---

## Fase 3 · `congreso` (`adlp` + `spley`)

Comparten `*.congreso.gob.pe`: **van en el mismo carril**, nunca en paralelo
entre sí.

| | |
| --- | --- |
| Gotcha `adlp` | El HTTPS de `leyes.congreso.gob.pe` es **intermitente** (cuelga o responde al toque — no está caído). Y el grid del buscador **trunca en silencio a 20 filas** → ventanas de ≤20 números |
| Gotcha `spley` | API con parámetros cifrados AES; el PDF del portal es inestable, por eso el módulo **renderiza su propio PDF** |
| Riesgo | Medio |
| Señal | `pnpm verify adlp 3` y `pnpm verify spley 3` → PASS |

`adlp` usa OCR: es el primer módulo donde se verá el coste de CPU del OCR con la
ingesta local en el mismo proceso.

---

## Fase 4 · `elperuano`

| | |
| --- | --- |
| Gotcha | El visor es **intermitente** (responde en 0,2 s o cuelga >60 s) → timeout corto + reintento con espera creciente. El CSV índice viene en **CP850** |
| Riesgo | Medio |
| Volumen | Alto: es de las fuentes con más documentos y ficheros |
| Señal | `pnpm verify elperuano 3` → PASS |

Por volumen, es el mejor sitio para medir el ritmo real de la ingesta local antes
de la campaña.

---

## Fase 5 · `doctrina`

| | |
| --- | --- |
| Gotcha | Muchos portales sirven su **SPA en la ruta OAI** y responden 200 con HTML. Confirmar que `?verb=Identify` devuelve XML OAI antes de dar una fuente por viva |
| Particularidad | 8 hosts universitarios distintos; las entidades **privadas no están en el catálogo del Estado** → issuer vacío con warning **es lo correcto**, no un fallo |
| Riesgo | Medio |
| Señal | `pnpm verify doctrina 3` → PASS |

---

## Fase 6 · `spij`

| | |
| --- | --- |
| Particularidad | Entra **por API con cuenta**, no por scraping de HTML: es la fuente más distinta de todas |
| Riesgo | Medio |
| Señal | `pnpm verify spij 3` → PASS |

Si algún día empieza a marcar `document_type: "codigo"`, **antes** hay que portar
el troceado por artículo (P-1). Hoy no lo hace: se comprobó que los módulos solo
emiten `normative`, `jurisprudence` y `doctrine`.

---

## Fase 7 · `gobpe` unificado — 13 subfuentes

**La fase grande, y el camino crítico de la campaña.** Se deja para el final a
propósito: cuando llega, la receta está probada en 6 módulos.

### 7.1 Qué absorbe

`essalud`, `indecopi`, `oefa`, `osinergmin`, `osiptel`, `ositran`, `servir`,
`sunarp`, `sunass`, `tce`, `tfiscal`, `tfl`, `gobpe`.

### 7.2 Lo que gana la fusión

| | Hoy (13 procesos) | Fundido |
| --- | --- | --- |
| Chrome | 13 × ~800 MB ≈ **10,4 GB** | 1 |
| Throttle contra `www.gob.pe` | 13 independientes | **1, compartido** |
| Workers de OCR peleando por CPU | 13 | 1 pool |

### 7.3 Los dos hosts (no confundirlos)

```
www.gob.pe/busquedas.json  ← el BUSCADOR. Es el recurso a racionar.
cdn.www.gob.pe             ← los PDF (718 KB–1,6 MB). Es un CDN, aguanta volumen.
```

### 7.4 Qué hay que cuidar

| Riesgo | Mitigación |
| --- | --- |
| Perder el ledger por fuente | **No fusionar ledgers**: cada subfuente conserva `state/<fuente>_ingest/` o `pnpm status` y `pnpm verify` dejan de funcionar |
| Un fallo se lleva las 13 | Cada subfuente en su propio try/catch: una caída no aborta la vuelta |
| Que el modo individual se use en producción | Se conserva **solo para pruebas**; el camino por defecto es el módulo fundido |
| `gobpe` (normas por entidad) | Decisión previa del owner: **va al final de la cola** y no corre en `all` |
| Paginación | Topa ~400 hojas → ventanas de 1 día |

### 7.5 Antes de subir su concurrencia

Medir qué tolera `www.gob.pe` con **una** subfuente, por escalones (2 → 4 → 6),
anotando cuándo aparecen 429/403. Ese número es el presupuesto del carril y se
reparte entre las 13. **Hoy nadie lo tiene.**

---

## 8. Lo que sigue bloqueado y no depende de mí

| Id | Qué | Por qué importa |
| --- | --- | --- |
| P-6 | **Cuota de Vertex** del proyecto en `us-central1` | Con 8 módulos el techo efectivo es 8 × `EMBEDDING_MAX_CONCURRENCY`. Es lo único que puede tumbar la campaña entera, y la cuenta de servicio da **403** al consultarla: hace falta consola |
| M-1 | Presupuesto real de `www.gob.pe` | Condiciona la Fase 7 (§7.5) |

---

## 9. Deuda abierta (se rellena al ejecutar)

> ⚠️ **Deuda superada.** Las tablas de deuda de este documento se
> consolidaron el 2026-08-07 en
> [`ejecucion-fases-modulos-completos.md` §5](./ejecucion-fases-modulos-completos.md#5-deuda-registro-único),
> que es el registro único. Lo de aquí se conserva como testigo de lo que
> se sabía ese momento, no como lista viva.


Aquí van las fuentes que queden fuera por caída o antibot, con fecha, para
reintentarlas al cerrar la ronda.

| Fecha | Fuente | Qué pasó | Estado |
| --- | --- | --- | --- |
| — | — | (vacío al empezar) | — |

### Mejoras identificadas, aún sin implementar

| Id | Mejora | Ganancia esperada |
| --- | --- | --- |
| P-4 | **OCR en el sitio**: hoy se hereda el rodeo «falla → OCR → re-render a PDF → reingesta». En local se puede OCR-ear y trocear directo | Se ahorra un render y una segunda pasada completa. Requiere devolver `ocr_used` en `IngestData` para no perder el warning del ledger |
| P-1 | Troceado por artículo para `codigo` | Solo si alguna fuente empieza a emitir ese tipo |
| P-3 | `document_relations` | Solo si algún módulo empieza a enviar relaciones |

### Deudas cerradas por comprobación

| Id | Por qué se cierra |
| --- | --- |
| P-2 | **No aplica**: se verificó que los 25 módulos construyen siempre `filename` con `.pdf`. No hace falta extraer docx/xlsx/pptx |
| P-5 | ✅ **Implementado**: reingerir sin cambios pasó de 2,55 s a 170 ms, sin gasto en Vertex |

---

## Registro de cambios

| Fecha | Commit verificado | Qué cambió |
| --- | --- | --- |
| 2026-08-07 | `905bfe8` (rama `feat/ingesta-local`, subida) · `2d540b0` (assistant) | Nace el playbook. Siete fases ordenadas por riesgo creciente, con la receta común, las seis trampas ya pagadas, los gotchas conocidos por fuente y la regla de deuda del owner. Se cierran P-2 (no aplica, verificado) y P-5 (implementado). |
