/**
 * SPLEY — proyectos de ley del Congreso (ver docs/plan-spley.md). API JSON del
 * portal (SPA Angular): `api.congreso.gob.pe/spley-portal-service`.
 *  - `POST /proyecto-ley/lista-con-filtro` {perParId, rowStart, pageSize} →
 *    lista con número/título/estado/fecha/proponente/autores.
 *  - `GET /expediente/{enc(perParId)}/{enc(pleyNum)}` → detalle con SUMILLA
 *    (la propuesta completa) + fases. Los params van CIFRADOS (AES-128-ECB,
 *    ver services/spley/crypto).
 *
 * `status = "En revisión"`: un proyecto NO es norma vigente — encaja con el
 * valor del filtro de la plataforma y nunca se confunde con leyes en vigor.
 */
export const API_BASE = "https://api.congreso.gob.pe/spley-portal-service";
export const ORIGIN = "https://wb2server.congreso.gob.pe";

/** Clave AES del portal (extraída del bundle; pública en el JS del cliente). */
export const ENCRYPTION_KEY = "ProdALg5ZrAsxBMD";

export const PAGE_SIZE = 50;
export const STATUS_PROYECTO = "En revisión";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const REQUEST_TIMEOUT = 30;
export const MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
