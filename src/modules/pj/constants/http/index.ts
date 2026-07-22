// UA de navegador real: el portal del PJ tiene un bot manager (Radware, cookies
// __uzm*) que hoy es permisivo pero rechaza clientes obviamente automatizados.
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const BASE_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "es-PE,es;q=0.9",
};
