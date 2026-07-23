export const MAX_RETRIES = 3;
export const BACKOFF_BASE = 1.5;
export const REQUEST_TIMEOUT = 60; // segundos
export const PROGRESS_EVERY = 50;

// Profundidad máxima del BFS del árbol (salvaguarda anti-bucle; el árbol real
// del PJ tiene 2–4 niveles).
export const MAX_TREE_DEPTH = 8;

// Tope de páginas de paginación por hoja (salvaguarda; "Página N de M").
export const MAX_LEAF_PAGES = 500;
