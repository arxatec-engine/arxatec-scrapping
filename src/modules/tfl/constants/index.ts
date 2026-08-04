/**
 * TFL — Tribunal de Fiscalización Laboral de SUNAFIL (ver docs/plan-tfl.md).
 * Hermano del TSC (SERVIR) y del TFA (OEFA): mismo patrón gob.pe. Con término
 * "TFL" el stream de normas de SUNAFIL trae sus resoluciones con PDF en CDN:
 * las **Resoluciones de Sala Plena** (precedentes de observancia obligatoria,
 * lo más valioso) y las de recursos de revisión. Formatos del número por
 * época: "008-2023-SUNAFIL-TFL", "002-2021-SUNAFIL/TFL".
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "sunafil";
export const DEFAULT_TERM = "TFL";

/** El número siempre contiene SUNAFIL/TFL (separador variable por época). */
export const TFL_RE = /SUNAFIL[\s\/_:-]*TFL/i;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
