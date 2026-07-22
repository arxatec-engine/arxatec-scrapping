# Estrategia de fuentes — camino al millón de documentos

> Análisis y **decisión** sobre el informe *"Fuentes Públicas de Información Legal
> del Perú para Construir un Sistema RAG"* (el PDF vive en esta misma carpeta
> `docs/`; aquí está destilado lo accionable), cruzado con lo que ya existe: los
> catálogos del assistant y el pipeline de ingesta.
> Escrito 2026-07-21. Vive en `docs/` junto a `plan-poder-judicial.md` (análisis
> técnico del sitio del Poder Judicial) y `deuda-tecnica.md` (lo que hay que
> arreglar antes de escalar el scrapping). Índice de lectura: `docs/README.md`.
>
> **Si eres una sesión nueva de Claude en el repo `arxatec-assistant`**: este doc
> viene del repo `arxatec-scrapping` y resume la estrategia de adquisición de
> documentos; el checklist de la sección 7 ya fue verificado contra el código del
> assistant — los resultados están en `docs/deuda-tecnica.md`.

---

## 1. El modelo mental que ordena todo

La confusión natural es: *"tenemos catálogos (grupos, subgrupos, áreas legales,
entidades) y ahora aparecen 20 fuentes — ¿cómo encaja?"*. Respuesta:

**Los catálogos son el DESTINO. Las fuentes son los ORÍGENES. Son cosas
independientes y no compiten.**

- Los 4 catálogos (`public/data/`: `groups.json`, `subgroups.json`,
  `entity.json` con 2.035 entidades, `legal_areas.json`) definen **cómo se
  clasifica un documento al entrar** al assistant, venga de donde venga:
  - `entity.json` → **quién lo emitió** (`issuer_entity_ids`)
  - `legal_areas.json` → **de qué trata** (`legal_area` / `subarea`, catálogo cerrado)
  - `groups/subgroups` → jerarquía que usa el clasificador determinista de SPIJ
    para mapear "sector" → entidad
- Cada fuente nueva = **un módulo adaptador más** en `src/modules/` que llena el
  **mismo JSON de contrato** y hace POST al **mismo endpoint** de ingesta.
  N fuentes ≠ N sistemas: es 1 embudo con N llaves de agua.

Distinción clave que resuelve el 90 % de las dudas: **fuente ≠ emisor**.

| Caso | Fuente (de dónde scrapeo) | Emisor (issuer_entity_ids) |
| --- | --- | --- |
| SPIJ | API del MINJUS | miles de entidades distintas → hace falta el clasificador sector→entidad |
| El Peruano | busquedas.elperuano.pe | miles de entidades distintas → el metadato "Entidad" viene en el propio índice |
| PJ Jurisprudencia Sistematizada | portal WCM del PJ | **fijo**: "Poder Judicial" / "Corte Suprema de Justicia de la República" |
| Tribunal Constitucional | jurisprudencia.sedetc.gob.pe | **fijo**: "Tribunal Constitucional" |
| Tribunal Fiscal, INDECOPI, OSCE, SERVIR, SUNARP, OEFA | buscador propio de cada uno | **fijo**: la entidad dueña del tribunal |

