import type { Ctx, Stats } from "../../types";

export function newStats(): Stats {
  return { hojas: 0, procesados: 0, ingestados: 0, errores: 0, sinFecha: 0 };
}

export function maybeLogProgress(ctx: Ctx): void {
  const s = ctx.stats;
  if (s.procesados > 0 && s.procesados % ctx.cfg.progressEvery === 0) {
    ctx.log.info(
      "Progreso: %d hojas | %d procesados | %d ingestados | %d errores",
      s.hojas,
      s.procesados,
      s.ingestados,
      s.errores,
    );
  }
}
