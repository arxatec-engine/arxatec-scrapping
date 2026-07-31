import * as shared from "../../../../services/gobpe";
import { INSTITUCION, TFA_RE } from "../../constants";
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
 * Página de PUBLICACIONES del OEFA filtrada al TFA: las resoluciones del
 * Tribunal se publican como informes-publicaciones (items Report). El título
 * trae el número con prefijo ("Resolución Nº001-2011-OEFA/TFA") — se limpia.
 */
function limpiarNumero(titulo: string): string {
  return titulo.replace(/^resoluci[oó]n\s*(n[º°.]*\s*)?/i, "").trim();
}
export async function fetchSearchPage(
  ctx: Ctx,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const page = await shared.fetchRulesPage(client(ctx), {
    institucion: INSTITUCION,
    term: ctx.cfg.term,
    sheet,
    contenido: "publicaciones",
    tipo: "Report",
  });
  const docs: Doc[] = page.rules
    .filter((r) => TFA_RE.test(r.numero))
    .map((r) => ({
    gid: r.gid,
    numero: limpiarNumero(r.numero),
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
