import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { downloadCsv, pickCsv } from "../services/datosabiertos";
import { decodeCp850, parseRows } from "../utils/csv";
import { newStats } from "../utils/stats";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Config, Ctx, Logger, Stats, StoredRecord } from "../types";

export async function run(cfg: Config, log: Logger): Promise<void> {
  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords<StoredRecord>(cfg.docsPath)) {
    if (ingest.isDone(rec)) processed.add(id);
  }
  if (processed.size) {
    log.info("Reanudando: %d documentos ya completados.", processed.size);
  }

  // 1. El índice: CSV del dataset de datosabiertos (sin tocar el sitio hostil).
  const csv = await pickCsv(cfg, log);
  const bytes = await downloadCsv(cfg, csv.url, log);
  const docs = parseRows(decodeCp850(bytes), log);
  log.info(
    'Índice "%s": %d dispositivos (%d ya completados).',
    csv.label,
    docs.length,
    docs.filter((d) => processed.has(d.op)).length
  );

  // 2. Catálogos locales (mismos que usa el matcher de todos los módulos).
  const idx = classifier.load(
    join(DATA_DIR, "groups.json"),
    join(DATA_DIR, "subgroups.json"),
    join(DATA_DIR, "entity.json")
  );
  log.info("Clasificador listo: %d entidades.", idx.entities.length);

  const browser = await launchBrowser();
  const ctx: Ctx = {
    cfg,
    log,
    idx,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
    visorThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  try {
    const sem = semaphore(cfg.concurrency);
    const tasks: Promise<void>[] = [];
    let nuevos = 0;
    for (const doc of docs) {
      if (processed.has(doc.op)) continue;
      processed.add(doc.op);
      tasks.push(ingest.processOne(ctx, doc, sem));
      nuevos += 1;
      if (cfg.limit && nuevos >= cfg.limit) {
        log.info("Tope de prueba alcanzado: %d documentos.", nuevos);
        break;
      }
    }
    await Promise.all(tasks);
    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
  }

  summary(cfg, log, ctx.stats, docs.length);
}

function summary(cfg: Config, log: Logger, stats: Stats, total: number): void {
  const latest = store.latestRecords<StoredRecord>(cfg.docsPath);
  let pendientes = 0;
  for (const r of latest.values()) if (!ingest.isDone(r)) pendientes += 1;

  log.info("=".repeat(60));
  log.info("RESUMEN FINAL (ingesta El Peruano)");
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Distribución de confianza de clasificación: %s", stats.conf);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), latest.size);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  const completo = latest.size >= total && pendientes === 0;
  if (completo && stats.procesados === 0) {
    log.info("✓ NADA NUEVO: el periodo ya estaba completo.");
  } else if (completo) {
    log.info("✓ COMPLETO: los %d dispositivos del periodo están listos.", total);
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: faltan ~%d del periodo. Re-ejecuta el MISMO comando para continuar.",
      Math.max(0, total - latest.size)
    );
  }
}
