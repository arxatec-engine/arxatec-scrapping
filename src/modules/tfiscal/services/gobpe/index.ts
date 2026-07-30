import * as shared from "../../../../services/gobpe";
import { RTF_RE } from "../../constants";
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
 * Página del buscador filtrada a RTF: el término también trae decretos y
 * páginas que hablan del Tribunal — solo pasan los `Rule` cuyo número calza
 * el patrón RTF. El cliente gob.pe es el compartido (src/services/gobpe).
 */
export async function fetchSearchPage(
  ctx: Ctx,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const page = await shared.fetchRulesPage(client(ctx), {
    institucion: "mef",
    term: ctx.cfg.term,
    sheet,
  });
  const docs: Doc[] = page.rules
    .filter((r) => RTF_RE.test(r.numero))
    .map((r) => ({
      gid: r.gid,
      rtf: r.numero,
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
