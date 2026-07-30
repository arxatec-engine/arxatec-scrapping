/**
 * SUNARP — Tribunal Registral vía gob.pe (ver docs/plan-sunarp.md): el sitio
 * propio de SUNARP redirige a gob.pe y el SIP (precedentes) está caído; las
 * resoluciones del Tribunal Registral y los acuerdos de Pleno se publican en
 * el stream de normas de gob.pe (institución sunarp, ~70k, mezcladas con
 * resoluciones de zonas registrales/gerencias). El módulo busca con término y
 * filtra por el patrón del número: `…-SUNARP-TR[-sede]` (casos) y
 * `…-SUNARP/PT` (plenos/precedentes).
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "sunarp";
export const DEFAULT_TERM = "tribunal registral";

/** "2006-2020-SUNARP-TR", "123-2025-SUNARP-TR-L", "107-2025-SUNARP/PT". */
export const TR_RE = /SUNARP[-/](TR(-[A-Z])?|PT)$/i;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
