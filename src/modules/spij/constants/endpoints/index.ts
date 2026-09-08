export const BASE_BACK = "https://spijwsii.minjus.gob.pe/spij-ext-back";
export const BASE_SOLR = "https://spijwsii.minjus.gob.pe/spij-ext-solr";

/**
 * Página pública de la norma en el portal del SPIJ — la que va en `source_url`.
 *
 * Es lo que el abogado abre para comprobar que el documento viene del MINJUS.
 * Antes se guardaba `${BASE_BACK}/api/procesarword/<id>`, que es el endpoint
 * INTERNO: exige `Authorization: Bearer` y responde 401 a quien lo abra.
 *
 * Verificado el 2026-09-01 contra el bundle del portal
 * (`main.<hash>.js`): la ruta declarada es `detallenorma/:id`, el router va con
 * `useHash:!0` (de ahí el `#/`), y el propio portal genera el QR de compartir
 * con esta misma URL. El `<id>` es el mismo que devuelve el buscador.
 */
export const PORTAL_NORMA = "https://spij.minjus.gob.pe/spij-ext-web/#/detallenorma";
