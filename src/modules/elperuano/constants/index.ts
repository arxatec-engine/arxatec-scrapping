/**
 * El Peruano en dos mitades (ver docs/plan-el-peruano.md):
 *  - el ÍNDICE no se scrapea: es el dataset "Dispositivos Legales" de
 *    datosabiertos.gob.pe (CSV mensual con OP/Entidad/Dispositivo/Número/
 *    Sumilla/Link), publicado por el propio diario;
 *  - el TEXTO por documento sale de `api/visor_html/{OP}` de
 *    busquedas.elperuano.pe (HTML limpio, sin OCR).
 */
export const DATASET_URL =
  "https://www.datosabiertos.gob.pe/dataset/dispositivos-legales";
export const DATOSABIERTOS_BASE = "https://www.datosabiertos.gob.pe";
export const BUSQUEDAS_BASE = "https://busquedas.elperuano.pe";

export function visorUrl(op: string): string {
  return `${BUSQUEDAS_BASE}/api/visor_html/${op}`;
}

/** Página humana del dispositivo: `source_url` estable y única por documento. */
export function dispositivoUrl(op: string): string {
  return `${BUSQUEDAS_BASE}/dispositivo/NL/${op}`;
}

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

// busquedas.elperuano.pe es INTERMITENTE (verificado 2026-07-30): responde en
// 0.1-0.2s o cuelga >60s, también con Chrome real — infraestructura degradada,
// no bot manager. Táctica: timeout CORTO y varios reintentos para cazar el
// nodo bueno, en vez de esperar al malo.
export const VISOR_TIMEOUT = 15;
export const VISOR_MAX_RETRIES = 6;
// datosabiertos.gob.pe es estable: timeouts normales.
export const CSV_TIMEOUT = 90;
export const CSV_MAX_RETRIES = 3;

export const BACKOFF_BASE = 1.6;
export const PROGRESS_EVERY = 10;

/** Un cuerpo del visor menor a esto es el "200 vacío" espurio del sitio. */
export const MIN_VISOR_BYTES = 500;
