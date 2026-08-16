# Registro — memoria de sesión de este repo

Aquí vive lo que **se averiguó**, no lo que el repo **es**. La diferencia importa,
y en este repo importa más que en ninguno: `docs/` tiene veintitantos documentos y
la mayoría son **vivos**.

- Un documento **vivo** describe el sistema actual y se **reescribe** cuando el
  sistema cambia: los `plan-<fuente>.md`, `runbook-arranque.md`,
  `registro-scraping.md` (el tablero), `catalogo-entidades.md`,
  `fuentes-canonicas.md`, `estrategia-fuentes.md`, `campania-vm.md`,
  `arquitectura-produccion.md`, `anti-bloqueo-scraping.md`.
- Un **registro** guarda el resultado de una investigación o auditoría hecha **ese
  día**: qué se rastreó, contra qué commit, qué se concluyó y qué quedó abierto.
  Se **acumula**, no se reescribe.

Un registro es un testigo fechado. Sin la fecha y el commit no vale nada, porque
el código de debajo se mueve.

> **Ojo con el nombre:** `docs/registro-scraping.md` **no** es un registro en este
> sentido. Es el **tablero vivo** de las 44 fuentes y se actualiza cada vez que
> un módulo termina. Vive en `docs/`, no aquí, y así se queda.

---

## Las cuatro reglas

### 1. Un documento nuevo abre una carpeta con la fecha en que se escribe

```text
docs/registro/2026-07-21/deuda-tecnica.md
docs/registro/2026-07-21/estado-integracion-legal.md
```

Formato `YYYY-MM-DD`, fecha de **creación** del documento, no la del hallazgo que
describe. Si en un mismo día nacen dos registros de temas distintos, comparten
carpeta — como esos dos.

Nombres en `kebab-case`, como el resto de `docs/` de este repo.

### 2. Un cambio sobre un registro existente se anota en la carpeta de ese registro

No se crea una carpeta nueva para actualizar algo que ya existe. Si hoy se
reverifica `estado-integracion-legal.md`, la nota va en `2026-07-21/` —donde vive
el documento— con una fila nueva en su **Registro de cambios**. La carpeta
conserva la fecha de nacimiento; el changelog interno lleva la cronología.

Se abre carpeta nueva solo cuando el tema es nuevo. Regla práctica: si necesitas
un título distinto, es un registro nuevo; si solo necesitas un párrafo distinto,
es una edición del anterior.

### 3. Todo registro declara contra qué lo verificaste

Cabecera obligatoria, antes de cualquier contenido:

```markdown
> Escrito 2026-08-04 · verificado contra `e6a0eef` (rama `docs/registro-sesiones`).
> Método: rastreo del código real, no de documentación previa.
> Cada afirmación cita `archivo:línea` para poder reverificarla sin rastrear de nuevo.
```

Sin commit, un registro es una opinión. Con commit, es reproducible: cualquiera
puede hacer `git checkout <commit>` y comprobar las citas.

Este repo casi nunca averigua algo que le concierna solo a él: la cadena es
`scrapping → assistant → service → platform`. Cuando un registro afirma algo de
otro repo, **declara también el commit de ese repo**.

### 4. Nunca asumas que la documentación está actualizada — tampoco esta

Esta es la regla que las otras tres sirven. Antes de apoyarte en cualquier
afirmación de un `.md` de este repo —incluido `CLAUDE.md`, incluido este
registro—, **compruébala contra el código**. Si la comprobación falla, corregir
el documento es parte del trabajo, no una tarea aparte.

No es una precaución teórica. El día que se creó esta carpeta (2026-08-04), al
reverificar `estado-integracion-legal.md` resultó que sus **dos huecos abiertos
estaban cerrados**, y el más importante por una arquitectura **distinta** a la que
el propio documento especificaba: el chat sí usa el corpus legal, pero el Node lee
Qdrant directo — el endpoint `POST /legal-documents/internal/search` que el
documento pedía construir **nunca existió**. En la misma pasada, `docs/README.md`
seguía diciendo «Hoy existe un módulo funcionando: SPIJ» cuando el tablero contaba
33 de 44 fuentes.

Nadie mintió. La documentación envejeció, que es lo que hace la documentación.

Corolario para agentes: la salida de una sesión anterior es **evidencia**, no
**verdad**. Cítala, reverifícala y anota el resultado de la reverificación.

