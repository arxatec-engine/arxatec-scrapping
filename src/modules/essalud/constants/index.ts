/**
 * ESSALUD — normativa del Seguro Social de Salud vía gob.pe (ver
 * docs/plan-essalud.md). A diferencia de los módulos de tribunal, aquí NO se
 * filtra por sigla: se ingesta el stream completo de normas de la entidad.
 *
 * ⚠ AVISO DE CALIDAD medido en el recon (2026-08-03): entre un 40% y un 70%
 * del stream son ACTOS ADMINISTRATIVOS INTERNOS (aceptar renuncias, designar
 * funcionarios, aceptar donaciones, autorizar devoluciones), no normas de
 * seguridad social. Entran igual por la regla del repo (volumen primero,
 * limpieza de biblioteca después) y son trazables por `source`; si producto
 * decide filtrarlos, el corte iría aquí.
 */
export { GOBPE_BASE } from "../../../services/gobpe";

export const INSTITUCION = "essalud";
/** Sin término: se barre el stream completo de la entidad. */
export const DEFAULT_TERM = "";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const SEARCH_MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
