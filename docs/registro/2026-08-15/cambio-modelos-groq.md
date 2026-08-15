# El apagado de Groq del 16/08, y por qué el 400 del clasificador no era del modelo

> Escrito 2026-08-15 · verificado contra `ddf1d5d` (rama `fix/modelos-groq-apagado`).
> Método: **12 llamadas reales a la API de Groq** replicando el payload exacto de
> `analizarNorma` (mismo prompt, mismo `max_tokens`, mismo `response_format`),
> más el rastreo de los tres defaults de modelo del repo.
>
> Corrige la conclusión de
> [`../2026-08-07/ejecucion-fases-modulos-completos.md`](../2026-08-07/ejecucion-fases-modulos-completos.md) §2.
> Es **M-3** de `arxatec-lawyer-service/docs/registro/2026-08-04/MODELOS_GROQ.md`.

---

## El problema con fecha

Groq apaga `llama-3.1-8b-instant` y `llama-3.3-70b-versatile` el **2026-08-16**.
Este repo tenía los dos como default:

| Dónde | Default antes | Qué clasifica |
| --- | --- | --- |
| `src/services/llm/index.ts:79` | `llama-3.3-70b-versatile` | El área legal de **todos** los módulos |
| `src/modules/spij/services/llm/index.ts:79` | `llama-3.1-8b-instant` | Área legal del SPIJ |
| `src/modules/spij/services/llm/index.ts:137` | `llama-3.1-8b-instant` | Emparejar el sector del SPIJ con una entidad |

Los tres son `process.env.LLM_MODEL || "<default>"`, así que en caliente se
mitigan con una variable de entorno. Pero el default del código quedaba roto, y
el default es lo que corre si nadie se acuerda de poner la variable.

## Por qué el default «estable» era el peor de los dos

El 2026-08-07 se diagnosticó bien un fallo caro: con `openai/gpt-oss-20b` y
`response_format: json_object`, Groq devolvía **400 en ráfaga** (8 de 8) y, con
el `catch` vacío de entonces, **todo el corpus caía a «Derecho administrativo»**.
El arreglo fue fijar `llama-3.3-70b-versatile` como default.

La conclusión que quedó escrita en el código fue *«los modelos de razonamiento
(gpt-oss) fallan a menudo con `response_format json_object`»*. **La observación
era cierta; la causa, no.** Y llevaba a pinchar como «estable» un modelo que se
apaga nueve días después.

### Lo que dicen las 12 llamadas (2026-08-15)

Mismo prompt de `analizarNorma`, mismo catálogo de 60 subáreas, misma norma:

| Configuración | Resultado |
| --- | --- |
| `gpt-oss-20b` · `max_tokens: 500` · **sin `reasoning_effort`** | **3 de 3 → HTTP 400** «Failed to validate JSON» |
| `gpt-oss-20b` · `max_tokens: 500` · **`reasoning_effort: low`** | 3 de 3 → 200, JSON válido (168 tokens, 57 de razonamiento) |
| `gpt-oss-20b` · `max_tokens: 1200` · `reasoning_effort: low` | 3 de 3 → 200, JSON válido |

Y en el service, con el clasificador de intención (otro prompt, otro JSON):
`gpt-oss-20b` y `gpt-oss-120b` con `low`/`medium`, **12 de 12 correctas**.

**La causa real:** los tokens de razonamiento salen del **mismo**
`max_tokens` que la respuesta. Con 500 y sin `reasoning_effort`, el modelo se
gasta el presupuesto razonando, la generación restringida a JSON no llega a
cerrar el objeto y Groq rechaza la petición con 400. No es que el modelo «falle
con JSON»: es que no le queda sitio para escribirlo.

Con `reasoning_effort: "low"` el razonamiento baja a ~57 tokens y sobra
presupuesto. El fallo desaparece por completo.

## Qué se cambió

| Dónde | Ahora |
| --- | --- |
| `src/services/llm/index.ts` | `openai/gpt-oss-20b` · `reasoning_effort: "low"` · `max_tokens` 500 → **1200** |
| `src/modules/spij/…/llm/index.ts:79` | ídem |
| `src/modules/spij/…/llm/index.ts:137` | `openai/gpt-oss-20b` · `low` · `max_tokens` 100 → **600** |

El de 100 tokens era el más expuesto: con un modelo de razonamiento no habría
devuelto un solo emparejamiento. Subir el tope no encarece nada —Groq cobra lo
generado, no lo reservado—, solo deja de convertir el razonamiento en un 400.

El `catch` que registra status y mensaje (arreglo del 2026-08-07) **se queda**:
es lo que convirtió este fallo en visible, y sin él esta sesión no habría tenido
de dónde tirar.

## Lo que esto enseña

Un diagnóstico correcto puede dejar escrita una causa equivocada, y la causa
equivocada es la que se hereda: aquí acabó **en un comentario del código**,
justificando un default que caducaba en nueve días. La diferencia entre «gpt-oss
falla con JSON» y «el razonamiento comparte el presupuesto de salida» es la
diferencia entre pinchar un modelo muerto y añadir un parámetro.

Regla práctica para este repo: **todo `response_format: json_object` contra un
`gpt-oss` lleva `reasoning_effort` explícito y un `max_tokens` con holgura.**

## Qué queda abierto

| # | Punto | Estado |
| --- | --- | --- |
| G-1 | Comprobar la clasificación sobre documentos reales (el 2026-08-07 se midió con 9 llamadas y 25 documentos del TC; aquí solo se midió que la API responde) | ⏳ pendiente de una corrida |
| G-2 | `LLM_MODEL` en los `.env` de la VM: si apunta a un modelo apagado, el default nuevo no la salva | ⏳ revisar antes del 16/08 |
| G-3 | Los 34 documentos ingeridos con el área por defecto (D-3 del 2026-08-07) siguen sin reingestar | 🔴 heredado |

---

## Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-08-15 | Nace. M-3 aplicado: los tres defaults pasan a `gpt-oss-20b` con `reasoning_effort: low`. Corrige la causa que el registro del 2026-08-07 dejó escrita: el 400 no era del modelo, era el presupuesto compartido con el razonamiento (medido, 3/3 fallos sin effort y 6/6 correctas con él). |
