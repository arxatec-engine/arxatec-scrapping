import { sleep } from "../../../../utils/time";
import { BUSQUEDAS_BASE, cuadernilloUrl, VISOR_TIMEOUT } from "../../constants";
import type { Config, Logger } from "../../types";

/**
 * El "Cuadernillo de Normas Legales" es el boletín OFICIAL de El Peruano de un
 * día: un único PDF con toda la normativa publicada esa fecha. Es la vía de
 * ACTUALIZACIÓN diaria (el dataset de datosabiertos que usa el índice principal
 * publica con ~meses de rezago). La página `/cuadernillo/NL/{YYYYMMDD}` trae el
 * token del archivo; el PDF se baja de la ruta `/api/archivo/file/{token}/…`.
 *
 * El sitio es intermitente (igual que el visor): timeout corto + reintentos.
 */

export interface CuadernilloDia {
  /** YYYYMMDD. */
  fecha: string;
  pdfUrl: string;
  nombre: string;
}

async function fetchText(cfg: Config, url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": cfg.userAgent,
          Accept: "text/html,*/*;q=0.8",
          "Accept-Language": "es-PE,es;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(VISOR_TIMEOUT * 1000),
      });
      if (res.status === 404) return null;
      if (res.ok) return await res.text();
    } catch {
      // intermitente: reintentar
    }
    if (attempt < cfg.maxRetries) await sleep(Math.min(cfg.backoffBase ** attempt, 20));
  }
  return null;
}

/**
 * Resuelve el PDF del cuadernillo de una fecha (o null si ese día no hay
 * edición — domingos/feriados el diario no siempre publica normas legales).
 */
export async function resolveCuadernillo(
  cfg: Config,
  log: Logger,
  yyyymmdd: string
): Promise<CuadernilloDia | null> {
  const html = await fetchText(cfg, cuadernilloUrl(yyyymmdd));
  if (!html) return null;
  const m = /\/api\/archivo\/file\/([^"'/]+)\/\*\/([^"']+\.pdf)/i.exec(html);
  if (!m) {
    log.warn("Cuadernillo %s: sin token de archivo (¿día sin edición?).", yyyymmdd);
    return null;
  }
  return {
    fecha: yyyymmdd,
    pdfUrl: `${BUSQUEDAS_BASE}/api/archivo/file/${m[1]}/*/${m[2]}`,
    nombre: m[2],
  };
}

/** Descarga el PDF del cuadernillo (bytes) con reintentos. */
export async function downloadCuadernilloPdf(
  cfg: Config,
  dia: CuadernilloDia
): Promise<Uint8Array> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      const res = await fetch(dia.pdfUrl, {
        headers: {
          "User-Agent": cfg.userAgent,
          Referer: cuadernilloUrl(dia.fecha),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(90 * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 1024) throw new Error(`PDF corto (${bytes.length}b)`);
      return bytes;
    } catch (e) {
      lastErr = e;
      if (attempt < cfg.maxRetries) await sleep(Math.min(cfg.backoffBase ** attempt, 20));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
