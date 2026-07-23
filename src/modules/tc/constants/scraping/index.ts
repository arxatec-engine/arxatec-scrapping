export const MAX_RETRIES = 3;
export const BACKOFF_BASE = 1.5;
export const REQUEST_TIMEOUT = 60;
export const PROGRESS_EVERY = 100;
export const PAGE_MAX_RETRIES = 50;

// El backend siempre pagina de 10 en 10 (ignora size/per_page).
export const PAGE_SIZE = 10;

// Primer mes con datos en el índice (las sentencias más antiguas son de 1996,
// publicadas desde 1997). Se recorre mes a mes hasta el mes actual.
export const DEFAULT_START_MONTH = "1996-01";

// Emisor: toda la jurisprudencia de esta fuente proviene del TC. El id de
// entidad se resuelve contra public/data/entity.json por este nombre exacto.
export const ISSUER_NAME = "Tribunal Constitucional";
