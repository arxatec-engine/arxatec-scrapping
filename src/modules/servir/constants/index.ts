/**
 * SERVIR — Tribunal del Servicio Civil vía gob.pe (ver docs/plan-servir.md):
 * las resoluciones de las dos salas del TSC (y los precedentes) se publican
 * como normas de SERVIR en gob.pe; con término "TSC" el stream las trae con
 * PDF en CDN. Los formatos del número varían por época:
 * "005982-2024-Servir/TSC:Primera Sala", "03726-2023-SERVIR-TSC-Primera_Sala".
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "servir";
export const DEFAULT_TERM = "TSC";

/** El número siempre contiene SERVIR/TSC (separador variable por época). */
export const TSC_RE = /SERVIR[\s\/_:-]*TSC/i;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
