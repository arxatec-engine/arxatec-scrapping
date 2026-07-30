import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { MIN_VISOR_BYTES, visorUrl } from "../../constants";
import type { Ctx } from "../../types";

/**
 * busquedas.elperuano.pe alterna nodos sanos (responden en ~0.2s) con nodos
 * muertos (cuelgan >60s) y 404/200-vacío espurios — verificado también con
 * Chrome real, así que no es fingerprint sino infraestructura degradada. La
 * táctica es opuesta a la de un sitio sano: timeout CORTO y varios reintentos
 * para volver a sortear el balanceador. Un 404 estable sí es permanente (el
 * OP no existe), pero solo se cree tras 2 confirmaciones.
 */
export async function fetchVisorHtml(ctx: Ctx, op: string): Promise<string> {
  const { cfg, log } = ctx;
  const url = visorUrl(op);
  let lastErr: unknown = null;
  let notFound = 0;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    await throttleWait(ctx.visorThrottle, "visor");
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": cfg.userAgent,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-PE,es;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
      });
      if (res.status === 404) {
        notFound += 1;
        if (notFound >= 2) throw new Error(`HTTP 404 estable en ${url}`);
        throw new Error(`HTTP 404 (posible espurio) en ${url}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const body = await res.text();
      if (body.length < MIN_VISOR_BYTES) {
        throw new Error(`cuerpo sospechosamente corto (${body.length}b) en ${url}`);
      }
      return body;
    } catch (e) {
      lastErr = e;
      const permanent = e instanceof Error && /404 estable/.test(e.message);
      if (permanent || attempt === cfg.maxRetries) break;
      const backoff = Math.min(cfg.backoffBase ** attempt, 20);
      log.warn(
        "Visor %s falló (intento %d/%d), reintento en %ss: %s",
        op,
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

/**
 * El visor devuelve un documento HTML completo con estilos embebidos. Para el
 * PDF (render.buildHtml arma su propio esqueleto) se extrae solo el interior
 * del <body>, sin los bloques <style>.
 */
export function extractBody(html: string): string {
  const sinStyle = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(sinStyle);
  return (m ? m[1] : sinStyle).trim();
}
