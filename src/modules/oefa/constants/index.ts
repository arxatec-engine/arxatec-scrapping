/**
 * OEFA — Tribunal de Fiscalización Ambiental vía gob.pe (ver docs/plan-oefa.md):
 * las resoluciones del TFA NO están en el stream de normas (ahí solo hay
 * CD/PCD/OAD institucionales) sino como PUBLICACIONES (items `Report` de
 * informes-publicaciones), con el mismo PDF en CDN. El título es el número:
 * "Resolución Nº001-2011-OEFA/TFA".
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "oefa";
export const DEFAULT_TERM = "TFA";

/** El número siempre contiene OEFA/TFA. */
export const TFA_RE = /OEFA\s*\/\s*TFA/i;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
