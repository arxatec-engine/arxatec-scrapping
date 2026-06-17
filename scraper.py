#!/usr/bin/env python3
"""
Scraper masivo del SPIJ (Sistema Peruano de Información Jurídica - MINJUS Perú).

Flujo:
  1. Carga groups/subgroups/entity y construye el clasificador.
  2. Autentica contra los dos backends (token + tokenSolr).
  3. Reanuda desde checkpoint.json si existe.
  4. Pagina /api/buscar, clasifica cada norma por su 'sector',
     descarga el PDF y lo guarda en output/{group}/{subgroup}/{entity}/.
  5. Registra cada documento en documentos.json (JSONL, append incremental).

Ejecutar:  python scraper.py
"""
import asyncio
import json
import logging
import os
import re
import sys
import time

import aiohttp

import config
from classifier import Classifier, normalize

# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout),
              logging.FileHandler(config.LOG_FILE, encoding="utf-8")],
)
log = logging.getLogger("spij")
# xhtml2pdf es muy verboso con CSS no soportado; lo silenciamos.
for _n in ("xhtml2pdf", "reportlab", "PIL", "fontTools"):
    logging.getLogger(_n).setLevel(logging.ERROR)


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def sanitize(name: str, max_len: int = 80) -> str:
    """Nombre de carpeta/archivo seguro."""
    if not name:
        return "SIN_NOMBRE"
    name = re.sub(r"<[^>]+>", " ", name)
    name = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", name)
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    name = name.replace(" ", "_")
    return (name[:max_len].rstrip("_") or "SIN_NOMBRE")


def strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


# Renderizador HTML->PDF (import perezoso; solo si se piden PDFs)
_pisa = None


def _get_pisa():
    global _pisa
    if _pisa is None:
        from xhtml2pdf import pisa  # noqa: WPS433
        _pisa = pisa
    return _pisa


def build_html(doc: dict, body_html: str) -> str:
    """Envuelve el contenido en un documento HTML válido con título y metadatos."""
    titulo = strip_html(doc.get("sumilla")) or doc.get("codigoNorma") or doc.get("id")
    meta = " &middot; ".join(filter(None, [
        doc.get("codigoNorma"), doc.get("dispositivoLegal"),
        doc.get("sector"), doc.get("fechaPublicacion"),
    ]))
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;}"
        ".spij-meta{color:#555;font-size:8pt;border-bottom:1px solid #ccc;"
        "padding-bottom:4px;margin-bottom:10px;}</style>"
        f"<title>{titulo}</title></head><body>"
        f"<div class='spij-meta'>{meta}</div>{body_html}</body></html>"
    )


def _clean_css(html: str) -> str:
    """Normaliza CSS que xhtml2pdf no entiende (p.ej. 'currentColor')."""
    html = re.sub(r"currentcolor", "#000000", html, flags=re.I)
    html = re.sub(r"\b(rgba?)\(([^)]*)\)", r"#000000", html)  # rgba a veces falla
    return html


def _strip_styles(html: str) -> str:
    """Quita todos los estilos/CSS: HTML plano que xhtml2pdf siempre acepta."""
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.I | re.S)
    html = re.sub(r'\sstyle="[^"]*"', "", html, flags=re.I)
    html = re.sub(r"\sstyle='[^']*'", "", html, flags=re.I)
    html = re.sub(r"\s(class|align|width|height|bgcolor)=\"[^\"]*\"", "", html, flags=re.I)
    return html


def _try_pdf(html: str):
    import io
    pisa = _get_pisa()
    buf = io.BytesIO()
    status = pisa.CreatePDF(src=html, dest=buf, encoding="utf-8")
    if status.err or buf.getbuffer().nbytes == 0:
        return None
    return buf.getvalue()


