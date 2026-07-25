import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { BASE_HEADERS } from "../../constants";
import type { Ctx } from "../../types";

// El portal del PJ tiene un bot manager (Radware) que fingerprintea el cliente
// HTTP: cuelga las peticiones de axios pero deja pasar `fetch` (undici, el que
// trae Node). Por eso este módulo usa `fetch` y NO el axios del util compartido
// (SPIJ pega a otro sitio sin ese bot manager, así que allí axios va bien).

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(jar: Map<string, string>, res: Response): void {
  const getSetCookie = (res.headers as { getSetCookie?: () => string[] })
    .getSetCookie;
  const list = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
  for (const sc of list) {
    const [pair] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

function absolute(baseUrl: string, target: string): string {
  return target.startsWith("http") ? target : baseUrl + target;
}

/**
 * GET de una página del portal WCM con `fetch`. Mantiene el cookie jar del bot
 * manager (cookies `__uzm*`) entre requests. Reintenta ante error de red /
 * 429 / 5xx; un 4xx (página inexistente) se propaga y el crawler salta el nodo.
 */
export async function fetchHtml(ctx: Ctx, path: string): Promise<string> {
  const { cfg, log } = ctx;
  const url = absolute(cfg.baseUrl, path);
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    await throttleWait(ctx.pjThrottle, "pj");
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": cfg.userAgent,
          ...BASE_HEADERS,
          Cookie: cookieHeader(ctx.cookieJar),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
      });
      storeCookies(ctx.cookieJar, res);

      if (res.ok) return await res.text();
      // 4xx (salvo 429) = permanente; 429/5xx = reintentable.
      throw new Error(`HTTP ${res.status} en ${url}`);
    } catch (e) {
      lastErr = e;
      const permanent = e instanceof Error && /HTTP 4\d\d/.test(e.message);
      if (permanent || attempt === cfg.maxRetries) break;
      const backoff = Math.min(cfg.backoffBase ** attempt, 30);
      log.warn(
        "GET %s falló (intento %d/%d), reintento en %ss: %s",
        url,
        attempt,
        cfg.maxRetries,
        backoff.toFixed(1),
        e instanceof Error ? e.message : String(e),
      );
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Descarga un PDF (descarga directa WCM, sin auth) con `fetch`. Devuelve los bytes. */
export async function downloadPdf(ctx: Ctx, url: string): Promise<Uint8Array> {
  const { cfg } = ctx;
  const full = absolute(cfg.baseUrl, url);

  const res = await fetch(full, {
    method: "GET",
    headers: {
      "User-Agent": cfg.userAgent,
      Cookie: cookieHeader(ctx.cookieJar),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
  });
  storeCookies(ctx.cookieJar, res);

  if (!res.ok) {
    throw new Error(`PDF HTTP ${res.status} en ${full}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
