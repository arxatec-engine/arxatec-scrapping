/**
 * SUNAT — informes y oficios vinculantes (ver docs/plan-sunat.md): el árbol
 * estático `www.sunat.gob.pe/legislacion/oficios/{año}/indcor.htm` publica
 * desde 1997 HASTA HOY (los años nuevos existen aunque el índice-frameset
 * viejo solo liste hasta 2010). Ítems modernos = PDF directo
 * (`informe-oficios/i000131-2025-7T0000.pdf`); años viejos = página .htm
 * (se renderiza a PDF con Puppeteer, patrón SPIJ). Encoding latin-1.
 *
 * El sitio pasó días caído (bloqueada la fila el 2026-07-30); revivió el
 * 2026-07-31. Las resoluciones de superintendencia (superin/) se OMITEN a
 * propósito: ya fluyen por El Peruano/SPIJ.
 */
export const BASE_URL = "https://www.sunat.gob.pe";
export const OFICIOS_PATH = "/legislacion/oficios";

export const PRIMER_ANIO = 1997;

/** "Informe N° 0000131-2025-SUNAT/7T0000" / Oficio / Carta. */
export const ITEM_RE = /^(Informe|Oficio|Carta)\b/i;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const REQUEST_TIMEOUT = 20;
export const MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
