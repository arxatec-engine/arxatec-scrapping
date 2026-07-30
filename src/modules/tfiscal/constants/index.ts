/**
 * Tribunal Fiscal (MEF) vía gob.pe (ver docs/plan-tribunal-fiscal.md):
 * el portal del MEF está detrás de Incapsula (bot manager hostil), pero las
 * RTF de interés/observancia están PUBLICADAS en gob.pe como normas del MEF,
 * y el buscador JSON del portal del Estado (el mismo del módulo `entidades`)
 * las sirve con TODO incluido: número limpio, sumilla, fecha y PDF en CDN.
 */
export const BUSQUEDAS_URL = "https://www.gob.pe/busquedas.json";
export const GOBPE_BASE = "https://www.gob.pe";

export const DEFAULT_TERM = "tribunal fiscal";
export const PAGE_SIZE = 25;

/** Nº de RTF: `01380-1-2006` (sala numérica) o `02077-Q-2014` (quejas). */
export const RTF_RE = /^\d{3,6}-(\d{1,2}|[A-Za-z])-\d{4}$/;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

// gob.pe es estable pero throttlea crawls intensos: ritmo educado (mismo que
// el módulo entidades) y reintentos con backoff.
export const SEARCH_TIMEOUT = 30;
export const SEARCH_MAX_RETRIES = 4;
export const PDF_TIMEOUT = 90;
export const PDF_MAX_RETRIES = 3;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