def render_pdf(html: str, path: str) -> int:
    """Renderiza HTML a PDF de forma garantizada: primero con el CSS saneado y,
    si falla, con el HTML sin estilos (más feo pero siempre genera el archivo).
    Solo escribe el archivo si el render fue exitoso (no deja PDFs a medias)."""
    data = _try_pdf(_clean_css(html)) or _try_pdf(_strip_styles(html))
    if not data:
        raise RuntimeError("xhtml2pdf no pudo generar el PDF ni sin estilos")
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def extract_token(payload) -> str:
    """El JWT viene en el campo .value; se aceptan otras variantes por robustez."""
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, dict):
        for k in ("value", "id_token", "token", "jwt", "access_token", "accessToken"):
            if payload.get(k):
                return str(payload[k]).strip()
    raise RuntimeError(f"No se pudo extraer token de: {payload!r}")


# --------------------------------------------------------------------------- #
# Throttle por endpoint (delay mínimo entre llamadas al mismo host/endpoint)
# --------------------------------------------------------------------------- #
class Throttle:
    def __init__(self, min_delay: float):
        self.min_delay = min_delay
        self._locks = {}
        self._last = {}

    async def wait(self, key: str):
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            now = time.monotonic()
            last = self._last.get(key, 0.0)
            delta = now - last
            if delta < self.min_delay:
                await asyncio.sleep(self.min_delay - delta)
            self._last[key] = time.monotonic()


# --------------------------------------------------------------------------- #
# Cliente SPIJ
# --------------------------------------------------------------------------- #
class SpijClient:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.token = None        # spij-ext-back
        self.token_solr = None   # spij-ext-solr
        self.throttle = Throttle(config.MIN_DELAY)
        self._auth_lock = asyncio.Lock()

    async def authenticate(self):
        async with self._auth_lock:
            self.token = await self._auth(config.AUTH_BACK, solr=False)
            self.token_solr = await self._auth(config.AUTH_SOLR, solr=True)
            log.info("Autenticado correctamente (token + tokenSolr).")

    async def _auth(self, url: str, solr: bool) -> str:
        body = config.auth_body(solr=solr)
        async with self.session.post(url, json=body,
                                     timeout=aiohttp.ClientTimeout(total=config.REQUEST_TIMEOUT)) as r:
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "")
            data = await (r.json() if "json" in ctype else r.text())
            try:
                return extract_token(data)
            except RuntimeError:
                # algunos backends devuelven el token como texto plano
                return extract_token(await r.text())

    async def _request(self, method, url, *, throttle_key, solr=False,
                       expect="json", **kwargs):
        """Request con throttle, reintentos exponenciales y re-auth en 401."""
        for attempt in range(1, config.MAX_RETRIES + 1):
            await self.throttle.wait(throttle_key)
            token = self.token_solr if solr else self.token
            headers = kwargs.pop("headers", {})
            headers["Authorization"] = f"Bearer {token}"
            try:
                async with self.session.request(
                    method, url, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=config.REQUEST_TIMEOUT),
                    **kwargs,
                ) as r:
                    if r.status == 401:
                        log.warning("401 en %s -> re-autenticando", url)
                        await self.authenticate()
                        raise aiohttp.ClientResponseError(
                            r.request_info, r.history, status=401)
                    if r.status == 429 or r.status >= 500:
                        raise aiohttp.ClientResponseError(
                            r.request_info, r.history, status=r.status)
                    r.raise_for_status()
                    if expect == "json":
                        return await r.json()
                    if expect == "bytes":
                        return await r.read()
                    return await r.text()
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                if attempt == config.MAX_RETRIES:
                    log.error("Falló %s tras %d intentos: %s", url, attempt, e)
                    raise
                backoff = config.BACKOFF_BASE ** attempt
                log.warning("Error %s (intento %d/%d), reintento en %.1fs: %s",
                            url, attempt, config.MAX_RETRIES, backoff, e)
                await asyncio.sleep(backoff)

    async def buscar(self, desde: int, hasta: int) -> dict:
        body = config.buscar_body(desde, hasta)
        return await self._request("POST", config.URL_BUSCAR,
                                   throttle_key="buscar", solr=True,
                                   json=body, expect="json")

    async def descargar_word(self, doc_id: str) -> str:
        """HTML del documento (endpoint que sí funciona en acceso libre)."""
        url = f"{config.URL_WORD}/{doc_id}"
        return await self._request("GET", url, throttle_key="word",
                                   solr=False, expect="text")


