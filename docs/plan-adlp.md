# Plan ADLP — módulo `adlp` (Archivo Digital de la Legislación del Perú)

> Escrito 2026-08-01, el día que el sitio "revivió": en realidad **nunca
> estuvo del todo caído — su HTTPS es intermitente** (el handshake responde al
> toque o cuelga >20 s; el navegador reintenta solo y por eso el owner sí
> entraba). Timeout corto + reintentos pacientes, patrón elperuano.

## 1. El sitio (ASP.NET WebForms clásico)

- **Índice** = buscador `LeyNumePP.aspx?xNorma=0` (LEY / RESOLUCIÓN
  LEGISLATIVA / DECRETO LEY): POST con ViewState, consultado **por rango de
  números** (`DdlTipoBusqueda=4`). ⚠ **El grid trunca EN SILENCIO a 20 filas
  y no pinta paginador** → las ventanas de consulta son de ≤20 números
  (constante `VENTANA`). El mismo ViewState sirve para toda la corrida; si
  caduca, el servicio lo refresca una vez y reintenta.
- **LA JOYA — vigencia de la fuente**: el filtro `DdlEstado` ("Normas
  vigentes" / "no vigentes" / "Ambos") da el estado por norma. Dos consultas
  por ventana (ambos + no-vigentes) → `status` **determinista**
  `Vigente`/`Derogado`. Primera fuente gratuita con vigencia real; **estrena
  el valor "Derogado"** del filtro de la plataforma (política fijada en
  plan-spley: la vigencia jamás la decide un LLM).
- **Texto** = PDF directo `Documentos/Leyes/{numero}.pdf` (sin ViewState).
  Cobertura medida por búsqueda binaria (2026-08-01): **~Ley 10000 (1944) →
  ~Ley 30480 (2016)**. Son autógrafas ESCANEADAS (incluso las de 2015) → el
  backend responde 400 y el **OCR local compartido** reingesta con warning
  auditable. Un 404 dentro del barrido = permanente ("el archivo no publica
  PDF"), esas normas fluyen por El Peruano/SPIJ.
- Ficha por norma (`DetLeyNume_1p.aspx?xNorma=6&xNumero={n}&xTipoNorma=0`,
  GET sin ViewState): 3 fechas (autógrafa/promulgación/publicación) y enlaces.
  El módulo v1 no la necesita — el índice ya da fecha de publicación y título.

## 2. El módulo

`src/modules/adlp/` (molde sunat). Ventanas de 20 números reciente-primero
(`ADLP_HASTA`→`ADLP_DESDE`, defaults 30480→10000); por ventana: 2 POSTs de
índice → docs con vigencia → PDF → clasificación de área (`analizarNorma`
sobre tipo+número+título) → ingesta; escaneados → OCR. Ledger
`state/adlp_ingest/` (id `ley-{numero}`; la numeración es correlativa única y
compartida entre leyes y resoluciones legislativas).

| Campo | Valor |
| --- | --- |
| `type` | `normative` |
| `status` | **`Vigente` / `Derogado` según el buscador** (determinista) |
| `source` | `Congreso de la República` (canónico existente — sin cambio de huella) |
| `issuer_entity_ids` | Congreso de la República (fijo, patrón spley) |
| `document_number` | `LEY 26887` / `RESOLUCION LEGISLATIVA 26802` (tipo del grid) |
| `published_at` | fecha de publicación del índice (dd/mm/yyyy → ISO) |
| `citation` | `LEY 26887. Ley General de Sociedades. Publicada el 09/12/1997.` |

## 3. Mandos y verificación

`--limit n` / `ADLP_LIMIT` · `--desde/--hasta` (números de norma) /
`ADLP_DESDE`/`ADLP_HASTA` · `ADLP_DELAY` / `ADLP_CONCURRENCY` / `ADLP_UA`.
Está en `DOC_SCRAPERS` (corre en `pnpm all`, tras sunat).
**Smoke 2026-08-01: 15/15 OK** — 12 del rango 30300–30350 (OCR en todos:
autógrafas escaneadas; emisor Congreso enlazado; LEY y RESOLUCIÓN LEGISLATIVA
diferenciadas) + 3 del rango 26800–26819 verificando el camino derogado
(**RES.LEG. 26802 ingresó con status `Derogado`**). Escala estimada del
barrido completo: ~20.500 normas.

## 4. Fase 2 (decisión de producto)

Lo que el archivo tiene y el v1 no barre: leyes < 10000 (1904-1944, vía
`LeyNoNumeP.aspx` y colecciones), **Leyes de Indias** (`leyes_indias.aspx`),
**Constituciones** (`constituciones.aspx`), leyes en quechua, y los otros
tipos del mismo buscador (`DdlTipoNorma`: DS, D.Leg., DU, Ley Constitucional,
Ley Regional, DSE) — ojo: esos tipos YA fluyen por SPIJ/EP; su único plus
aquí sería la vigencia. Además, la vigencia del ADLP podría **retro-alimentar
el status** de normas ya ingestadas por otras fuentes (el problema A2
diferido por Harry) — sería un job aparte, no este scraper.
