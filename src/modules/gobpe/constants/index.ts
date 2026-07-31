/**
 * gob.pe — stream GENERAL de normas de la Plataforma del Estado (5.1M
 * reportadas; ver docs/plan-gobpe.md). Reglas duras del diseño:
 *
 *  - El stream global SOLO devuelve normas con VENTANA de fechas (sin ella
 *    salen colecciones) y la paginación topa en ~400 hojas → se recorre por
 *    ventanas de un día, reciente-primero.
 *  - CONVIVENCIA: los emisores con módulo dedicado conservan su fuente — se
 *    excluyen por slug los streams ya cubiertos completos y, además, todo gid
 *    presente en los ledgers de los módulos gob.pe existentes (doble defensa:
 *    re-ingestar aquí los sobreescribiría con la fuente genérica).
 *  - ÁMBITO nacional por defecto: emisores de Gobiernos Regionales/Locales se
 *    saltan (la pregunta de Harry queda como grifo, no como bloqueo).
 */
export { GOBPE_BASE } from "../../../services/gobpe";

/** Tope real de paginación del buscador (verificado: 400 ok, 1000 error). */
export const SHEET_CAP = 400;

/** Streams completos ya cubiertos por un módulo dedicado (skip por slug). */
export const EXCLUIR_SLUGS_DEFAULT = [
  "indecopi",
  "osinergmin",
  "osiptel",
  "sunass",
  "ositran",
];

/** Ledgers de los módulos gob.pe existentes (skip por gid: cobertura parcial). */
export const LEDGERS_MODULOS_DEDICADOS = [
  "tfiscal_ingest",
  "indecopi_ingest",
  "tce_ingest",
  "sunarp_ingest",
  "servir_ingest",
  "oefa_ingest",
  "osinergmin_ingest",
  "osiptel_ingest",
  "sunass_ingest",
  "ositran_ingest",
];

/** Grupos del catálogo que quedan fuera con GOBPE_AMBITO=nacional. */
export const GRUPOS_SUBNACIONALES = ["Gobiernos Regionales", "Gobiernos Locales"];

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
