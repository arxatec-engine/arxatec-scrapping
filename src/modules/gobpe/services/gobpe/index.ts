import * as shared from "../../../../services/gobpe";
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

/** "2026-07-30" (ISO) → "30-07-2026" (formato desde/hasta del buscador). */
export function fechaBuscador(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Fecha inválida (esperaba YYYY-MM-DD): "${iso}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Página del stream GLOBAL de normas dentro de una ventana de fechas (sin
 * institución). Cliente compartido; los slugs excluidos se filtran aquí.
 */
export async function fetchSearchPage(
  ctx: Ctx,
  desdeIso: string,
  hastaIso: string,
  sheet: number
): Promise<{ docs: Doc[]; rawCount: number }> {
  const page = await shared.fetchRulesPage(client(ctx), {
    sheet,
    desde: fechaBuscador(desdeIso),
    hasta: fechaBuscador(hastaIso),
  });
  const excluidos = new Set(ctx.cfg.excluir);
  const docs: Doc[] = page.rules
    .filter((r) => r.institucion && !excluidos.has(r.institucion))
    .map((r) => ({
      gid: r.gid,
      institucion: r.institucion,
      entidadLabel: r.entidad,
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
