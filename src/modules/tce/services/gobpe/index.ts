import * as shared from "../../../../services/gobpe";
import { INSTITUCION, TCE_RE } from "../../constants";
import type { Ctx, Doc } from "../../types";

function client(ctx: Ctx): shared.GobpeClient {
  return {
    userAgent: ctx.cfg.userAgent,
    maxRetries: ctx.cfg.maxRetries,
    backoffBase: ctx.cfg.backoffBase,
    throttle: ctx.gobpeThrottle,
    log: ctx.log,
  };
}

/**
 * Página del buscador de gob.pe filtrada al Tribunal: de las ~85.7k normas del
 * OECE solo pasan las que calzan el patrón TCP/TCE + sala (las PRE/GG
 * institucionales quedan fuera del alcance de esta fila). Cliente compartido.
 */
export async function fetchSearchPage(
  ctx: Ctx,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const page = await shared.fetchRulesPage(client(ctx), {
    institucion: INSTITUCION,
    sheet,
  });
  const docs: Doc[] = page.rules
    .filter((r) => TCE_RE.test(r.numero))
    .map((r) => ({
    gid: r.gid,
    numero: r.numero,
    sumilla: r.sumilla,
    publishedAt: r.publishedAt,
    pdfUrl: r.pdfUrl,
    path: r.path,
    }));
  return { docs, rawCount: page.rawCount };
}

export function downloadPdf(ctx: Ctx, url: string): Promise<Uint8Array> {
  return shared.downloadPdf(client(ctx), url);
}
