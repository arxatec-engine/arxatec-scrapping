"""Configuración central del scraper SPIJ."""
import os

# --- Backends SPIJ ---
BASE_BACK = "https://spijwsii.minjus.gob.pe/spij-ext-back"
BASE_SOLR = "https://spijwsii.minjus.gob.pe/spij-ext-solr"

AUTH_BACK = f"{BASE_BACK}/authenticate"
AUTH_SOLR = f"{BASE_SOLR}/authenticate"
URL_BUSCAR = f"{BASE_SOLR}/api/buscar"
URL_WORD = f"{BASE_BACK}/api/procesarword"   # + /{id}  -> HTML del documento
URL_PDF = f"{BASE_BACK}/api/procesarpdf"     # + /{id}  -> 404 en acceso libre (no usado)

# Formato de salida por documento. El acceso libre solo expone el contenido como
# HTML (la web genera el PDF en el navegador), así que el PDF se renderiza local.
#   json -> SOLO metadata: clasifica y escribe documentos.json, sin descargar nada
#   pdf  -> renderiza HTML a PDF (requiere xhtml2pdf)
#   html -> guarda el HTML tal cual (sin dependencias extra, ideal para RAG)
#   both -> guarda ambos
FORMATO = os.environ.get("SPIJ_FORMATO", "json").lower()

# Credenciales del flujo público "ACCESO LIBRE" (hardcodeadas en la SPA Angular).
# El body real es {usuario, clave, tipo}; la respuesta trae el JWT en .value
# tipo=0 -> acceso libre (gratuito) | tipo=1 -> usuario suscrito
USUARIO = os.environ.get("SPIJ_USER", "spijext")
CLAVE = os.environ.get("SPIJ_CLAVE", "password")
TIPO_ACCESO = int(os.environ.get("SPIJ_TIPO_ACCESO", "0"))


def auth_body(solr: bool = False) -> dict:
    """Body de /authenticate. El backend Solr no envía 'tipo'."""
    body = {"usuario": USUARIO, "clave": CLAVE}
    if not solr:
        body["tipo"] = TIPO_ACCESO
    return body

# Headers que envía la SPA Angular. El backend puede rechazar (403) requests
# sin Origin/Referer/User-Agent de navegador, así que los replicamos.
DEFAULT_HEADERS = {
    "User-Agent": os.environ.get(
        "SPIJ_UA",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ),
    "Origin": "https://spij.minjus.gob.pe",
    "Referer": "https://spij.minjus.gob.pe/spij-ext-web/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-PE,es;q=0.9",
}

# --- Parámetros de scraping ---
PAGE_SIZE = int(os.environ.get("SPIJ_PAGE_SIZE", "100"))   # docs por página de /api/buscar
CONCURRENCY = int(os.environ.get("SPIJ_CONCURRENCY", "5"))  # descargas PDF en paralelo
MIN_DELAY = float(os.environ.get("SPIJ_DELAY", "0.5"))      # delay mínimo por endpoint (s)
MAX_RETRIES = 3
BACKOFF_BASE = 1.5                                          # backoff exponencial (s)
REQUEST_TIMEOUT = 60                                        # timeout por request (s)
PROGRESS_EVERY = 100                                        # log de progreso cada N docs

# Si TIPO_NORMA == "JR" se scrapea jurisprudencia; "NR" = normas reglamentarias.
TIPO_NORMA = os.environ.get("SPIJ_TIPO", "NR")
BUSCAR_HISTORICO = os.environ.get("SPIJ_HISTORICO", "false").lower() == "true"

# Filtros opcionales (vacío = todo). Ej: SPIJ_DISP="DECRETO SUPREMO"
DISPOSITIVO_LEGAL = [s for s in os.environ.get("SPIJ_DISP", "").split(",") if s.strip()]
FECHA_INICIO = os.environ.get("SPIJ_FECHA_INI") or None
FECHA_FIN = os.environ.get("SPIJ_FECHA_FIN") or None

# --- Rutas de salida ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
DOCS_JSON = os.path.join(BASE_DIR, "documentos.json")
CHECKPOINT_JSON = os.path.join(BASE_DIR, "checkpoint.json")
LOG_FILE = os.path.join(BASE_DIR, "scraper.log")

GROUPS_JSON = os.path.join(BASE_DIR, "groups.json")
SUBGROUPS_JSON = os.path.join(BASE_DIR, "subgroups.json")
ENTITY_JSON = os.path.join(BASE_DIR, "entity.json")


def buscar_body(desde: int, hasta: int) -> dict:
    """Construye el body de POST /api/buscar para una página dada."""
    return {
        "filtros": {
            "buscarHistorico": BUSCAR_HISTORICO,
            "busquedaSugerida": False,
            "numeroDispositivoLegal": " ",
            "dispositivoLegal": DISPOSITIVO_LEGAL,
            "tomo": {"id": "", "nombre": ""},
            "materia": {"id": "", "nombre": ""},
            "agrupacion": [],
            "sector": [],
            "subSector": {"id": "", "nombre": ""},
            "orden": "1",
        },
        "facetsSeleccionadas": {
            "fechaPublicacionGap": {"numero": 10, "unidad": "YEAR"}
        },
        "tipoNorma": TIPO_NORMA,
        "textoBusqueda": None,
        "textoSumilla": None,
        "fechaInicio": FECHA_INICIO,
        "fechaFin": FECHA_FIN,
        "desde": desde,
        "hasta": hasta,
    }
