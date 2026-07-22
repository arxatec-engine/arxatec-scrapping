import { newThrottle, semaphore } from "../../../utils";
import * as store from "../../../utils/store";
import { buildIndex } from "../utils/catalog";
import { crawlLeaves } from "../utils/crawler";
import * as ingest from "../utils/ingest";
import { newStats } from "../utils/stats";
import type { Config, Ctx, Leaf, Logger, Stats, StoredRecord } from "../types";

export async function run(cfg: Config, log: Logger): Promise<void> {
  const idx = buildIndex();
  log.info(
    "Catálogo PJ: issuer=%s court=%s",
    idx.issuer.issuerId ?? "(no encontrado)",
    idx.issuer.courtId ?? "(no encontrado)",
  );

  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords<StoredRecord>(cfg.docsPath)) {
    if (ingest.isDone(rec)) processed.add(id);
  }
  if (processed.size) {
    log.info("Reanudando: %d documentos ya completados.", processed.size);
  }

  const ctx: Ctx = {
    cfg,
    log,
    idx,
    stats: newStats(),
    pjThrottle: newThrottle(cfg.minDelay),
    ingestThrottle: newThrottle(0),
    cookieJar: new Map<string, string>(),
  };
  ingest.prepare(ctx);

  const sem = semaphore(cfg.concurrency);
  let nuevos = 0;

  await crawlLeaves(
    ctx,
    async (leaf: Leaf) => {
      let target = leaf;
      if (cfg.limit) {
        const remaining = cfg.limit - nuevos;
        if (remaining <= 0) return;
        target = { ...leaf, docs: leaf.docs.slice(0, remaining) };
      }
      const before = ctx.stats.procesados;
      await ingest.ingestLeaf(ctx, target, sem, processed);
      nuevos += ctx.stats.procesados - before;
      if (cfg.limit && nuevos >= cfg.limit) {
        log.info("Tope de prueba alcanzado: %d documentos. Termino.", nuevos);
      }
    },
    () => !cfg.limit || nuevos < cfg.limit,
  );

  summary(cfg, log, ctx.stats);
}

export function summary(cfg: Config, log: Logger, stats: Stats): void {
  const latest = store.latestRecords<StoredRecord>(cfg.docsPath);
  let pendientes = 0;
  for (const r of latest.values()) if (!ingest.isDone(r)) pendientes += 1;

  log.info("=".repeat(60));
  log.info("RESUMEN FINAL (PJ jurisprudencia)");
  log.info("  Hojas recorridas (esta corrida): %d", stats.hojas);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.ingestados);
  log.info("  Errores: %d (de ellos %d sin fecha)", stats.errores, stats.sinFecha);
  log.info("  Total en ledger: %d | pendientes: %d", latest.size, pendientes);
  log.info(
    "  Estado: %s (reanudable con el mismo comando)",
    pendientes === 0 ? "COMPLETO" : "PARCIAL",
  );
  log.info("=".repeat(60));
}
