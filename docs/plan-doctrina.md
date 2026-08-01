# Plan Doctrina — módulo `doctrina` (OAI-PMH, tesis y artículos jurídicos)

> Escrito 2026-07-31. UN módulo cubre las **9 filas P5** del Excel (PUCP, UNMSM,
> UPC/UNI/URP, revistas Derecho PUCP/IUS ET VERITAS/THĒMIS, SciELO, agregadores):
> todas hablan el protocolo estándar **OAI-PMH**, así que un solo cosechador
> parametrizado por repositorio las atiende. Decisión del owner 2026-07-31:
> la doctrina entra al corpus (`type=doctrine`).

## 1. El protocolo (uno para todos)

`GET {baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`, paginado por
`resumptionToken` (el token ES el único parámetro de las páginas siguientes).
Cada registro es Dublin Core plano (`<dc:title>`, `<dc:creator>`,
`<dc:subject>`, `<dc:description>` = resumen, `<dc:date>`, `<dc:type>`,
`<dc:identifier>` = handle). Parser por regex (DC es plano, sin anidamiento) —
sin dependencia de XML. Registros `status="deleted"` se saltan.

**Endpoints verificados** (2026-07-31): PUCP tesis
(`tesis.pucp.edu.pe/oai/request`), UNI, ULima devuelven OAI real. Muchos otros
portales sirven su SPA en esa ruta (falso 200) — cada repo nuevo se confirma
antes de añadirlo a `REPOS`.

**Tanda 2** (2026-08-01), con sus gotchas: **UPC** exige UA de cosechador (su
WAF responde 403 a UAs de navegador solo en `ListRecords` — al revés que un
bot manager típico; campo `userAgent` por repo). **URP** y **AMAG** son
DSpace 7: el OAI vive en `/server/oai/request`, no en `/oai/request`.
**SciELO** se cosecha **por set** (campo `set`; sus sets son ISSN de revista:
`0251-3420` = Derecho PUCP, la única jurídica del agregador) porque la
paginación global devolvía 500 intermitente; además envuelve valores en CDATA
y su `<record>` trae atributos — el parser quedó tolerante a ambos.

## 2. El módulo

- `REPOS` (constants): lista `{key, baseUrl, emisor, soloDerecho?, userAgent?,
  set?}`. Añadir un repositorio = una entrada. `--repos <slugs>` restringe.
  Hoy 7: pucp-tesis, uni, ulima, upc, urp, amag, scielo.
- **Filtro a lo jurídico**: los repos generalistas traen TODAS las facultades;
  se conserva solo lo que matchea `LEGAL_KEYWORDS` en título/materias (en el
  smoke: 80 descartadas, 19 jurídicas de 100). Las revistas de derecho (OJS)
  van con `soloDerecho: true` (sin filtro).
- **Documento**: PDF de texto (Puppeteer) con título + autores + materias +
  **resumen** — la esencia académica para el RAG ("qué tesis hay sobre X").
  No se descarga el PDF original (el handle a veces exige navegar; el resumen
  DC es suficiente y estable).

| Campo | Valor |
| --- | --- |
| `type` | `doctrine` |
| `status` | `Vigente` (la doctrina no se deroga) |
| `source` | `Repositorios Académicos del Perú` (canónico nuevo `doctrina`, huella `0c66730c…` en los 3 repos, espejos en main) |
| `issuer_entity_ids` | la universidad (best-effort): las estatales resuelven; las **privadas NO están en el catálogo del Estado** → issuer vacío con warning (la fuente doctrina basta como faceta) |
| `citation` | `Autor (año). Título. Universidad.` |
| `source_url` | handle del repositorio |

## 3. Mandos y verificación

`--limit n` / `DOCTRINA_LIMIT` · `--repos <slugs>` / `DOCTRINA_REPOS` ·
`DOCTRINA_DELAY` / `DOCTRINA_CONCURRENCY`.
Smoke **8/8 OK** (tesis jurídicas de PUCP): `type=doctrine`, fuente canónica,
cita académica, área clasificada; el filtro descartó 80 no-jurídicas y el
warning de emisor privado es el comportamiento correcto.

## 4. Pendiente menor

Recon 2026-08-01 de lo que falta: **ALICIA** y **UNMSM Cybertesis** sirven su
SPA en las rutas OAI conocidas (falso 200 — buscar el endpoint real),
**CONCYTEC** y el **cendocbib del Congreso** no responden (timeout), las
revistas OJS de `revistas.pucp` siguen caídas (timeout desde el recon
original) y el **TC** no tiene repositorio OAI conocido. Derecho PUCP quedó
cubierta por otra vía: el set `0251-3420` de SciELO trae la revista completa.
El módulo ya soporta todo — completar es una entrada en `REPOS` con el
endpoint confirmado.
