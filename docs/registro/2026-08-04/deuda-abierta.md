# Deuda abierta de este repo — inventario al 2026-08-04

> Escrito 2026-08-04 · verificado contra `e6a0eef` (rama `docs/registro-sesiones`).
> Método: los dos gates ejecutados (`pnpm typecheck`, `pnpm test`) y lectura del
> código real de cada punto citado. Cada afirmación lleva `archivo:línea`.
>
> Leyenda: 🔴 rompe en fecha conocida · 🟡 abierto sin fecha · ⏸ diferido a
> propósito.

---

## Lo urgente, en 30 segundos

Los gates están **verdes** (`tsc --noEmit` limpio, 22/22 tests). La deuda de este
repo no está en el código que compila, sino en tres sitios: un modelo de Groq con
fecha de apagado, unas fuentes que faltan por cosechar y una decisión aparcada
desde julio.

| # | Deuda | Estado | Dónde |
| --- | --- | --- | --- |
| **D-1** | El default de LLM se apaga | 🔴 **2026-08-16** | `src/services/llm/index.ts:79` y `src/modules/spij/services/llm/index.ts:79,137` |
| **D-2** | 11 de 44 fuentes sin módulo | 🟡 abierto | `docs/registro-scraping.md` (tablero) |
| **D-3** | `INGEST_SOURCE`/`INGEST_STATUS` con default de SPIJ | ⏸ diferido | `src/modules/spij/config/index.ts:71-72` |

---

## D-1 🔴 · El modelo por defecto se apaga el 2026-08-16

Tres sitios, el mismo patrón:

```ts
const model = process.env.LLM_MODEL || "llama-3.1-8b-instant";
```

`src/services/llm/index.ts:79` · `src/modules/spij/services/llm/index.ts:79` y
`:137`.

Groq apaga `llama-3.1-8b-instant` el **2026-08-16**. Pasada esa fecha, las
llamadas a ese ID devuelven error.

Lo que hace este caso **menos grave que el del assistant**: aquí el modelo es un
*fallback*, no una constante. Fijando `LLM_MODEL` en el `.env` de la VM el
problema se mitiga en caliente, sin desplegar código. Lo que hace que **no se
pueda ignorar**: el default del código queda roto para cualquiera que clone el
repo sin esa variable, y la campaña desatendida de dos meses
(`docs/campania-vm.md`) corre precisamente sin nadie mirando.

Qué se rompería: la clasificación de área legal por IA. Según `campania-vm.md` §4,
si Groq falla en un documento «el área cae al default CON `warning` en el ledger
(no se pierde el doc)». Es decir, **la campaña no se para**: sigue ingiriendo con
áreas por defecto y warnings acumulándose. Degradación silenciosa de calidad, no
caída.

El análisis completo del catálogo está en
`arxatec-lawyer-service/docs/registro/2026-08-04/MODELOS_GROQ.md` (medida
**M-3**), que propone `openai/gpt-oss-20b` como reemplazo.
**Aquí no se ha cambiado nada: es decisión del owner.**

## D-2 🟡 · Las fuentes que faltan

El tablero (`docs/registro-scraping.md`, actualizado el 2026-08-03) cuenta
**33 de 44 fuentes scrapeables listas**, con 1 excluida por decisión (CEJ).

No se detalla aquí cuáles faltan **a propósito**: el tablero es el dueño de ese
dato y duplicarlo es cómo se produce la desincronización que este registro existe
para evitar. Si quieres el estado, míralo ahí; si has terminado un módulo,
actualízalo ahí.

## D-3 ⏸ · Los defaults de ingesta

`ingestSource` → `"SPIJ"` y `ingestStatus` → `"Vigente"` viven en la config de
SPIJ (`src/modules/spij/config/index.ts:71-72`) y no en una capa común.

Es el punto **B3** de `docs/registro/2026-07-21/deuda-tecnica.md`, diferido a
propósito: cada módulo nuevo fija su propio `source` y su propio `status`, así
que el patrón correcto ya se aplica y la deuda solo es que el nombre de la config
sugiere que es global cuando no lo es.

Relacionado, y esto sí es una regla dura ya recogida en `CLAUDE.md`: **no definir
`INGEST_SOURCE`/`INGEST_STATUS` globales en el `.env`**, porque pisarían el
`source` por módulo y harían los documentos invisibles a los filtros de la
plataforma.

---

## Qué NO es deuda, aunque lo parezca

- **`estado-integracion-legal.md`**, con sus dos huecos abiertos. Ya no lo están:
  reverificado el 2026-08-04, ver
  [`../2026-07-21/estado-integracion-legal.md`](../2026-07-21/estado-integracion-legal.md).
- **El catálogo de fuentes canónicas.** Sano, con huella SHA-256 fijada en
  `src/services/sources/index.test.ts` y espejos en otros dos repos.

---

## Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-08-04 | Nace. Inventario tras `pnpm typecheck` (limpio) y `pnpm test` (22/22) sobre `e6a0eef`. D-1 es lo único con fecha (2026-08-16) y es mitigable en caliente con `LLM_MODEL`. Nada se ha arreglado en esta sesión: es un registro de medición. |
