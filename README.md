# SPIJ Scraper

Scraper masivo y asíncrono del **SPIJ** (Sistema Peruano de Información Jurídica,
MINJUS Perú). Pagina `/api/buscar`, clasifica cada norma según su `sector` en una
jerarquía de 3 niveles (**group → subgroup → entity**) y descarga el PDF de cada
documento organizándolo en carpetas.

## Estructura

```
scraper.py        # orquestador (asyncio + aiohttp): auth, paginación, descarga
classifier.py     # matching sector -> group/subgroup/entity (exact/fuzzy/keyword)
config.py         # URLs, credenciales, concurrencia, rate limit, filtros
groups.json       # 8 grupos
subgroups.json    # subgrupos (group_id -> groups)
entity.json       # 2035 entidades (subgroup_id -> subgroups)
```

## Instalación

```bash
pip install -r requirements.txt   # solo aiohttp
```

## Uso

```bash
python scraper.py
```

Funciona sin configuración (usa el **acceso libre** público). Parámetros opcionales
por variables de entorno (ver `config.py`):

```bash
export SPIJ_FORMATO=json           # json (def, solo metadata) | pdf | html | both
export SPIJ_PAGE_SIZE=100          # docs por página
export SPIJ_CONCURRENCY=5          # descargas en paralelo
export SPIJ_DELAY=0.5              # delay mínimo entre requests al mismo endpoint
export SPIJ_DISP="DECRETO SUPREMO" # filtrar por tipo de norma (opcional)
export SPIJ_FECHA_INI=2020-01-01   # rango temporal (opcional)
python scraper.py
```

### Autenticación (acceso libre)

La SPA usa credenciales públicas embebidas. El body real **no** es
`{username, password}` sino:

```json
POST /spij-ext-back/authenticate   {"usuario":"spijext","clave":"password","tipo":0}
POST /spij-ext-solr/authenticate   {"usuario":"spijext","clave":"password"}
```

`tipo:0` = acceso libre, `tipo:1` = usuario suscrito. El JWT vuelve en el campo
`value` de la respuesta. El cliente también envía los headers de navegador
(`Origin`, `Referer`, `User-Agent`) que exige el backend (si no, responde `403`).

### PDF: se renderiza localmente

El acceso libre **no** sirve PDFs: `/api/procesarpdf/{id}` devuelve `404` y la web
genera el PDF en el navegador (html2pdf.js). El scraper obtiene el contenido como
HTML con `/api/procesarword/{id}` y lo renderiza a PDF con **xhtml2pdf** (puro
Python, sin binarios del sistema). Con `SPIJ_FORMATO=html` se guarda el HTML tal
cual (lossless, ideal para RAG) y se evita la dependencia de xhtml2pdf.

## Salidas

- `documentos.json` — **JSONL** (un objeto JSON por línea) con metadata +
  clasificación de cada norma, escrito de forma incremental para no perder
  progreso. Cada línea sigue el esquema solicitado (`id`, `clasificacion`,
  `archivo`, ...). **En modo `json` (por defecto) es la única salida**: no se
  descarga contenido ni se crea la carpeta `output/`.
- `output/{group}/{subgroup}/{entity}/{id}_{codigo}.pdf` — solo si `SPIJ_FORMATO`
  es `pdf`/`html`/`both`.
- `checkpoint.json` — último `desde` procesado; permite reanudar tras una
  interrupción (`Ctrl-C`).
- `scraper.log` — log de ejecución.

## Resiliencia (corrida desatendida de varios días)

- **Concurrencia** limitada (`Semaphore`) para las descargas.
- **Rate limit** por endpoint (delay mínimo configurable).
- **Reintentos** con backoff exponencial en `429` y `5xx`.
- **Re-autenticación** automática ante `401` (el token dura ~24 h).
- **Paginación a prueba de fallos**: si una página falla, reintenta con backoff
  y re-auth hasta 50 veces; un corte de red no mata la corrida.
- **PDF garantizado**: el HTML del SPIJ usa CSS que xhtml2pdf no entiende
  (`currentColor`). Se sanea el CSS y, si aun así falla, se renderiza sin estilos,
  de modo que **todo documento produce un PDF**. Nunca se deja un PDF a medias.
- **Fase de reintento final**: al terminar la paginación, reintenta cualquier
  documento con `descargado=false` hasta agotarlos.
- **Compactación**: al final reescribe `documentos.json` con un único registro
  (el último) por id.
- **Reanudación**: relee `checkpoint.json` y los IDs ya completados. Si se
  interrumpe (`Ctrl-C`, apagón), basta volver a ejecutar el mismo comando.

## Clasificación

`classifier.py` normaliza el texto (mayúsculas, sin tildes, sin stopwords como
`DE/LA/DEL/Y`) y resuelve el `sector` en este orden:

1. `exact` — coincidencia exacta con `entity.name`.
2. `fuzzy` — mejor coincidencia por solapamiento de tokens + `difflib`.
3. `keyword` — reglas (`GOBIERNO REGIONAL`→región, `MUNICIPALIDAD DISTRITAL/PROVINCIAL`,
   `CONGRESO`, `PODER JUDICIAL`/`CORTE`, `MINISTERIO`→Poder Ejecutivo).
4. `unmatched` — sin clasificar (queda registrado para revisión).

El campo `match_confidence` en cada documento indica cuál se usó.
