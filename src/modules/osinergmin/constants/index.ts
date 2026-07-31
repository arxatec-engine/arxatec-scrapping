/**
 * OSINERGMIN vía gob.pe (ver docs/plan-reguladores.md): el regulador publica su
 * normativa (~28.9k normas — consejo directivo, presidencia, gerencia,
 * tarifas, reglamentos) en gob.pe con PDF en CDN; barrido completo sin
 * término ni filtro con el cliente compartido src/services/gobpe. Su tribunal
 * de reclamos de usuarios queda FUERA a propósito (reclamos individuales con
 * datos personales y bajo valor jurídico).
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "osinergmin";
export const SIGLA = "OSINERGMIN";
export const ENTITY_NAME =
  "Organismo Supervisor de la Inversión en Energía y Minería";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
