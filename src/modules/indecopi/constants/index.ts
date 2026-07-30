/**
 * INDECOPI vía gob.pe (ver docs/plan-indecopi.md): indecopi.gob.pe no responde
 * y su buscador de resoluciones (servicio.indecopi.gob.pe/buscadorResoluciones)
 * es un JBoss Seam/JSF con estado — scrapeable pero frágil (fase 2, las salas
 * del Tribunal). La v1 toma las ~3k resoluciones y normas que INDECOPI publica
 * en gob.pe: born-digital, frescas (2026) y con PDF en CDN, vía el cliente
 * compartido src/services/gobpe.
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "indecopi";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
