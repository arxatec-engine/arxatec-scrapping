/**
 * Tribunal de Contrataciones (OSCE→OECE) vía gob.pe (ver docs/plan-tce.md):
 * el OECE publica en gob.pe ~85.7k normas, y entre ellas TODAS las
 * resoluciones del Tribunal de Contrataciones Públicas (TCP-S1…S6, frescas y
 * con PDF en CDN) — mejor que su colección "compendio" (13.4k). El módulo
 * filtra por el patrón del número (sufijo TCP/TCE + sala) con el cliente
 * compartido src/services/gobpe.
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "oece";

/** "07562-2026-TCP-S1" (actual) o variantes históricas TCE/TC + sala. */
export const TCE_RE = /\bTC[EP]?-?S\d+$/i;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