---

## Índice

| Fecha | Documento | Qué es | Estado | Última verificación |
| --- | --- | --- | --- | --- |
| 2026-07-21 | [deuda-tecnica.md](2026-07-21/deuda-tecnica.md) | Auditoría del código real de este repo y del assistant, con `archivo:línea`: los 4 bloqueantes de contrato (A1–A4), la deuda del repo (B1–B4) y las decisiones que Harry cerró por Slack. | ✅ A1–A4 decididas y mayormente cerradas · ⏸ B3 diferido | 2026-07-21 · **no reverificado** en la mudanza del 2026-08-04 |
| 2026-07-21 | [estado-integracion-legal.md](2026-07-21/estado-integracion-legal.md) | El dato de punta a punta a través de los cuatro repos, con los 2 huecos de producto y el backlog. **Testigo de julio, no estado de hoy.** | ⚠️ superado — los 2 huecos están cerrados, el Hueco 1 por otra arquitectura | 2026-08-04 · `e6a0eef` + `f776a8f` + `6cc4d83d` · reverificado contra el código de los 3 repos |
| 2026-08-04 | [deuda-abierta.md](2026-08-04/deuda-abierta.md) | Inventario de la deuda abierta del repo con los gates en verde. El único punto con fecha es el default `llama-3.1-8b-instant` (apagado el 2026-08-16), mitigable en caliente con `LLM_MODEL`. | ✅ **D-1 resuelto el 15/08** · 🟡 D-2 · ⏸ D-3 — **los tres reverificados**, no solo el cerrado | 2026-08-15 · `fbf4aa0` · typecheck limpio, 32/32 tests |
| 2026-08-15 | [cambio-modelos-groq.md](2026-08-15/cambio-modelos-groq.md) | **M-3**: los tres defaults de modelo del repo apuntaban a los dos que Groq apaga el 16/08. Pasan a `openai/gpt-oss-20b` con `reasoning_effort: "low"`. Y corrige la causa que el registro del 07 dejó escrita en un comentario del código: el 400 «Failed to validate JSON» no lo causa el modelo de razonamiento, sino que su razonamiento sale del mismo `max_tokens` que la respuesta — medido, 3/3 fallos sin `reasoning_effort` y 6/6 correctas con él. | ✅ M-3 aplicado · ⏳ G-1 (clasificación sobre documentos reales) · ⏳ G-2 (`LLM_MODEL` en la VM) · 🔴 G-3 (34 docs sin reingestar) | 2026-08-15 · `ddf1d5d` · 12 llamadas reales a Groq, typecheck limpio, 32/32 tests |
| 2026-08-07 | [ejecucion-fases-modulos-completos.md](2026-08-07/ejecucion-fases-modulos-completos.md) | La ejecución real de las fases: los 21 módulos pasan a ingerir por su cuenta desde **dos** clientes compartidos, no 21 fachadas. Y el hallazgo caro: el clasificador de área legal fallaba en silencio (Groq 400 + `catch` vacío) y **todo el corpus caía a «Derecho administrativo»**, que es el campo por el que filtra la plataforma. | ✅ fases 1–6 en PASS · ⏳ carril gob.pe · 🔴 D-1…D-3 | 2026-08-07 · `abcc2fb` · typecheck limpio, 32/32 tests |
| 2026-08-07 | [fases-7-modulos.md](2026-08-07/fases-7-modulos.md) | **Playbook ejecutable** para convertir los 7 módulos restantes en módulos completos: la receta común (el cambio por módulo son ~25 líneas), las seis trampas ya pagadas en el piloto, los gotchas conocidos de cada fuente y la señal de aceptación. Orden por riesgo creciente, con `gobpe` unificado al final. | ⏳ listo para ejecutar · 🔴 P-6 (cuota de Vertex) y M-1 (presupuesto de gob.pe) siguen bloqueados | 2026-08-07 · `905bfe8` · typecheck limpio, 32/32 tests |
| 2026-08-07 | [piloto-ingesta-local-tfl.md](2026-08-07/piloto-ingesta-local-tfl.md) | El primer módulo que ingiere por su cuenta (Vertex + Qdrant + PG + S3) en vez de pasar por el assistant. **Es el modelo a replicar**: qué se construyó, qué se midió (22 chunks por ambas rutas, 94,1 % de similitud, estructura de punto idéntica, PASS y ≈2,5× de ritmo) y los tres desajustes de PostgreSQL que solo aparecen al ejecutarlo. | ✅ piloto en PASS · ✅ P-5 implementado · ⛔ P-1 y P-2 no aplican (verificado) · 🔴 P-6 (cuota) · 🟡 P-4 | 2026-08-07 · `71ab190` · typecheck limpio, 32/32 tests, `pnpm verify tfl 3` PASS |
| 2026-08-07 | [plan-lanzamiento-paralelo.md](2026-08-07/plan-lanzamiento-paralelo.md) | Cuántos scrapers se pueden lanzar a la vez y en qué orden. Mapa de hosts sacado del código: **14 de 22 módulos comparten `www.gob.pe`** y el throttle es por proceso, así que el paralelismo ingenuo multiplica ×14 el ritmo contra un solo portal. El techo son ~8-10 módulos por host, no la RAM. Plan por olas con carriles. | 🔴 M-1 (presupuesto de gob.pe) y M-2 (cuota de Vertex) sin medir · E-1…E-4 a decisión del owner | 2026-08-07 · `b2c69b2` · sin cambios de código |

