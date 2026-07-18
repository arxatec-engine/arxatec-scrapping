// Backend REST público del buscador de jurisprudencia del TC (Laravel + Elastic).
// La SPA (jurisprudencia.sedetc.gob.pe, Nuxt) consume estas rutas sin token.
export const BASE_API = "https://jurisbackend.sedetc.gob.pe/api/visitor";

// Búsqueda cronológica: filtra por mes (fecha_publicacion=YYYY-MM) y reporta
// `total_agregados` (corpus completo). Es la única forma de recorrer >10k
// documentos: la búsqueda general topa en 10 000 por el límite de Elasticsearch.
export const URL_CRONOLOGICO = `${BASE_API}/sentencia/busqueda/cronologico`;

// Búsqueda avanzada: permite filtrar por numero_expediente (se usa para reanudar
// o reintentar un documento puntual desde el ledger).
export const URL_AVANZADA = `${BASE_API}/sentencia/busqueda/avanzada`;
