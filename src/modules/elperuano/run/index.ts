import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import * as ingest from "../utils/ingest";
import { runCuadernillo } from "./cuadernillo";
import { DATA_DIR } from "../config";
import { downloadCsv, pickCsvs, resolveCsvUrl } from "../services/datosabiertos";
import { decodeCp850, parseRows } from "../utils/csv";
import { newStats } from "../utils/stats";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Config, Ctx, Logger, Stats, StoredRecord } from "../types";

export async function run(cfg: Config, log: Logger): Promise<void> {
  // Modo actualización diaria: el boletín oficial (1 PDF/día), sin el índice CSV.
  if (cfg.cuadernillo) {
    await runCuadernillo(cfg, log);
    return;
  }

  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords<StoredRecord>(cfg.docsPath)) {
    if (ingest.isDone(rec)) processed.add(id);
  }
  if (processed.size) {
    log.info("Reanudando: %d documentos ya completados.", processed.size);
  }

  // 1. El índice: CSVs del dataset de datosabiertos (sin tocar el sitio hostil).
  //    Un periodo (default/--periodo) o toda la cola histórica (--todos, campaña).
  const plan = await pickCsvs(cfg, log);

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

  const opsVistos = new Set<string>();
  try {
    const sem = semaphore(cfg.concurrency);
    let nuevos = 0;
    let topeAlcanzado = false;

    for (const src of plan.sources) {
      // En campaña un recurso caído no debe tumbar la cola completa: se salta
      // y la SIGUIENTE pasada del supervisor lo reintenta (todo es idempotente).
      try {
        const url =
          src.url ?? (await resolveCsvUrl(cfg, { pageUrl: src.pageUrl! }, log));
        if (!url) {
          log.warn('Recurso "%s" sin .csv aún; se salta.', src.label);
          continue;
        }
        const bytes = await downloadCsv(cfg, url, log);
        const docs = parseRows(decodeCp850(bytes), log);
        for (const d of docs) opsVistos.add(d.op);
        const pendientes = docs.filter((d) => !processed.has(d.op));
        log.info(
          'Índice "%s": %d dispositivos, %d por procesar.',
          src.label,
          docs.length,
          pendientes.length
        );

        const tasks: Promise<void>[] = [];
        for (const doc of pendientes) {
          processed.add(doc.op);
          tasks.push(ingest.processOne(ctx, doc, sem));
          nuevos += 1;
          if (cfg.limit && nuevos >= cfg.limit) {
            topeAlcanzado = true;
            break;
          }
        }
        await Promise.all(tasks);
      } catch (e) {
        log.error(
          'Recurso "%s" falló (%s); continúo con el siguiente.',
          src.label,
          e instanceof Error ? e.message : e
        );
      }
      if (topeAlcanzado) {
        log.info("Tope de prueba alcanzado: %d documentos.", nuevos);
        break;
      }
      if (plan.soloPrimero) break;
    }

    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
  }

  summary(cfg, log, ctx.stats, opsVistos.size);
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
    log.info("✓ NADA NUEVO: lo enumerado ya estaba completo.");
  } else if (completo) {
    log.info("✓ COMPLETO: los %d dispositivos enumerados están listos.", total);
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: faltan ~%d de lo enumerado. Re-ejecuta el MISMO comando para continuar.",
      Math.max(0, total - latest.size)
    );
  }
}