# --------------------------------------------------------------------------- #
# Persistencia
# --------------------------------------------------------------------------- #
def load_checkpoint() -> int:
    if os.path.exists(config.CHECKPOINT_JSON):
        try:
            with open(config.CHECKPOINT_JSON, encoding="utf-8") as f:
                return int(json.load(f).get("desde", 0))
        except Exception:
            return 0
    return 0


def save_checkpoint(desde: int, total: int):
    with open(config.CHECKPOINT_JSON, "w", encoding="utf-8") as f:
        json.dump({"desde": desde, "total": total,
                   "ts": time.strftime("%Y-%m-%d %H:%M:%S")}, f)


def load_processed_ids(require_downloaded: bool) -> set:
    """IDs ya completados (para no repetir al reanudar).

    En modo json basta con que el registro exista. En modos con descarga, solo
    se considera completo si se descargó con éxito; así un PDF que falló antes
    se vuelve a intentar en la reanudación (no se pierde ningún archivo).
    """
    ids = set()
    if os.path.exists(config.DOCS_JSON):
        with open(config.DOCS_JSON, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if require_downloaded and not rec.get("archivo", {}).get("descargado"):
                    continue
                ids.add(rec["id"])
    return ids


_docs_lock = asyncio.Lock()


async def append_doc(record: dict):
    """documentos.json en formato JSONL (un objeto JSON por línea = append seguro)."""
    async with _docs_lock:
        with open(config.DOCS_JSON, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _latest_records() -> dict:
    """Último registro por id (el JSONL puede tener reintentos del mismo id)."""
    latest = {}
    if os.path.exists(config.DOCS_JSON):
        with open(config.DOCS_JSON, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                latest[rec["id"]] = rec
    return latest


def _rec_to_doc(rec: dict) -> dict:
    """Reconstruye el 'doc' de búsqueda a partir de un registro guardado."""
    return {
        "id": rec["id"],
        "codigoNorma": rec.get("codigoNorma"),
        "dispositivoLegal": rec.get("dispositivoLegal"),
        "sector": rec.get("sector"),
        "fechaPublicacion": rec.get("fechaPublicacion"),
        "sumilla": rec.get("sumilla"),
        "ruta": rec.get("ruta_agrupacion"),
    }


def compact_docs():
    """Reescribe documentos.json dejando un solo registro (el último) por id."""
    latest = _latest_records()
    if not latest:
        return
    tmp = config.DOCS_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for rec in latest.values():
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    os.replace(tmp, config.DOCS_JSON)


async def retry_failed(client, clf, stats, sem, max_passes=4):
    """Reintenta cualquier documento sin descargar (descargado=false) hasta
    agotarlos o llegar a max_passes. Garantiza que no se pierda ningún archivo."""
    for n in range(1, max_passes + 1):
        pendientes = [r for r in _latest_records().values()
                      if not r.get("archivo", {}).get("descargado")]
        if not pendientes:
            log.info("No quedan documentos pendientes de descarga.")
            return
        log.info("Reintento %d/%d: %d documentos pendientes...", n, max_passes, len(pendientes))
        await asyncio.gather(*[
            process_doc(client, clf, _rec_to_doc(r), stats, sem) for r in pendientes
        ])
    restantes = [r for r in _latest_records().values()
                 if not r.get("archivo", {}).get("descargado")]
    if restantes:
        log.warning("%d documentos no se pudieron descargar tras %d reintentos.",
                    len(restantes), max_passes)


# --------------------------------------------------------------------------- #
# Procesamiento de un documento
# --------------------------------------------------------------------------- #
async def process_doc(client: SpijClient, clf: Classifier, doc: dict,
                      stats: dict, sem: asyncio.Semaphore):
    async with sem:
        doc_id = doc.get("id")
        if not doc_id:
            return
        sector = doc.get("sector") or ""
        clasif = clf.classify(sector)

        want_pdf = config.FORMATO in ("pdf", "both")
        want_html = config.FORMATO in ("html", "both")

        # Las rutas se calculan SIEMPRE (aunque en modo json no se descargue),
        # para que el registro lleve pdf_local_path / html_local_path tal cual.
        group_dir = sanitize(clasif["group_name"] or "SIN_GRUPO")
        subgroup_dir = sanitize(clasif["subgroup_name"] or "SIN_SUBGRUPO")
        entity_dir = sanitize(clasif["entity_name"] or sector or "SIN_ENTIDAD")
        folder = os.path.join(config.OUTPUT_DIR, group_dir, subgroup_dir, entity_dir)
        codigo = sanitize(doc.get("codigoNorma") or "SN", 60)
        base = os.path.join(folder, f"{doc_id}_{codigo}")
        pdf_path, html_path = base + ".pdf", base + ".html"

        descargado, pdf_size, html_size, err = False, 0, 0, None

        if want_pdf or want_html:
            os.makedirs(folder, exist_ok=True)

            def done(p):
                return os.path.exists(p) and os.path.getsize(p) > 0

            # Si ya existe lo necesario, no re-descargar (reanudación)
            if (not want_pdf or done(pdf_path)) and (not want_html or done(html_path)):
                descargado = True
                pdf_size = os.path.getsize(pdf_path) if want_pdf and done(pdf_path) else 0
                html_size = os.path.getsize(html_path) if want_html and done(html_path) else 0
            else:
                try:
                    body = await client.descargar_word(doc_id)
                    if not body or not body.strip():
                        raise RuntimeError("contenido vacío")
                    full = build_html(doc, body)
                    if want_html:
                        with open(html_path, "w", encoding="utf-8") as f:
                            f.write(full)
                        html_size = os.path.getsize(html_path)
                    if want_pdf:
                        pdf_size = render_pdf(full, pdf_path)
                    descargado = True
                except Exception as e:
                    err = str(e)
                    stats["errores"] += 1
                    log.warning("Documento %s falló: %s", doc_id, e)

        archivo = {
            "pdf_local_path": os.path.relpath(pdf_path, config.BASE_DIR),
            "html_local_path": os.path.relpath(html_path, config.BASE_DIR),
            "pdf_url": f"{config.URL_PDF}/{doc_id}",
            "fuente_url": f"{config.URL_WORD}/{doc_id}",
            "descargado": descargado,
            "tamaño_bytes": pdf_size or html_size,
            "error": err,
        }
        record = {
            "id": doc_id,
            "codigoNorma": doc.get("codigoNorma"),
            "dispositivoLegal": doc.get("dispositivoLegal"),
            "sector": sector,
            "fechaPublicacion": doc.get("fechaPublicacion"),
            "sumilla": strip_html(doc.get("sumilla")),
            "ruta_agrupacion": doc.get("ruta"),
            "clasificacion": clasif,
            "archivo": archivo,
        }
        await append_doc(record)

        stats["procesados"] += 1
        if descargado:
            stats["descargados"] += 1
        stats["conf"][clasif["match_confidence"]] = \
            stats["conf"].get(clasif["match_confidence"], 0) + 1
        if stats["procesados"] % config.PROGRESS_EVERY == 0:
            log.info("Progreso: %d procesados | %d descargados | %d errores | conf=%s",
                     stats["procesados"], stats["descargados"], stats["errores"], stats["conf"])


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
async def run():
    clf = Classifier(config.GROUPS_JSON, config.SUBGROUPS_JSON, config.ENTITY_JSON)
    log.info("Clasificador listo: %d entidades, %d subgrupos, %d grupos.",
             len(clf.entities), len(clf.subgroup_by_id), len(clf.group_by_id))

    if config.FORMATO != "json":
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    processed_ids = load_processed_ids(require_downloaded=config.FORMATO != "json")
    if processed_ids:
        log.info("Reanudando: %d documentos ya registrados.", len(processed_ids))

    desde = load_checkpoint()
    stats = {"procesados": 0, "descargados": 0, "errores": 0, "conf": {}}

    connector = aiohttp.TCPConnector(limit=config.CONCURRENCY * 2, ssl=False)
    async with aiohttp.ClientSession(connector=connector,
                                     headers=config.DEFAULT_HEADERS) as session:
        client = SpijClient(session)
        await client.authenticate()

        async def fetch_page(d):
            """Búsqueda de una página con reintentos largos + re-auth.
            No se rinde ante fallos transitorios; así una corrida larga no muere."""
            delay = config.BACKOFF_BASE
            for intento in range(1, 51):
                try:
                    return await client.buscar(d, d + config.PAGE_SIZE)
                except Exception as e:
                    log.warning("Página desde=%d falló (intento %d): %s", d, intento, e)
                    await asyncio.sleep(min(delay, 60))
                    delay *= 1.5
                    try:
                        await client.authenticate()
                    except Exception:
                        pass
            raise RuntimeError(f"No se pudo obtener la página desde={d} tras 50 intentos")

        # Primera página para conocer el total
        page = await fetch_page(desde)
        total = int(page.get("totalEncontrados", "0"))
        restantes = max(0, total - len(processed_ids))
        log.info("Total de documentos: %d | ya completados: %d | restantes aprox.: %d",
                 total, len(processed_ids), restantes)
        log.info("Formato de salida: %s (reanudando desde desde=%d)", config.FORMATO, desde)

        sem = asyncio.Semaphore(config.CONCURRENCY)
        while desde < total:
            resultados = page.get("resultados", []) if page else []
            if not resultados:
                log.info("Sin resultados en desde=%d; fin de paginación.", desde)
                break

            nuevos = [d for d in resultados if d.get("id") not in processed_ids]
            tasks = [process_doc(client, clf, d, stats, sem) for d in nuevos]
            for d in nuevos:
                processed_ids.add(d.get("id"))
            if tasks:
                await asyncio.gather(*tasks)

            desde += config.PAGE_SIZE
            save_checkpoint(desde, total)

            if desde < total:
                page = await fetch_page(desde)

        # Reintento de descargas fallidas y compactación final
        if config.FORMATO != "json":
            await retry_failed(client, clf, stats, sem)

    compact_docs()
    pendientes = sum(1 for r in _latest_records().values()
                     if config.FORMATO != "json"
                     and not r.get("archivo", {}).get("descargado"))

    log.info("=" * 60)
    log.info("RESUMEN FINAL")
    log.info("  Documentos procesados (esta corrida): %d", stats["procesados"])
    log.info("  Archivos descargados: %d", stats["descargados"])
    log.info("  Errores de descarga: %d", stats["errores"])
    log.info("  Distribución de confianza de clasificación: %s", stats["conf"])
    registrados = len(_latest_records())
    log.info("  Total registrado en documentos.json: %d", registrados)
    if config.FORMATO != "json":
        log.info("  Documentos sin descargar (pendientes): %d", pendientes)
    log.info("=" * 60)

    # Mensaje claro de estado: completo / nada nuevo / faltan
    completo = desde >= total and registrados >= total and pendientes == 0
    if completo and stats["procesados"] == 0:
        log.info("✓ NADA NUEVO: el scraping ya estaba completo. Puedes apagar tranquilo.")
    elif completo:
        log.info("✓ SCRAPING COMPLETO: los %d documentos están listos.", total)
    else:
        faltan = max(0, total - registrados)
        log.info("⏸ PAUSADO/INCOMPLETO: faltan ~%d documentos. Vuelve a ejecutar el "
                 "MISMO comando para continuar donde quedó.", faltan)


def main():
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        log.warning("Interrumpido por el usuario. El checkpoint permite reanudar.")
        sys.exit(130)


if __name__ == "__main__":
    main()
