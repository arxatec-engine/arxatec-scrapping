import * as shared from "../../../../services/gobpe";
import { INSTITUCION, TSC_RE } from "../../constants";
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
 * Página del buscador filtrada al TSC: de las ~168k normas de SERVIR solo
 * pasan las que contienen SERVIR/TSC en el número (fuera quedan PE, GG-ORH y
 * demás resoluciones institucionales). Cliente compartido.
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
  const docs: Doc[] = page.rules
    .filter((r) => TSC_RE.test(r.numero))
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