Añadir un registro = una fila aquí, en la misma sesión que lo crea. Un registro
sin fila en el índice es un registro que nadie va a encontrar.

---

## Qué NO va aquí, y por qué (se decidió doc por doc)

El error caro en este repo sería mover en bloque. Casi todo `docs/` es vivo. Esto
es lo que se leyó y se decidió el 2026-08-04, para que la próxima sesión no
vuelva a discutirlo:

| Documento | Por qué se queda en `docs/` |
| --- | --- |
| `registro-scraping.md` | **Tablero vivo** pese al nombre. Se actualiza al cerrar cada módulo; es la verdad del estado. |
| `runbook-arranque.md` | Instrucciones de operación: se consultan y se reescriben. |
| `campania-vm.md` | Nace fechado (2026-07-30, decisión del owner) pero §2–§5 son el **runbook de una campaña en curso** —puesta en marcha en la VM, qué hace el sistema solo— y se actualizó el 2026-08-03. Congelarlo en una carpeta con fecha lo sacaría del sitio donde se busca. |
| `arquitectura-produccion.md` | Mismo caso: mediciones fechadas (2026-08-03) al servicio de §7 «puesta en marcha» y §8 «requisitos de máquina», que se siguen hoy. |
| `anti-bloqueo-scraping.md` | Mitad informe de un incidente del 2026-07-22, mitad referencia de técnicas por sitio que `CLAUDE.md` cita como fuente de los *gotchas* de red. En la duda, **no se mueve**. |
| `estrategia-fuentes.md` | La priorización P0–P5 se consulta antes de cada módulo nuevo. |
| `catalogo-entidades.md`, `fuentes-canonicas.md` | Contratos vigentes; `fuentes-canonicas.md` además tiene huella SHA-256 fijada en tests de tres repos. |
| `plan-<fuente>.md` (16) | Uno por módulo: cómo funciona el portal y cómo se le saca el dato. Se reescriben cuando el portal cambia. |
| `Fuentes Públicas … RAG.pdf` | Insumo original, ya destilado en `estrategia-fuentes.md`. |

Si un documento no tiene fecha identificable, **no le inventes una**: déjalo en
`docs/` y añade aquí la fila que explique por qué.

---

## Lo que se registra en otro repo

La cadena legal cruza cuatro repos y no todo se registra aquí:

- **Trazabilidad del corpus** (por qué el chat encuentra o no un documento):
  `arxatec-lawyer-assistant/docs/registro/2026-07-24/TRAZABILIDAD_FUENTES.md`.
- **Deuda de facturación y mapa de deuda del plano IA**:
  `arxatec-lawyer-service/docs/registro/`.
- **Catálogo de modelos de Groq**:
  `arxatec-lawyer-service/docs/registro/2026-08-04/MODELOS_GROQ.md`. Su medida
  **M-3** toca a este repo — el default `llama-3.1-8b-instant` de
  `src/services/llm/index.ts` y `src/modules/spij/services/llm/index.ts` se apaga
  el **2026-08-16**. Decisión del owner; aquí no se cambia nada por cuenta propia.
