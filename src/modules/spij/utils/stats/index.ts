import type { Ctx, Stats } from "../../types";

export function newStats(): Stats {
  return { procesados: 0, descargados: 0, errores: 0, conf: {} };
}

export function bumpConf(stats: Stats, key: string): void {
  stats.conf[key] = (stats.conf[key] ?? 0) + 1;
}

export function maybeLogProgress(ctx: Ctx): void {
  const s = ctx.stats;
  if (s.procesados % ctx.cfg.progressEvery === 0) {
    ctx.log.info(
      "Progreso: %d procesados | %d ok | %d errores | conf=%s",
      s.procesados,
      s.descargados,
      s.errores,
      s.conf,
    );
  }
}
