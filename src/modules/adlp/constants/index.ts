/**
 * ADLP — Archivo Digital de la Legislación del Perú, del Congreso (ver
 * docs/plan-adlp.md). ASP.NET WebForms clásico:
 *
 * - ÍNDICE: el buscador `LeyNumePP.aspx?xNorma=0` (LEY / RESOLUCIÓN
 *   LEGISLATIVA / DECRETO LEY) se consulta con POST + ViewState por RANGO de
 *   números. ⚠ El grid TRUNCA EN SILENCIO a 20 filas y no pinta paginador →
 *   la ventana de consulta jamás supera 20 números.
 * - LA JOYA: el filtro "Normas vigentes"/"Normas no vigentes" del buscador da
 *   la VIGENCIA por norma → status determinista `Vigente`/`Derogado` (primera
 *   fuente gratuita con estado real; estrena "Derogado" en el filtro de la
 *   plataforma).
 * - TEXTO: PDF directo `Documentos/Leyes/{numero}.pdf`. Cobertura medida
 *   2026-08-01: ~Ley 10000 (1944) → ~Ley 30480 (2016); lo posterior fluye por
 *   El Peruano/SPLEY y lo anterior queda para una fase 2 (LeyNoNumeP).
 * - INFRA: el HTTPS del sitio es INTERMITENTE (responde al toque o cuelga) →
 *   timeout corto + más reintentos, patrón elperuano.
 */
export const BASE_URL = "https://www.leyes.congreso.gob.pe";
export const LISTA_URL = `${BASE_URL}/LeyNumePP.aspx?xNorma=0`;
export const PDF_PATH = "/Documentos/Leyes";

/** Tamaño de ventana de números por consulta (= tope silencioso del grid). */
export const VENTANA = 20;

/** Cobertura medida del archivo de PDFs (binaria sobre Documentos/Leyes/). */
export const PRIMERA_LEY_PDF = 10000;
export const ULTIMA_LEY_PDF = 30480;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const REQUEST_TIMEOUT = 20;
export const MAX_RETRIES = 6;
export const BACKOFF_BASE = 1.6;
export const PROGRESS_EVERY = 10;
