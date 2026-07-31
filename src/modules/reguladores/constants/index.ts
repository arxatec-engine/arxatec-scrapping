/**
 * Reguladores P4 vía gob.pe (ver docs/plan-reguladores.md): los cuatro
 * publican su normativa (resoluciones de consejo directivo, presidencia,
 * gerencia, tarifas, reglamentos) como normas en gob.pe con PDF en CDN.
 * UN módulo, CUATRO fuentes: cada documento sale con el `source` canónico y
 * el emisor de SU regulador; el ledger es compartido (los ids de gob.pe son
 * únicos globalmente).
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export interface Regulador {
  /** Slug de la institución en gob.pe. */
  institucion: string;
  /** Key del catálogo canónico de fuentes (src/services/sources). */
  sourceKey: string;
  /** Sigla para citas/keywords y para resolver el emisor en entity.json. */
  sigla: string;
  /** Nombre en entity.json (fallback si la sigla no resuelve). */
  entityName: string;
}

export const REGULADORES: readonly Regulador[] = [
  {
    institucion: "osinergmin",
    sourceKey: "osinergmin",
    sigla: "OSINERGMIN",
    entityName: "Organismo Supervisor de la Inversión en Energía y Minería",
  },
  {
    institucion: "osiptel",
    sourceKey: "osiptel",
    sigla: "OSIPTEL",
    entityName: "Organismo Supervisor de Inversión Privada en Telecomunicaciones",
  },
  {
    institucion: "sunass",
    sourceKey: "sunass",
    sigla: "SUNASS",
    entityName: "Superintendencia Nacional de Servicios de Saneamiento",
  },
  {
    institucion: "ositran",
    sourceKey: "ositran",
    sigla: "OSITRAN",
    entityName:
      "Organismo Supervisor de la Inversión en Infraestructura de Transporte de Uso Público",
  },
] as const;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