Consecuencia buena: en los silos de jurisprudencia la clasificación de emisor es
**más fácil** que en SPIJ (es constante por módulo), y el área legal viene en
gran parte regalada por la navegación del sitio (materia civil/penal/laboral…).
El LLM solo afina la subárea. **Los catálogos actuales alcanzan** — verificado:
ya existen en `entity.json`: Tribunal Constitucional, Tribunal Fiscal, Poder
Judicial, Corte Suprema, Congreso de la República, MEF, y con nombre completo
INDECOPI ("Instituto Nacional de Defensa de la Competencia…"), OSCE ("Organismo
Supervisor de las Contrataciones del Estado"), SERVIR ("Autoridad Nacional del
Servicio Civil"), SUNARP ("Superintendencia Nacional de los Registros
Públicos"), OEFA ("Organismo de Evaluación y Fiscalización Ambiental"), SUNAT
("Superintendencia Nacional de Aduanas y de Administración Tributaria"),
OSINERGMIN, OSIPTEL, SUNASS. (Verificar OSITRAN al llegar a reguladores.)

## 2. Qué dice el informe, en corto

1. **Sí se puede** construir el corpus con fuentes 100 % gratuitas, pero ninguna
   fuente oficial tiene API documentada de descarga masiva → todo es scraping o
   endpoints públicos no documentados.
2. **El Peruano es la columna vertebral**: todas las normas nacionales desde
   1904, gratis, con endpoint de **texto HTML sin OCR**
   (`busquedas.elperuano.pe/api/visor_html/{id}`) y cuadernillo diario para
   actualización (`/cuadernillo/NL/{YYYYMMDD}`). Además publica **Sentencias en
   Casación**, RTF de observancia obligatoria y resoluciones de reguladores.
3. **SPIJ**: la mejor fuente *sistematizada* (vigencias y concordancias), ~567k
   normas, pero solo ~210k de acceso libre; el resto es de pago (S/ 929,20/año).
   Ya lo scrapeamos (módulo existente).
4. **Jurisprudencia = silos por tribunal**, cada uno con su buscador, sin APIs:
   TC, PJ, Tribunal Fiscal, INDECOPI, OSCE, SERVIR, SUNARP, OEFA. Scraping por
   tribunal.
5. **El cuello de botella no es el acceso sino la normalización**: OCR de PDFs
   escaneados, deduplicación entre fuentes, y vigencia/derogación (solo el SPIJ
   de pago la resuelve oficialmente).
6. **Evitar el CEJ** (cej.pj.gob.pe) en esta etapa: anti-bot, datos personales
   sensibles (Ley 29733), riesgo legal. (Coincide con la instrucción de Harry.)

## 3. Tabla maestra de fuentes (priorizada)

| P | Fuente | Tipo doc | Volumen est. | Técnica | Emisor | Riesgo |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ | SPIJ acceso libre | normative | ~210k | API JSON (módulo hecho) | clasificador | bajo |
| **P0** | **PJ Jurisprudencia Sistematizada** | jurisprudence | miles | HTML WCM simple | fijo | bajo |
| **P1** | **El Peruano (busquedas)** | normative + jurisprudence (casaciones) + administrative | **cientos de miles → aquí vive el millón** | visor_html (texto limpio, sin OCR) + cuadernillo diario | campo "Entidad" del índice | medio (endpoints no documentados) |
| **P1b** | datosabiertos.gob.pe (CSV "Dispositivos Legales" + "Sistematización SPIJ") | índice/metadata | ~2013–2024 | descarga CSV + API DKAN | n/a (alimenta a P1) | bajo |
| **P2** | Tribunal Constitucional | jurisprudence | ~decenas de miles | buscador + PDFs | fijo | medio (PDFs escaneados) |
| **P3** | Tribunal Fiscal → INDECOPI → OSCE → SUNARP (SIP) → SERVIR → OEFA | administrative/jurisprudence | decenas de miles c/u | buscador + PDFs por tribunal | fijo por módulo | medio (OCR) |
| P4 | gob.pe colecciones + reguladores | administrative | variable | HTML estructurado | por colección | bajo |
| P5 | Doctrina (ALICIA OAI-PMH, revistas OJS) | doctrine | grande | **la más limpia** (protocolo estándar) | universidades | decisión de producto pendiente |
| ❌ | CEJ del Poder Judicial | jurisprudence | millones | anti-bot | — | **alto: Ley 29733, datos personales — NO en esta etapa** |
| ❌ | EJE, SPIJ completo de pago | — | — | — | — | no aplica por ahora |

## 4. LA DECISIÓN

1. **Terminar P0 (PJ Jurisprudencia Sistematizada) tal como está planificado**
   en `plan-poder-judicial.md`. No es la fuente del millón (son miles de
   docs), pero: (a) ya está asignada, (b) es chica y segura, (c) **valida el
   pipeline completo de jurisprudencia de punta a punta** — type=jurisprudence,
   emisor fijo, área por árbol de navegación, PDF nativo — que es exactamente el
   molde de P2 y P3.
2. **El millón sale de P1: El Peruano.** Es la única fuente con volumen de seis
   cifras, texto limpio sin OCR y actualización diaria integrada. El módulo
   `elperuano` debe ser la prioridad grande post-P0. Bootstrap barato: los CSV
   de datosabiertos (P1b) dan el índice 2013→2024 con id/sumilla/entidad/enlace
   **sin scraping**; el buscador JSON (no documentado, inspeccionar con
   DevTools) completa lo que falte.
3. **Después, silos de jurisprudencia en orden de valor/facilidad**: TC (P2, ya
   mencionado por Harry como tarea siguiente), luego tribunales administrativos
   (P3) reutilizando el molde de P0.
4. **No tocar CEJ ni EJE.** Riesgo legal y técnico; el informe y Harry coinciden.
5. **Doctrina (P5) se decide con Harry**: técnicamente es lo más limpio
   (OAI-PMH), pero es otro tipo de contenido (tesis/artículos, no fuentes del
   derecho) — confirmar si entra en la misma colección del RAG.

Regla de arquitectura que se mantiene siempre: **un módulo por fuente en
`src/modules/` + el mismo contrato de ingesta**. Nada de scrapers sueltos.

## 5. Riesgos transversales y mitigación

| Riesgo | Qué pasa | Mitigación |
| --- | --- | --- |
| **Vigencia/derogación** | El Peruano da la norma "tal como se publicó"; el RAG podría citar normas derogadas como vigentes | No mandar `status: "Vigente"` a ciegas (hoy es el default de `INGEST_STATUS`); decidir semántica con el equipo del assistant (§7) |
| **Duplicados entre fuentes** | La misma casación está en PJ Sistematizada **y** en El Peruano; las RTF están en Tribunal Fiscal **y** El Peruano | Dedupe por `document_number` + emisor del lado del assistant (verificar si existe; §7). El ledger local solo dedupea dentro de cada módulo |
| **OCR** | Muchos PDFs de tribunales son escaneados | La respuesta del ingest trae `pages_with_text`: si es 0/bajo, marcar el doc para cola de OCR en vez de darlo por bueno |
| **Endpoints frágiles** | `visor_html`, `api/media`, `spley-portal-service` no son oficiales y pueden cambiar | Ledger + checkpoint (ya es el patrón del repo) para reanudar; monitoreo; no construir sobre un único endpoint |
| **Datos personales (Ley 29733)** | Resoluciones judiciales contienen nombres de personas | Quedarse en fuentes curadas/públicas (sistematizada, TC); anonimización es decisión del assistant; evitar CEJ |
| **Bloqueo de IPs / fingerprint** | pj.gob.pe rechaza IPs de datacenter; APIs Angular del Estado pueden exigir fingerprint Chrome (lección repo ONPE: `curl_cffi impersonate="chrome124"`) | Correr desde red residencial/oficina; tener fallback Puppeteer (ya es dependencia) |
| **Scrapers que se rompen** | Todos los repos peruanos previos están abandonados | Módulos aislados, reanudables, con logs y stats — un módulo roto no tumba el resto |

## 6. Cómo se llena el contrato por familia de fuente

El contrato (ver `plan-poder-judicial.md` §3.1 para el detalle del POST) se
llena así según la familia:

| Campo | SPIJ (hecho) | PJ/TC/tribunales | El Peruano |
| --- | --- | --- | --- |
| `type` | `normative` | `jurisprudence` (tribunales administrativos: **confirmar valor**, §7) | `normative` / `jurisprudence` según cuadernillo/sección |
| `issuer_entity_ids` | clasificador sector→entidad | **constante del módulo** (uuid de entity.json) | resolver campo "Entidad" del índice contra entity.json (reutilizar clasificador) |
| `legal_area` | LLM sobre sumilla/HTML | árbol de navegación da la materia; LLM afina subárea | LLM sobre sumilla del índice |
| `document_number` | código de norma | nº de recurso/expediente/RTF | nº de norma |
| PDF | se genera con Puppeteer desde HTML | se descarga listo | visor_html→PDF propio, o `api/media` |
| `source` | `SPIJ` | `PJ`, `TC`, `TRIBUNAL_FISCAL`… (**confirmar enum**, §7) | `ELPERUANO` |

## 7. Checklist para el repo `arxatec-assistant` (siguiente parada)

Al abrir sesión en el assistant (env apuntando al bucket de **desarrollo** en
AWS, así se puede ver todo lo que entra):

1. **Contrato**: ubicar el endpoint `legal-documents/ingest` y confirmar qué
   valores acepta `type` (¿solo `normative`/`jurisprudence` o también
   `administrative`/`doctrine`?) y si `source` es enum cerrado o texto libre.
2. **Dedupe**: ¿el backend rechaza (409?) un documento repetido? ¿con qué llave
   — `document_number`+emisor, hash del archivo, `source_url`? Esto define la
   estrategia anti-duplicados entre fuentes (§5).
3. **`status` para jurisprudencia**: una sentencia no es "Vigente/Derogada";
   ¿qué valor corresponde?
4. **Catálogos**: confirmar que `groups/subgroups/entity/legal_areas` del
   assistant son la misma versión que `public/data/` de este repo (aquí son
   copia; la fuente de verdad debería ser el assistant).
5. **Observabilidad**: mirar en el bucket de desarrollo cómo quedaron los docs
   ya ingestados por SPIJ (estructura de keys S3, metadata guardada) para
   imitar el resultado esperado.
6. **Sumilla/título de jurisprudencia**: ¿el backend espera sumilla propia por
   documento? En PJ la sumilla es del *tema*, no del doc → posible generación
   con IA desde el PDF (decisión de producto).

## 8. Preguntas abiertas para Harry

**Respondidas 2026-07-21 por Slack** (las 4 de contrato; detalle y consecuencias
en `deuda-tecnica.md`, sección "Decisiones de Harry"):

- ~~Confirmar valores de `source` y `type` para las fuentes nuevas (§7.1)~~ →
  los valores canónicos son los del enum del backend; las props que una fuente
  no brinde se generan con IA (Groq). El union type del scraper ya lo fuerza.
- ~~¿Dedupe en backend?~~ → no por ahora; el state/ledger local es el mecanismo
  oficial. Mejora del `/ingest` = futuro, prioridad media-baja.
- ~~¿`status`?~~ → problema reconocido como crítico pero diferido (aún no hay
  cómo saber vigencia/derogación). Provisional: un solo vocabulario (`Vigente`).

**Siguen abiertas** (no eran urgentes para P0/P1):

- ¿Doctrina (tesis, revistas) entra al mismo corpus o es colección aparte?
- ¿Interesa normativa regional/local (ordenanzas) o solo alcance nacional por ahora?
- ¿Presupuesto futuro para SPIJ de pago como capa de validación de vigencias, o
  se acepta el riesgo de derogadas mitigado con metadatos?
