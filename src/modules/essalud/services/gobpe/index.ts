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
 * Página del buscador con el stream COMPLETO de normas de ESSALUD (sin
 * filtro por sigla: la entidad no tiene tribunal propio que aislar).
 * Cliente compartido.
 */
export async function fetchSearchPage(
  ctx: Ctx,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const page = await shared.fetchRulesPage(client(ctx), {
    institucion: INSTITUCION,
    term: ctx.cfg.term,
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
