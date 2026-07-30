import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { stripHtml } from "../../../../utils/text";
import {
  BUSQUEDAS_URL,
  PDF_MAX_RETRIES,
  PDF_TIMEOUT,
  RTF_RE,
  SEARCH_TIMEOUT,
} from "../../constants";
import { fechaLargaIso } from "../../utils/parse";
import type { Ctx, Doc } from "../../types";

interface SearchResult {
  searchable_type?: string;
  name_with_parent?: string | null;
  content?: string | null;
  publication?: string | null;
  action_url?: string | null;
  url?: string | null;
}

interface SearchResponse {
  data?: {
    attributes?: {
      results?: SearchResult[];
    };
  };
}

function hrefFrom(anchorHtml: string | null | undefined): string | null {
  const m = /href="([^"]+)"/.exec(anchorHtml ?? "");
  return m ? m[1] : null;
}

/**
 * Una página del buscador de gob.pe filtrada a RTF: item `Rule` del MEF cuyo
 * `name_with_parent` es un número de RTF válido (el término de búsqueda
 * también trae decretos y páginas que hablan del Tribunal — se descartan).
 * `rawCount` permite detectar el final de la paginación aunque una página
 * entera se filtre.
 */
export async function fetchSearchPage(
  ctx: Ctx,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const { cfg, log } = ctx;
  const url =
    `${BUSQUEDAS_URL}?contenido[]=normas&institucion[]=mef` +
    `&term=${encodeURIComponent(cfg.term)}&orden=recientes&sheet=${sheet}`;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    await throttleWait(ctx.gobpeThrottle, "gobpe");
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": cfg.userAgent,
          Accept: "application/json",
          "Accept-Language": "es-PE,es;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(SEARCH_TIMEOUT * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const body = (await res.json()) as SearchResponse;
      const results = body.data?.attributes?.results ?? [];
      const docs: Doc[] = [];
      for (const r of results) {
        if (r.searchable_type !== "Rule") continue;
        const rtf = (r.name_with_parent ?? "").trim();
        const path = hrefFrom(r.url);
        const pdfUrl = (r.action_url ?? "").trim();
        if (!RTF_RE.test(rtf) || !path || !pdfUrl) continue;
        const gidMatch = /\/normas-legales\/(\d+)-/.exec(path);
        if (!gidMatch) continue;
        docs.push({
          gid: gidMatch[1],
          rtf,
          sumilla: stripHtml(r.content ?? "").trim(),
          publishedAt: fechaLargaIso(r.publication),
          pdfUrl,
          path,
        });
      }
      return { docs, rawCount: results.length };
    } catch (e) {
      lastErr = e;
      if (attempt < cfg.maxRetries) {
        const backoff = Math.min(cfg.backoffBase ** attempt, 30);
        log.warn(
          "Buscador sheet=%d falló (intento %d/%d), reintento en %ss: %s",
          sheet,
          attempt,
          cfg.maxRetries,
          backoff.toFixed(1),
          e instanceof Error ? e.message : e
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** PDF original desde el CDN de gob.pe (estable; sin render local). */
export async function downloadPdf(ctx: Ctx, url: string): Promise<Uint8Array> {
  const { cfg, log } = ctx;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= PDF_MAX_RETRIES; attempt++) {
    await throttleWait(ctx.gobpeThrottle, "gobpe");
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": cfg.userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(PDF_TIMEOUT * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 512) throw new Error(`PDF sospechosamente corto (${bytes.length}b)`);
      return bytes;
    } catch (e) {
      lastErr = e;
      if (attempt < PDF_MAX_RETRIES) {
        log.warn("PDF %s falló (intento %d/%d): %s", url, attempt, PDF_MAX_RETRIES, e);
        await sleep(2 * attempt);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
