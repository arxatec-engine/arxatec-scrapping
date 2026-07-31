import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { stripHtml } from "../../../../utils/text";
import { BASE_URL, ITEM_RE, OFICIOS_PATH } from "../../constants";
import type { Ctx, Doc } from "../../types";

/**
 * El árbol de SUNAT es HTML estático de los 90 en LATIN-1: se descarga como
 * bytes y se decodifica a mano (decodificarlo como UTF-8 rompería tildes).
 * El sitio pasó días caído — reintentos con backoff como el resto.
 */
async function fetchBytes(ctx: Ctx, url: string): Promise<Uint8Array> {
  const { cfg, log } = ctx;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    await throttleWait(ctx.sunatThrottle, "sunat");
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": cfg.userAgent, "Accept-Language": "es-PE,es;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
      });
      if (res.status === 404) throw new Error(`HTTP 404 en ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      const permanent = e instanceof Error && /HTTP 404/.test(e.message);
      if (permanent || attempt === cfg.maxRetries) break;
      const backoff = Math.min(cfg.backoffBase ** attempt, 20);
      log.warn(
        "GET %s falló (intento %d/%d), reintento en %ss: %s",
        url,
        attempt,
        cfg.maxRetries,
        backoff.toFixed(1),
        e instanceof Error ? e.message : e
      );
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchTexto(ctx: Ctx, url: string): Promise<string> {
  const bytes = await fetchBytes(ctx, url);
  // Años modernos sirven UTF-8; los viejos, latin-1. Se intenta UTF-8 estricto
  // y ante bytes inválidos se cae a latin-1 (decodificar al revés produce "Â°").
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("latin1");
  }
}

export function fetchPdf(ctx: Ctx, url: string): Promise<Uint8Array> {
  return fetchBytes(ctx, url);
}

function absoluta(anio: number, href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}${OFICIOS_PATH}/${anio}/${href}`;
}

/**
 * Índice anual `oficios/{año}/indcor.htm` → items. Cada fila enlaza el
 * documento ("Informe N° 0000131-2025-SUNAT/7T0000" → .pdf moderno o .htm
 * viejo); la sumilla es el texto de la fila sin la etiqueta del enlace.
 * Un año inexistente (404) devuelve [] — el barrido simplemente sigue.
 */
export async function fetchIndiceAnual(ctx: Ctx, anio: number): Promise<Doc[]> {
  const url = `${BASE_URL}${OFICIOS_PATH}/${anio}/indcor.htm`;
  let html: string;
  try {
    html = await fetchTexto(ctx, url);
  } catch (e) {
    if (e instanceof Error && /HTTP 404/.test(e.message)) return [];
    throw e;
  }

  const docs: Doc[] = [];
  const filas = html.split(/<tr[\s>]/i);
  for (const fila of filas) {
    const a = /<a[^>]+href="([^"]+\.(?:pdf|htm))"[^>]*>([\s\S]*?)<\/a>/i.exec(fila);
    if (!a) continue;
    const etiqueta = stripHtml(a[2]).replace(/\s+/g, " ").trim();
    if (!ITEM_RE.test(etiqueta)) continue;
    const href = absoluta(anio, a[1]);
    const file = a[1].split("/").pop() ?? a[1];
    const id = file.replace(/\.(pdf|htm)$/i, "");
    const tipoDoc = etiqueta.split(/\s+/)[0];
    const numero = etiqueta
      .replace(ITEM_RE, "")
      .replace(/^[\s.:°ºNn-]+/u, "")
      .trim();
    const sumilla = stripHtml(fila.replace(a[0], " "))
      .replace(/\s+/g, " ")
      .trim();
    docs.push({
      id,
      tipoDoc: tipoDoc[0].toUpperCase() + tipoDoc.slice(1).toLowerCase(),
      numero: numero || etiqueta,
      sumilla,
      anio,
      href,
      esPdf: /\.pdf$/i.test(a[1]),
    });
  }
  return docs;
}
