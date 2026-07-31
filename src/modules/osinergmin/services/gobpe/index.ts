import * as shared from "../../../../services/gobpe";
import { INSTITUCION } from "../../constants";
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
 * Página del buscador de gob.pe con TODAS las normas de OSINERGMIN (sin término:
 * el filtro por institución basta). Cliente compartido (src/services/gobpe).
 */
export async function fetchSearchPage(
  ctx: Ctx,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const page = await shared.fetchRulesPage(client(ctx), {
    institucion: INSTITUCION,
    sheet,
  });
  const docs: Doc[] = page.rules.map((r) => ({
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
