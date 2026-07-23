// UA de navegador real: el portal del PJ tiene un bot manager (Radware, cookies
// __uzm*) que hoy es permisivo pero rechaza clientes obviamente automatizados.
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Headers de una navegación real de Chrome a una página HTML. Verificado que
// undici (fetch) los reenvía todos (no aplica la lista de "forbidden headers"
// del navegador, a diferencia del fetch del browser). Hacen la request
// indistinguible de una navegación real y reducen los challenges del bot manager
// por fingerprint. NO ayudan contra el throttle por IP/volumen (ese es de red).
// Ver docs/anti-bloqueo-scraping.md.
export const BASE_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
};
